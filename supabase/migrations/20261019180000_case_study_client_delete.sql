-- Delete a client (owner, 2026-10-19: clients can be deleted (soft), with their cases).
-- Forward-only (AD-12); runs as one transaction. No applied migration is edited:
-- every client function that must ignore a deleted client is dropped and recreated.
--
-- A deleted client and all its cases get `deleted_at`; no row and no storage object is
-- removed, so its events stay. A deleted client is invisible to every read and refused
-- by every write (`CLIENT_NOT_FOUND`). Its name may be used again by a new client
-- (the name key is unique among non-deleted clients only); its code is never reused
-- (`client_code_key` stays a plain unique constraint over every row, and
-- `create_client` scans every row when it picks a code). The delete and truncate
-- triggers on `client` stay: a soft delete is an UPDATE.

-- ---------------------------------------------------------------------------
-- client.deleted_at and the name key
-- ---------------------------------------------------------------------------

-- Who deleted the client; set together with `deleted_at` by `delete_client`.
alter table public.client
  add column deleted_at timestamptz null,
  add column deleted_by uuid null constraint client_deleted_by_fkey references public.profile (id);

alter table public.client drop constraint client_name_key_key;
create unique index client_name_key_key on public.client (name_key) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Functions recreated with the deleted filter
-- ---------------------------------------------------------------------------

-- As `20261019120000_case_study_client_wizard.sql`, except that only a non-deleted
-- client holds a name. The code pick still scans every row, deleted ones included,
-- so a code is never given to another client. Service role only.
drop function public.create_client(text, text[], text, uuid);

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

  if exists (
    select 1 from public.client where name_key = public.client_name_key(p_name) and deleted_at is null
  ) then
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
    -- Every row, deleted ones included: codes are never reused.
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

-- As `20261019120000_case_study_client_wizard.sql`, except that a deleted client is
-- `CLIENT_NOT_FOUND` and only a non-deleted client holds a name. Service role only.
drop function public.update_client(uuid, text, text[], text, uuid, uuid);

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

-- As `20261019120000_case_study_client_wizard.sql`, except that a deleted client is
-- `CLIENT_NOT_FOUND`. The client row is read `for share`, so a concurrent
-- `delete_client` (an UPDATE of that row) waits for this save, or this save sees the
-- client deleted. Service role only.
drop function public.save_client_brief_field(uuid, text, text, uuid);

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

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
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

-- As `20261019140000_case_study_client_material.sql`, except that a deleted client is
-- `CLIENT_NOT_FOUND`. The client row is read `for share`, so a concurrent
-- `delete_client` (an UPDATE of that row) waits for this insert, or this insert sees
-- the client deleted. Service role only.
drop function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid);

create function public.insert_client_asset(
  p_id uuid,
  p_client_id uuid,
  p_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_actor_id uuid
)
returns public.client_asset
language plpgsql
security invoker
set search_path = ''
as $$
declare
  free_position smallint;
  created public.client_asset;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_asset:' || p_client_id::text, 0));

  perform 1 from public.client_asset where id = p_id;
  if found then
    raise exception 'ASSET_ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select min(candidate)::smallint into free_position
    from generate_series(1, 3) as candidate
   where not exists (
     select 1 from public.client_asset where client_id = p_client_id and position = candidate
   );
  if free_position is null then
    raise exception 'CLIENT_MATERIAL_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.client_asset (id, client_id, position, path, file_name, mime_type, size_bytes, width, height, created_by)
  values (p_id, p_client_id, free_position, p_path, btrim(p_file_name), p_mime_type, p_size_bytes, p_width, p_height, p_actor_id)
  returning * into created;
  return created;
end;
$$;

-- As `20261019140000_case_study_client_material.sql`, except that a file of a deleted
-- client raises P0001 `CLIENT_NOT_FOUND` and nothing is deleted (a deleted client's
-- rows and objects stay). Returns false when no row has this id. Service role only.
drop function public.delete_client_asset(uuid);

