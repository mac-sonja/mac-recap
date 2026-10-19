-- Story 2.15: the client wizard and its details step (SCP 2026-10-19).
-- Forward-only (AD-12); runs as one transaction. No applied migration is edited:
-- `create_client` and `update_client` are dropped and recreated with industries
-- in place of the free-text sector.
--
-- Every client field is required by the app: name, industries (one or more from a
-- fixed list), description (≤400), logo, and the brief (context, solution, results,
-- each ≤5000). Lengths are counted in characters (code points: `char_length`) after
-- trimming, like the TypeScript checks (`CLIENT_DESCRIPTION_MAX`, `CLIENT_BRIEF_MAX`).
--
-- Legacy dev clients (made under Story 2.14) have no industries and no brief. The
-- industries check is added `NOT VALID` so they stay: every insert and every update
-- that writes a row is still checked, and the wizard always writes `industries`.
-- Description and logo stay nullable in the table for the same rows; both RPCs refuse
-- a create or update without them.

-- ---------------------------------------------------------------------------
-- client.industries replaces client.sector
-- ---------------------------------------------------------------------------

-- Must list exactly `CLIENT_INDUSTRIES` in case-study/domain/case-study.ts.
alter table public.client
  add column industries text[] not null default '{}';

alter table public.client
  add constraint client_industries_check check (
    cardinality(industries) >= 1
    and industries <@ array['interior_design', 'energia', 'risorse_umane', 'lusso']::text[]
  ) not valid;

alter table public.client drop constraint client_sector_check;
alter table public.client drop column sector;

-- ---------------------------------------------------------------------------
-- client_brief: context, solution and results, one row per client
-- ---------------------------------------------------------------------------

-- Modelled on `context_form`. Texts are stored as given ('' means empty); the limit
-- counts the trimmed text. The row is created by the first save that changes something.
create table public.client_brief (
  client_id uuid primary key constraint client_brief_client_id_fkey references public.client (id),
  -- Must list exactly CLIENT_BRIEF_FIELDS in case-study/domain/case-study.ts (CLIENT_BRIEF_MAX).
  context text not null default ''
    constraint client_brief_context_check check (char_length(btrim(context, E' \t\n\r\f\v')) <= 5000),
  solution text not null default ''
    constraint client_brief_solution_check check (char_length(btrim(solution, E' \t\n\r\f\v')) <= 5000),
  results text not null default ''
    constraint client_brief_results_check check (char_length(btrim(results, E' \t\n\r\f\v')) <= 5000),
  updated_by uuid not null constraint client_brief_updated_by_fkey references public.profile (id),
  updated_at timestamptz not null default now()
);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches it.
alter table public.client_brief enable row level security;
revoke all on table public.client_brief from anon, authenticated;

-- updated_at follows every update.
create function public.client_brief_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_brief_touch_updated_at
  before update on public.client_brief
  for each row execute function public.client_brief_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Replaces `create_client(text, text, text, uuid)` (Story 2.14) with the same code
-- rules (AD-21 rule 3), industries in place of the sector, and a required
-- description. Raises P0001 `CLIENT_NAME_TAKEN`, `CLIENT_CODE_EXHAUSTED` or
-- `CLIENT_FIELD_INVALID` (blank description; its DETAIL names the field); industries
-- outside the list or none fail `client_industries_check`, a description over 400
-- characters fails `client_description_check`; nothing is written then. The logo is
-- linked afterwards through `update_client`. Service role only.
drop function public.create_client(text, text, text, uuid);

create function public.create_client(p_name text, p_industries text[], p_description text, p_actor_id uuid)
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
  if public.client_info_text(p_description) is null then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'description';
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
      insert into public.client (name, code, industries, description, created_by)
      values (
        btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
        candidate,
        coalesce(p_industries, '{}'),
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

-- Replaces `update_client(uuid, text, text, text, uuid, uuid)` (Story 2.14): updates
-- a client's name, industries, description and current logo; its code never changes
-- (AD-21 rule 3). Description and logo are required now: a blank description or a
-- null logo raises P0001 `CLIENT_FIELD_INVALID` (its DETAIL names the field). Also
-- raises P0001 `CLIENT_NOT_FOUND`, `CLIENT_NAME_TAKEN` or `CLIENT_LOGO_INVALID`
-- (unknown logo, or another client's); industries outside the list or none fail
-- `client_industries_check`, a description over 400 characters fails
-- `client_description_check`; nothing is written then. Client changes are not case
-- events. Service role only.
drop function public.update_client(uuid, text, text, text, uuid, uuid);

create function public.update_client(
  p_client_id uuid,
  p_name text,
  p_industries text[],
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
  if public.client_info_text(p_description) is null then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'description';
  end if;
  if p_logo_id is null then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'logoId';
  end if;
  if not exists (select 1 from public.client_logo where id = p_logo_id and client_id = p_client_id) then
    raise exception 'CLIENT_LOGO_INVALID' using errcode = 'P0001';
  end if;

  update public.client
     set name = btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
         industries = coalesce(p_industries, '{}'),
         description = public.client_info_text(p_description),
         logo_id = p_logo_id
   where id = p_client_id
  returning * into updated;
  return updated;
end;
$$;

-- Saves one brief field of a client and returns the field's previous text ('' when
-- the client has no row yet). The other fields are untouched; the row is created on
-- the first save. Saving the stored text again writes nothing (and a first save of ''
-- creates no row). Serialized per client. Raises P0001 `CLIENT_NOT_FOUND` (unknown
-- client) or `UNKNOWN_FIELD` (a field other than context, solution, results); a text
-- over 5000 characters after trimming fails its `client_brief_*_check`; nothing is
-- written then. Service role only.
create function public.save_client_brief_field(
  p_client_id uuid,
  p_field text,
  p_text text,
  p_actor_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_row boolean;
  previous text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('client_brief:' || coalesce(p_client_id::text, ''), 0)
  );

  perform 1 from public.client where id = p_client_id;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_field is null or p_field not in ('context', 'solution', 'results') then
    raise exception 'UNKNOWN_FIELD' using errcode = 'P0001';
  end if;

  select
    case p_field when 'context' then b.context when 'solution' then b.solution else b.results end
  into previous
  from public.client_brief b
  where b.client_id = p_client_id
  for update;
  has_row := found;
  previous := coalesce(previous, '');

  if previous = p_text then
    return previous;
  end if;

  if has_row then
    update public.client_brief set
      context = case when p_field = 'context' then p_text else context end,
      solution = case when p_field = 'solution' then p_text else solution end,
      results = case when p_field = 'results' then p_text else results end,
      updated_by = p_actor_id
    where client_id = p_client_id;
  else
    insert into public.client_brief (client_id, context, solution, results, updated_by)
    values (
      p_client_id,
      case when p_field = 'context' then p_text else '' end,
      case when p_field = 'solution' then p_text else '' end,
      case when p_field = 'results' then p_text else '' end,
      p_actor_id
    );
  end if;

  return previous;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.client_brief_touch_updated_at() from public, anon, authenticated;
revoke all on function public.create_client(text, text[], text, uuid) from public, anon, authenticated;
revoke all on function public.update_client(uuid, text, text[], text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_client_brief_field(uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.create_client(text, text[], text, uuid) to service_role;
grant execute on function public.update_client(uuid, text, text[], text, uuid, uuid) to service_role;
grant execute on function public.save_client_brief_field(uuid, text, text, uuid) to service_role;
