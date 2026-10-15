-- Story 2.12: clients as records, with readable case history codes (AD-21,
-- Sprint Change Proposal 2026-10-15). Forward-only (AD-12); runs as one
-- transaction, so any failure (the completeness check included) applies nothing.
--
-- Every AD-21 rule lives here, once: `client_name_key` (rule 2),
-- `client_code_letters` (rule 1), `create_client` (rule 3), `case_study_code`
-- (rule 6) and `create_case_study` (rules 4 and 5). The backfill below uses the
-- same functions as the app. TypeScript never computes a code.
--
-- Order: extension, tables, columns, functions (the old `create_case_study`
-- signature is dropped), backfill of the free-text clients, completeness check,
-- counter seed, NOT NULL and unique keys, drop of `case_study.client`, immutability triggers.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.client (
  id uuid primary key default gen_random_uuid(),
  -- Non-blank only; the 1–120 length is TS validation, so a long legacy name
  -- can't abort the backfill.
  name text not null check (btrim(name) <> ''),
  -- Set from `name` by `client_set_name_key` (rule 2); never written directly.
  name_key text not null constraint client_name_key_key unique,
  -- Automatic, fixed, never reused (rule 3).
  code text not null constraint client_code_key unique check (code ~ '^[A-Z]{3,4}$'),
  created_by uuid not null constraint client_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Last number used per (client, case year) (rule 4). The row lock taken by
-- `insert … on conflict do update` serialises creates for one pair only.
create table public.case_number_counter (
  client_id uuid not null constraint case_number_counter_client_id_fkey references public.client (id),
  year integer not null check (year between 1900 and 2100),
  last_number integer not null check (last_number >= 1),
  primary key (client_id, year)
);

-- Backstop: the browser never queries tables (same as case_study).
alter table public.client enable row level security;
alter table public.case_number_counter enable row level security;
revoke all on table public.client from anon, authenticated;
revoke all on table public.case_number_counter from anon, authenticated;

-- Nullable until the backfill has filled them; NOT NULL and unique keys follow.
alter table public.case_study
  add column client_id uuid null constraint case_study_client_id_fkey references public.client (id),
  add column number integer null check (number >= 1),
  add column code text null;

-- ---------------------------------------------------------------------------
-- AD-21 rules
-- ---------------------------------------------------------------------------

-- Rule 2: trim, collapse whitespace, lowercase, strip accents.
create function public.client_name_key(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select extensions.unaccent(
    'extensions.unaccent'::regdictionary,
    lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')))
  );
$$;

-- Rule 1: strip accents and uppercase; remove dots; drop the whole-word legal
-- suffixes (kept if that leaves no letters); keep only A–Z, joined; pad to 3
-- with X. Returns every letter (at least 3); `create_client` takes the prefixes.
create function public.client_code_letters(p_name text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  legal_suffixes constant text[] := array[
    'SRL', 'SRLS', 'SPA', 'SAPA', 'SAS', 'SNC', 'SS', 'SCARL', 'SCRL', 'SCPA', 'COOP', 'ONLUS', 'ETS', 'APS',
    'GMBH', 'AG', 'KG', 'LTD', 'LLC', 'LLP', 'INC', 'CORP', 'CO', 'SA', 'SARL', 'SL', 'BV', 'NV', 'PLC'
  ];
  normalized text;
  word text;
  kept text := '';
  every_letter text := '';
begin
  normalized := replace(upper(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_name, ''))), '.', '');
  -- Words are runs of letters and digits; anything else separates them.
  foreach word in array regexp_split_to_array(normalized, '[^A-Z0-9]+') loop
    continue when word = '';
    every_letter := every_letter || regexp_replace(word, '[^A-Z]', '', 'g');
    if not (word = any (legal_suffixes)) then
      kept := kept || regexp_replace(word, '[^A-Z]', '', 'g');
    end if;
  end loop;
  if kept = '' then
    kept := every_letter;
  end if;
  if length(kept) < 3 then
    kept := rpad(kept, 3, 'X');
  end if;
  return kept;
end;
$$;

-- Rule 6: `{clientCode}-{year}-{number}`, number padded to at least 2 digits.
create function public.case_study_code(p_client_code text, p_year integer, p_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_client_code || '-' || p_year::text || '-'
    || case when p_number < 10 then '0' || p_number::text else p_number::text end;
$$;

-- `name_key` always follows `name`.
create function public.client_set_name_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name_key := public.client_name_key(new.name);
  return new;
end;
$$;

create trigger client_set_name_key
  before insert or update of name on public.client
  for each row execute function public.client_set_name_key();

create function public.client_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_touch_updated_at
  before update on public.client
  for each row execute function public.client_touch_updated_at();

-- Rule 3: creates a client (name stored with whitespace collapsed to single
-- spaces and trimmed) with the first free code among: the first 3 letters,
-- the first 4 (when there are 4 or more), the first 3 plus A…Z. Raises P0001
-- `CLIENT_NAME_TAKEN` (same name key) or `CLIENT_CODE_EXHAUSTED`; nothing is
-- written then. The transaction-level advisory lock serialises client creates
-- and renames, so two at once can't pick the same code or name key; the unique
-- indexes are the backstop. Service role only.
create function public.create_client(p_name text, p_actor_id uuid)
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
      insert into public.client (name, code, created_by)
      values (btrim(regexp_replace(p_name, '\s+', ' ', 'g')), candidate, p_actor_id)
      returning * into created;
      return created;
    end if;
  end loop;

  raise exception 'CLIENT_CODE_EXHAUSTED' using errcode = 'P0001';
end;
$$;

-- Renames a client; its code never changes (rule 3). Raises P0001
-- `CLIENT_NOT_FOUND` or `CLIENT_NAME_TAKEN` (another client has the name key);
-- nothing is written then. `p_actor_id` is the acting profile: client changes
-- are not case events, and `client` keeps only `created_by` and `updated_at`.
-- Service role only.
create function public.rename_client(p_client_id uuid, p_name text, p_actor_id uuid)
returns public.client
language plpgsql
security invoker
set search_path = ''
as $$
declare
  renamed public.client;
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

  update public.client set name = btrim(regexp_replace(p_name, '\s+', ' ', 'g')) where id = p_client_id returning * into renamed;
  return renamed;
end;
$$;

-- Replaces `create_case_study(text, text, integer, text, uuid)` (Story 2.5).
drop function public.create_case_study(text, text, integer, text, uuid);

-- Creates a case with the next number for (client, year) and its fixed code,
-- plus its `case_created` event, in one transaction (rules 4–6). Raises P0001
-- `CLIENT_NOT_FOUND` for an unknown client; nothing is written then. A failed
-- create rolls the counter back with it, so it leaves no gap. Service role only.
create function public.create_case_study(
  p_name text,
  p_client_id uuid,
  p_year integer,
  p_locale text,
  p_actor_id uuid
)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner public.client;
  next_number integer;
  created public.case_study;
begin
  select * into owner from public.client where id = p_client_id;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.case_number_counter as counter (client_id, year, last_number)
  values (p_client_id, p_year, 1)
  on conflict (client_id, year) do update set last_number = counter.last_number + 1
  returning counter.last_number into next_number;

  insert into public.case_study (name, client_id, year, locale, created_by, number, code)
  values (
    p_name,
    p_client_id,
    p_year,
    coalesce(p_locale, 'it'),
    p_actor_id,
    next_number,
    public.case_study_code(owner.code, p_year, next_number)
  )
  returning * into created;

  insert into public.case_event (case_id, actor_id, type, data)
  values (
    created.id,
    p_actor_id,
    'case_created',
    jsonb_build_object(
      'name', created.name,
      'client', owner.name,
      'clientId', owner.id,
      'clientCode', owner.code,
      'code', created.code,
      'year', created.year,
      'locale', created.locale
    )
  );

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill of the free-text clients (every case, soft-deleted included)
-- ---------------------------------------------------------------------------

-- The backfill must leave `updated_at` as it is.
alter table public.case_study disable trigger case_study_touch_updated_at;

-- One client per name key, named with the spelling of the group's earliest
-- case (whitespace collapsed and trimmed by `create_client`) and created by that case's author. Clients are created in order
-- of their earliest case, so the oldest gets the shortest code.
do $$
declare
  grp record;
begin
  for grp in
    select earliest.client, earliest.created_by
      from (
        select distinct on (public.client_name_key(cs.client))
               cs.client, cs.created_by, cs.created_at, cs.id
          from public.case_study cs
         order by public.client_name_key(cs.client), cs.created_at, cs.id
      ) earliest
     order by earliest.created_at, earliest.id
  loop
    perform public.create_client(grp.client, grp.created_by);
  end loop;
end;
$$;

update public.case_study cs
   set client_id = c.id
  from public.client c
 where c.name_key = public.client_name_key(cs.client);

-- Numbers per (client, year) by created_at, then id; the code follows.
update public.case_study cs
   set number = numbered.number,
       code = public.case_study_code(c.code, cs.year, numbered.number)
  from (
    select id, row_number() over (partition by client_id, year order by created_at, id)::integer as number
      from public.case_study
  ) numbered,
       public.client c
 where numbered.id = cs.id
   and c.id = cs.client_id;

alter table public.case_study enable trigger case_study_touch_updated_at;

-- Completeness check: abort (nothing applied) if any case lacks a client or code.
do $$
declare
  incomplete integer;
begin
  select count(*) into incomplete
    from public.case_study
   where client_id is null or number is null or code is null;
  if incomplete > 0 then
    raise exception 'case history code backfill incomplete: % case(s) without client_id, number or code', incomplete;
  end if;
end;
$$;

-- Each (client, year) counter starts at that pair's highest backfilled number.
insert into public.case_number_counter (client_id, year, last_number)
select client_id, year, max(number)
  from public.case_study
 group by client_id, year;

-- ---------------------------------------------------------------------------
-- Keys, then the free-text column goes
-- ---------------------------------------------------------------------------

alter table public.case_study
  alter column client_id set not null,
  alter column number set not null,
  alter column code set not null,
  add constraint case_study_code_key unique (code),
  add constraint case_study_client_id_year_number_key unique (client_id, year, number);

alter table public.case_study drop column client;

-- ---------------------------------------------------------------------------
-- Immutability (rules 3 and 5)
-- ---------------------------------------------------------------------------

-- A case's code and number are fixed once created; client and year may change
-- later without touching them.
create function public.case_study_reject_code_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code or new.number is distinct from old.number then
    raise exception 'case_study.code and case_study.number are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger case_study_reject_code_change
  before update on public.case_study
  for each row execute function public.case_study_reject_code_change();

-- A client's id and code are fixed.
create function public.client_reject_code_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code or new.id is distinct from old.id then
    raise exception 'client.id and client.code are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger client_reject_code_change
  before update on public.client
  for each row execute function public.client_reject_code_change();

-- Clients are never deleted, so a code is never freed for reuse.
create function public.client_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'client rows are never deleted (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger client_reject_delete
  before delete on public.client
  for each row execute function public.client_reject_delete();

create trigger client_reject_truncate
  before truncate on public.client
  for each statement execute function public.client_reject_delete();

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.client_name_key(text) from public, anon, authenticated;
revoke all on function public.client_code_letters(text) from public, anon, authenticated;
revoke all on function public.case_study_code(text, integer, integer) from public, anon, authenticated;
revoke all on function public.client_set_name_key() from public, anon, authenticated;
revoke all on function public.client_touch_updated_at() from public, anon, authenticated;
revoke all on function public.create_client(text, uuid) from public, anon, authenticated;
revoke all on function public.rename_client(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.create_case_study(text, uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.case_study_reject_code_change() from public, anon, authenticated;
revoke all on function public.client_reject_code_change() from public, anon, authenticated;
revoke all on function public.client_reject_delete() from public, anon, authenticated;

grant execute on function public.client_name_key(text) to service_role;
grant execute on function public.client_code_letters(text) to service_role;
grant execute on function public.case_study_code(text, integer, integer) to service_role;
grant execute on function public.create_client(text, uuid) to service_role;
grant execute on function public.rename_client(uuid, text, uuid) to service_role;
grant execute on function public.create_case_study(text, uuid, integer, text, uuid) to service_role;