create function public.delete_client_asset(p_asset_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.client_asset where id = p_asset_id;
  if not found then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_asset:' || v_client_id::text, 0));

  perform 1 from public.client where id = v_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  delete from public.client_asset where id = p_asset_id;
  return found;
end;
$$;

-- As `20261016160000_client_logo_replaceable.sql`, except that a logo of a deleted
-- client raises P0001 `CLIENT_NOT_FOUND` and nothing is deleted (a deleted client's
-- rows and objects stay). Service role only.
drop function public.delete_client_logo(uuid);

create function public.delete_client_logo(p_logo_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.client'));

  if exists (
    select 1
      from public.client_logo l
      join public.client c on c.id = l.client_id
     where l.id = p_logo_id and c.deleted_at is not null
  ) then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.client where logo_id = p_logo_id) then
    raise exception 'CLIENT_LOGO_IN_USE' using errcode = 'P0001';
  end if;

  delete from public.client_logo where id = p_logo_id;
  return found;
end;
$$;

-- As `20261015120000_case_study_clients_and_codes.sql`, except that a deleted client
-- is `CLIENT_NOT_FOUND` (a stale case wizard tab can't add a case to it). The client
-- row is read `for share`, so a concurrent `delete_client` waits for this create.
-- Service role only.
drop function public.create_case_study(text, uuid, integer, text, uuid);

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
  select * into owner from public.client where id = p_client_id and deleted_at is null for share;
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
-- delete_client
-- ---------------------------------------------------------------------------

-- Soft-deletes a client and every one of its non-deleted cases, whatever their
-- status (approved included), in one transaction under the client advisory lock.
-- `p_confirm_name` must equal the client's name once trimmed with inner whitespace
-- collapsed (the name is stored that way). Writes one `case_deleted` case event, with the
-- actor, per case, and returns the number of cases deleted. Raises P0001
-- `CLIENT_NOT_FOUND` (unknown or already deleted client) or
-- `CLIENT_DELETE_NAME_MISMATCH`; nothing is written then. No row or object is
-- removed. Service role only.
create function public.delete_client(p_client_id uuid, p_confirm_name text, p_actor_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.client;
  deleted_count integer;
  moment timestamptz := now();
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.client'));

  select * into target from public.client where id = p_client_id and deleted_at is null for update;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Exactly `normalizeClientConfirmName` (src/shared/client-name.ts): runs of ASCII
  -- whitespace become one space, then a leading or trailing space is dropped.
  if btrim(regexp_replace(coalesce(p_confirm_name, ''), '[ \t\n\r\f\v]+', ' ', 'g'), ' ') is distinct from target.name then
    raise exception 'CLIENT_DELETE_NAME_MISMATCH' using errcode = 'P0001';
  end if;

  with deleted as (
    update public.case_study
       set deleted_at = moment
     where client_id = p_client_id and deleted_at is null
    returning id, code, status
  ), logged as (
    insert into public.case_event (case_id, actor_id, type, data)
    select
      deleted.id,
      p_actor_id,
      'case_deleted',
      jsonb_build_object(
        'reason', 'client_deleted',
        'clientId', target.id,
        'clientCode', target.code,
        'code', deleted.code,
        'status', deleted.status
      )
      from deleted
    returning 1
  )
  select count(*)::integer into deleted_count from logged;

  update public.client set deleted_at = moment, deleted_by = p_actor_id where id = p_client_id;

  return deleted_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.create_client(text, text[], text, uuid) from public, anon, authenticated;
revoke all on function public.update_client(uuid, text, text[], text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_client_brief_field(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.delete_client_asset(uuid) from public, anon, authenticated;
revoke all on function public.delete_client_logo(uuid) from public, anon, authenticated;
revoke all on function public.create_case_study(text, uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_client(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.create_client(text, text[], text, uuid) to service_role;
grant execute on function public.update_client(uuid, text, text[], text, uuid, uuid) to service_role;
grant execute on function public.save_client_brief_field(uuid, text, text, uuid) to service_role;
grant execute on function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid) to service_role;
grant execute on function public.delete_client_asset(uuid) to service_role;
grant execute on function public.delete_client_logo(uuid) to service_role;
grant execute on function public.create_case_study(text, uuid, integer, text, uuid) to service_role;
grant execute on function public.delete_client(uuid, text, uuid) to service_role;
