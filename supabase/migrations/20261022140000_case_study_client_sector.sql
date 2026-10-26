-- Client Settore: one sector per client, from a shared list anyone may add to (owner,
-- 2026-10-21/22). Forward-only (AD-12); runs as one transaction. No applied migration
-- is edited: `create_client` and `update_client` are dropped and recreated with one
-- sector in place of the industries list.
--
-- The fixed list of four becomes the `client_sector` table, seeded with today's keys
-- and Italian labels. Owners and designers add sectors (`add_client_sector`); a new
-- one is seen by everybody. A client stores one sector (`client.industry`); a client
-- with several keeps the first in today's list order (Interior design, Energia,
-- Risorse umane, Lusso), a client with none stays without one (unfinished).
-- Sectors are never renamed or deleted.

-- ---------------------------------------------------------------------------
-- client_sector: the shared list
-- ---------------------------------------------------------------------------

create table public.client_sector (
  -- Stable key: the seeded ones keep today's keys; a new one is made from its label.
  key text primary key constraint client_sector_key_check check (key ~ '^[a-z0-9_]{1,48}$'),
  -- As shown: whitespace collapsed to single spaces, trimmed, 2–40 characters (code
  -- points). Must match `CLIENT_SECTOR_LABEL_MIN` / `_MAX` in case-study/domain/case-study.ts.
  label text not null constraint client_sector_label_check check (
    label = btrim(regexp_replace(label, '\s+', ' ', 'g')) and char_length(label) between 2 and 40
  ),
  -- `client_name_key(label)`: two labels differing only in case, accents or spaces are one sector.
  label_key text not null constraint client_sector_label_key_key unique,
  -- Display order: the seeded four first, then the added ones as they were added.
  position integer not null constraint client_sector_position_key unique check (position >= 1),
  -- Who added it; null for the seeded four.
  created_by uuid null constraint client_sector_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now()
);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches it.
alter table public.client_sector enable row level security;
revoke all on table public.client_sector from anon, authenticated;

insert into public.client_sector (key, label, label_key, position) values
  ('interior_design', 'Interior design', public.client_name_key('Interior design'), 1),
  ('energia', 'Energia', public.client_name_key('Energia'), 2),
  ('risorse_umane', 'Risorse umane', public.client_name_key('Risorse umane'), 3),
  ('lusso', 'Lusso', public.client_name_key('Lusso'), 4);

-- ---------------------------------------------------------------------------
-- client.industry replaces client.industries
-- ---------------------------------------------------------------------------

-- Null only for a client that never had a sector (unfinished); `create_client` and
-- `update_client` always write one.
alter table public.client
  add column industry text null constraint client_industry_fkey references public.client_sector (key);

-- Several sectors: the first in today's list order. The backfill is not an edit, so
-- `updated_at` stays as it was.
alter table public.client disable trigger client_touch_updated_at;

update public.client
   set industry = case
     when 'interior_design' = any (industries) then 'interior_design'
     when 'energia' = any (industries) then 'energia'
     when 'risorse_umane' = any (industries) then 'risorse_umane'
     when 'lusso' = any (industries) then 'lusso'
   end
 where cardinality(industries) > 0;

alter table public.client enable trigger client_touch_updated_at;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- As `20261019180000_case_study_client_delete.sql`, with one sector key in place of
-- the industries: a null or unknown key raises P0001 `CLIENT_FIELD_INVALID` with
-- DETAIL `industry` (the foreign key is the backstop). Service role only.
drop function public.create_client(text, text[], text, uuid);

