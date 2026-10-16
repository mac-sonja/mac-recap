-- Story 2.14: client info (description, sector and logo) (AD-22, AR24,
-- Sprint Change Proposal 2026-10-16). Forward-only (AD-12); runs as one
-- transaction. No applied migration is edited: `create_client` is recreated
-- with the new optional fields and `rename_client` is replaced by `update_client`.
--
-- Lengths are counted in characters (code points: `char_length`) after trimming,
-- like the TypeScript check (`CLIENT_SECTOR_MAX`, `CLIENT_DESCRIPTION_MAX`).
-- A blank value is stored as null. Logo limits (`LOGO_*` in
-- case-study/domain/case-study.ts): PNG, JPEG or WebP, 1 B–5 MB. Rows in
-- `client_logo` are never updated or deleted, so an old revision always finds its logo.

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

alter table public.client
  add column description text null
    constraint client_description_check check (description is null or char_length(btrim(description)) between 1 and 400),
  add column sector text null
    constraint client_sector_check check (sector is null or char_length(btrim(sector)) between 1 and 60);

-- One uploaded logo object under `clients/{clientId}/logos/{logoId}.{ext}`
-- (the key is built by the case-study adapter). Append-only.
create table public.client_logo (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null constraint client_logo_client_id_fkey references public.client (id),
  path text not null constraint client_logo_path_key unique check (btrim(path) <> ''),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  created_by uuid not null constraint client_logo_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now()
);

create index client_logo_client_id_idx on public.client_logo (client_id);

-- Backstop: the browser never queries tables (same as `client`).
alter table public.client_logo enable row level security;
revoke all on table public.client_logo from anon, authenticated;

-- The client's current logo; null when it has none. Existing clients start empty.
alter table public.client
  add column logo_id uuid null constraint client_logo_id_fkey references public.client_logo (id);

-- ---------------------------------------------------------------------------
-- Append-only `client_logo`
-- ---------------------------------------------------------------------------

create function public.client_logo_reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'client_logo rows are never updated or deleted (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger client_logo_reject_update_delete
  before update or delete on public.client_logo
  for each row execute function public.client_logo_reject_change();

create trigger client_logo_reject_truncate
  before truncate on public.client_logo
  for each statement execute function public.client_logo_reject_change();

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Trims an optional text field; blank becomes null.
create function public.client_info_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(p_text, E' \t\n\r\f\v'), '');
$$;

-- Replaces `create_client(text, uuid)` (Story 2.12) with the same code rules
-- (AD-21 rule 3) plus the optional sector and description. Raises P0001
-- `CLIENT_NAME_TAKEN` or `CLIENT_CODE_EXHAUSTED`; a sector or description over
-- its limit fails the column check; nothing is written then. Service role only.
drop function public.create_client(text, uuid);

create function public.create_client(p_name text, p_sector text, p_description text, p_actor_id uuid)
returns public.client
language plpgsql
security invoker
set search_path = ''
as $$
declare
  letters text;
  candidate text;
  candidates text[];
  suffix integer;
  created public.client;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.client'));

  if exists (select 1 from public.client where name_key = public.client_name_key(p_name)) then
    raise exception 'CLIENT_NAME_TAKEN' using errcode = 'P0001';
  end if;

  letters := public.client_code_letters(p_name);
  candidates := array[left(letters, 3)];
  if length(letters) >= 4 then
    candidates := candidates || left(letters, 4);
  end if;
  for suffix in 0..25 loop
    candidates := candidates || (left(letters, 3) || chr(ascii('A') + suffix));
  end loop;

  foreach candidate in array candidates loop
    if not exists (select 1 from public.client where code = candidate) then
      -- `name_key` is set by the `client_set_name_key` trigger.
      insert into public.client (name, code, sector, description, created_by)
      values (
        btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
        candidate,
        public.client_info_text(p_sector),
        public.client_info_text(p_description),
        p_actor_id
      )
      returning * into created;
      return created;
    end if;
  end loop;

  raise exception 'CLIENT_CODE_EXHAUSTED' using errcode = 'P0001';
end;
$$;

-- The dialog's save path replaces the rename-only one.
drop function public.rename_client(uuid, text, uuid);

-- Updates a client's name, sector, description and current logo; its code never
-- changes (AD-21 rule 3). `p_logo_id` null clears the logo; a non-null one must
-- be a `client_logo` row of this client. Raises P0001 `CLIENT_NOT_FOUND`,
-- `CLIENT_NAME_TAKEN` (another client has the name key) or `CLIENT_LOGO_INVALID`
-- (unknown logo, or another client's); a sector or description over its limit
-- fails the column check; nothing is written then. Old logo rows and objects stay.
-- Client changes are not case events. Service role only.
create function public.update_client(
  p_client_id uuid,
  p_name text,
  p_sector text,
  p_description text,
  p_logo_id uuid,
  p_actor_id uuid
)
returns public.client
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.client;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.client'));

  if not exists (select 1 from public.client where id = p_client_id) then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.client where name_key = public.client_name_key(p_name) and id <> p_client_id
  ) then
    raise exception 'CLIENT_NAME_TAKEN' using errcode = 'P0001';
  end if;
  if p_logo_id is not null
     and not exists (select 1 from public.client_logo where id = p_logo_id and client_id = p_client_id) then
    raise exception 'CLIENT_LOGO_INVALID' using errcode = 'P0001';
  end if;

  update public.client
     set name = btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
         sector = public.client_info_text(p_sector),
         description = public.client_info_text(p_description),
         logo_id = p_logo_id
   where id = p_client_id
  returning * into updated;
  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.client_logo_reject_change() from public, anon, authenticated;
revoke all on function public.client_info_text(text) from public, anon, authenticated;
revoke all on function public.create_client(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_client(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.client_info_text(text) to service_role;
grant execute on function public.create_client(text, text, text, uuid) to service_role;
grant execute on function public.update_client(uuid, text, text, text, uuid, uuid) to service_role;