create function public.create_client(p_name text, p_industry text, p_description text, p_actor_id uuid)
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

  if exists (
    select 1 from public.client where name_key = public.client_name_key(p_name) and deleted_at is null
  ) then
    raise exception 'CLIENT_NAME_TAKEN' using errcode = 'P0001';
  end if;
  if public.client_info_text(p_description) is null then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'description';
  end if;
  if p_industry is null or not exists (select 1 from public.client_sector where key = p_industry) then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'industry';
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
    -- Every row, deleted ones included: codes are never reused.
    if not exists (select 1 from public.client where code = candidate) then
      -- `name_key` is set by the `client_set_name_key` trigger.
      insert into public.client (name, code, industry, description, created_by)
      values (
        btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
        candidate,
        p_industry,
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

-- As `20261019180000_case_study_client_delete.sql`, with one sector key in place of
-- the industries (null or unknown: P0001 `CLIENT_FIELD_INVALID`, DETAIL `industry`).
-- Service role only.
drop function public.update_client(uuid, text, text[], text, uuid, uuid);

create function public.update_client(
  p_client_id uuid,
  p_name text,
  p_industry text,
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

  if not exists (select 1 from public.client where id = p_client_id and deleted_at is null) then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.client
     where name_key = public.client_name_key(p_name) and id <> p_client_id and deleted_at is null
  ) then
    raise exception 'CLIENT_NAME_TAKEN' using errcode = 'P0001';
  end if;
  if public.client_info_text(p_description) is null then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'description';
  end if;
  if p_industry is null or not exists (select 1 from public.client_sector where key = p_industry) then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'industry';
  end if;
  if p_logo_id is null then
    raise exception 'CLIENT_FIELD_INVALID' using errcode = 'P0001', detail = 'logoId';
  end if;
  if not exists (select 1 from public.client_logo where id = p_logo_id and client_id = p_client_id) then
    raise exception 'CLIENT_LOGO_INVALID' using errcode = 'P0001';
  end if;

  update public.client
     set name = btrim(regexp_replace(p_name, '\s+', ' ', 'g')),
         industry = p_industry,
         description = public.client_info_text(p_description),
         logo_id = p_logo_id
   where id = p_client_id
  returning * into updated;
  return updated;
end;
$$;

-- Adds a sector to the shared list and returns it; when a sector with the same name
-- already exists (ignoring case, accents and extra spaces: `client_name_key`), returns
-- that one and writes nothing. The label is stored with whitespace collapsed and
-- trimmed; outside 2–40 characters it raises P0001 `SECTOR_LABEL_INVALID`, and without an
-- actor P0001 `SECTOR_ACTOR_REQUIRED`. The key is
-- made from the label (`a-z`, `0-9`, `_`; `settore` when nothing is left), with `_2`,
-- `_3`… when taken; the position is the next one. The advisory lock serialises adds,
-- so two at once can't take the same key, name or position; the unique keys are the
-- backstop. Service role only.
create function public.add_client_sector(p_label text, p_actor_id uuid)
returns public.client_sector
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized text;
  v_label_key text;
  base text;
  candidate text;
  attempt integer := 1;
  existing public.client_sector;
  created public.client_sector;
begin
  if p_actor_id is null then
    raise exception 'SECTOR_ACTOR_REQUIRED' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.client_sector'));

  normalized := btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'));
  if char_length(normalized) not between 2 and 40 then
    raise exception 'SECTOR_LABEL_INVALID' using errcode = 'P0001';
  end if;
  v_label_key := public.client_name_key(normalized);

  select * into existing from public.client_sector s where s.label_key = v_label_key;
  if found then
    return existing;
  end if;

  -- Trimmed of `_` after the cut too, so a key never ends in one.
  base := btrim(left(btrim(regexp_replace(v_label_key, '[^a-z0-9]+', '_', 'g'), '_'), 40), '_');
  if base = '' then
    base := 'settore';
  end if;
  candidate := base;
  while exists (select 1 from public.client_sector s where s.key = candidate) loop
    attempt := attempt + 1;
    candidate := base || '_' || attempt::text;
  end loop;

  insert into public.client_sector (key, label, label_key, position, created_by)
  values (
    candidate,
    normalized,
    v_label_key,
    (select coalesce(max(s.position), 0) + 1 from public.client_sector s),
    p_actor_id
  )
  returning * into created;
  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drop the old list
-- ---------------------------------------------------------------------------

alter table public.client drop constraint client_industries_check;
alter table public.client drop column industries;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.create_client(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_client(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_client_sector(text, uuid) from public, anon, authenticated;

grant execute on function public.create_client(text, text, text, uuid) to service_role;
grant execute on function public.update_client(uuid, text, text, text, uuid, uuid) to service_role;
grant execute on function public.add_client_sector(text, uuid) to service_role;
