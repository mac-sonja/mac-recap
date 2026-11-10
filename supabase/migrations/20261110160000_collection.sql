-- Story 5.10a: collections, owned by the new `collection` module. Forward-only (AD-12); runs as
-- one transaction. No applied migration is edited.
--
-- `collection`: a named set of approved case histories, from any clients, gathered for a pitch.
-- `version` is its compare-and-set counter: every change to its items, their order, its name or
-- its tags names the version it was based on and bumps it; a stale write raises
-- `STALE_COLLECTION`. Deleting is soft (`deleted_at`). `collection_item`: its cases, in
-- `position` order (each client's cases kept together: a client's group). `collection_tag`: its
-- business lines and industries. `collection_event`: its append-only log.
--
-- A collection never copies a case: it holds case ids only, and every read resolves them to the
-- case's current approved revision and the client's current info. A soft-deleted case leaves
-- every collection: reads drop it, and the next write of the items leaves it out.
--
-- The browser never queries tables: RLS is on with no policies, and every table is revoked from
-- anon and authenticated. The service role may only read; every write goes through a
-- security-definer function below, executable by the service role only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.collection (
  id uuid primary key default gen_random_uuid(),
  -- Trimmed, 1–120 characters (code points). Must match `COLLECTION_NAME_MAX` in collection/domain.
  name text not null constraint collection_name_check check (name = btrim(name) and char_length(name) between 1 and 120),
  version integer not null default 1 constraint collection_version_check check (version >= 1),
  created_by uuid not null constraint collection_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index collection_live_updated_at_idx on public.collection (updated_at desc) where deleted_at is null;

create table public.collection_item (
  collection_id uuid not null constraint collection_item_collection_id_fkey references public.collection (id),
  case_id uuid not null constraint collection_item_case_id_fkey references public.case_study (id),
  position integer not null constraint collection_item_position_check check (position >= 0 and position < 200),
  -- The same case is never in one collection twice; two items never share a place.
  constraint collection_item_pkey primary key (collection_id, case_id),
  constraint collection_item_position_key unique (collection_id, position)
);

create index collection_item_case_id_idx on public.collection_item (case_id);

create table public.collection_tag (
  collection_id uuid not null constraint collection_tag_collection_id_fkey references public.collection (id),
  kind text not null constraint collection_tag_kind_check check (kind in ('business_line', 'industry')),
  key text not null constraint collection_tag_key_check check (
    (kind = 'business_line' and key in ('branding', 'social_media', 'video', 'web_design', 'advertising', 'eventi', 'sviluppo'))
    or (kind = 'industry' and key ~ '^[a-z0-9_]{1,48}$')
  ),
  constraint collection_tag_pkey primary key (collection_id, kind, key)
);

create table public.collection_event (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null constraint collection_event_collection_id_fkey references public.collection (id),
  actor_id uuid not null constraint collection_event_actor_id_fkey references public.profile (id),
  type text not null check (type ~ '^[a-z][a-z0-9_]*$'),
  -- The collection's version after the change.
  version integer not null check (version >= 1),
  at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object')
);

create index collection_event_collection_id_at_idx on public.collection_event (collection_id, at);

-- Backstop: RLS on with no policies denies anon and authenticated. The service role may only read.
alter table public.collection enable row level security;
alter table public.collection_item enable row level security;
alter table public.collection_tag enable row level security;
alter table public.collection_event enable row level security;
revoke all on table public.collection from public, anon, authenticated, service_role;
revoke all on table public.collection_item from public, anon, authenticated, service_role;
revoke all on table public.collection_tag from public, anon, authenticated, service_role;
revoke all on table public.collection_event from public, anon, authenticated, service_role;
grant select on table public.collection to service_role;
grant select on table public.collection_item to service_role;
grant select on table public.collection_tag to service_role;
grant select on table public.collection_event to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- The id and who created it never change.
create function public.collection_reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'collection id, created_by and created_at are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger collection_reject_immutable_change
  before update on public.collection
  for each row execute function public.collection_reject_immutable_change();

-- The log is append-only.
create function public.collection_event_reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'collection_event is append-only' using errcode = 'P0001';
end;
$$;

create trigger collection_event_reject_change
  before update or delete on public.collection_event
  for each row execute function public.collection_event_reject_change();

-- ---------------------------------------------------------------------------
-- Helpers (not executable by anyone but the writers below)
-- ---------------------------------------------------------------------------

-- Checks a list of tags: at least one business line and one industry, each a known key, no
-- repeat. Raises P0001 `INVALID_INPUT` otherwise.
create function public.collection_check_tags(p_business_lines text[], p_industries text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_business_lines is null or p_industries is null
     or coalesce(array_ndims(p_business_lines), 1) <> 1 or coalesce(array_ndims(p_industries), 1) <> 1
     or cardinality(p_business_lines) < 1 or cardinality(p_industries) < 1
     or cardinality(p_business_lines) > 20 or cardinality(p_industries) > 100
     or array_position(p_business_lines, null) is not null or array_position(p_industries, null) is not null
     or cardinality(p_business_lines) <> (select count(distinct k) from unnest(p_business_lines) as k)
     or cardinality(p_industries) <> (select count(distinct k) from unnest(p_industries) as k)
     or not (p_business_lines <@ array['branding', 'social_media', 'video', 'web_design', 'advertising', 'eventi', 'sviluppo']::text[]) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'tags';
  end if;
  if (select count(*) from public.client_sector where key = any (p_industries)) <> cardinality(p_industries) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'tags';
  end if;
end;
$$;

-- Checks the items a collection is about to hold, in order: 1–200 ids, no null, no repeat, every
-- id a non-deleted case, and each client's cases next to each other (a client's group). An id not
-- in `p_kept` (the collection's items before the change) must be an approved case: a case that
-- is in the collection already may have lost its approval and stays ("Non disponibile").
-- Raises P0001 `INVALID_INPUT` or `CASE_NOT_COLLECTABLE`.
create function public.collection_check_items(p_case_ids uuid[], p_kept uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  found_count integer;
  scattered integer;
begin
  if p_case_ids is null
     or coalesce(array_ndims(p_case_ids), 1) <> 1
     or cardinality(p_case_ids) < 1 or cardinality(p_case_ids) > 200
     or array_position(p_case_ids, null) is not null
     or cardinality(p_case_ids) <> (select count(distinct id) from unnest(p_case_ids) as id) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'caseIds';
  end if;

  select count(*) into found_count
    from public.case_study c
   where c.id = any (p_case_ids)
     and c.deleted_at is null
     and (c.status = 'approved' or c.id = any (coalesce(p_kept, '{}'::uuid[])));
  if found_count <> cardinality(p_case_ids) then
    raise exception 'CASE_NOT_COLLECTABLE' using errcode = 'P0001';
  end if;

  -- Each client's cases sit next to each other: its first and last places span exactly its count.
  select count(*) into scattered
    from (
      select c.client_id, max(item.ord) - min(item.ord) + 1 as span, count(*) as n
        from unnest(p_case_ids) with ordinality as item (case_id, ord)
        join public.case_study c on c.id = item.case_id
       group by c.client_id
    ) as g
   where g.span <> g.n;
  if scattered > 0 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'groups';
  end if;
end;
$$;

revoke all on function public.collection_check_tags(text[], text[]) from public, anon, authenticated, service_role;
revoke all on function public.collection_check_items(uuid[], uuid[]) from public, anon, authenticated, service_role;

-- Locks live collection `p_collection_id` and checks its version is `p_expected_version`.
-- Raises P0001 `COLLECTION_NOT_FOUND` (unknown or deleted) or `STALE_COLLECTION`.
create function public.collection_lock(p_collection_id uuid, p_expected_version integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_version integer;
begin
  select version into current_version from public.collection where id = p_collection_id and deleted_at is null for update;
  if not found then
    raise exception 'COLLECTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_expected_version is null or current_version <> p_expected_version then
    raise exception 'STALE_COLLECTION' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.collection_lock(uuid, integer) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Writers (service role only)
-- ---------------------------------------------------------------------------

-- Creates a collection named `p_name` with its tags and its cases in the order given (every one
-- approved and non-deleted, each client's cases together), and one `collection_created` event.
-- Returns `{ id, version }`. Raises P0001 `INVALID_INPUT` (a bad name, tag or list) or
-- `CASE_NOT_COLLECTABLE` (a case not approved, deleted or unknown); nothing is written then.
create function public.create_collection(
  p_name text,
  p_business_lines text[],
  p_industries text[],
  p_case_ids uuid[],
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_name is null or p_actor_id is null or p_name <> btrim(p_name) or char_length(p_name) not between 1 and 120 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'name';
  end if;
  perform public.collection_check_tags(p_business_lines, p_industries);
  perform public.collection_check_items(p_case_ids, null);

  insert into public.collection (name, created_by) values (p_name, p_actor_id) returning id into new_id;
  insert into public.collection_item (collection_id, case_id, position)
  select new_id, item.case_id, (item.ord - 1)::integer from unnest(p_case_ids) with ordinality as item (case_id, ord);
  insert into public.collection_tag (collection_id, kind, key)
  select new_id, 'business_line', k from unnest(p_business_lines) as k
  union all
  select new_id, 'industry', k from unnest(p_industries) as k;
  insert into public.collection_event (collection_id, actor_id, type, version, data)
  values (new_id, p_actor_id, 'collection_created', 1, jsonb_build_object(
    'name', p_name,
    'businessLines', to_jsonb(p_business_lines),
    'industries', to_jsonb(p_industries),
    'caseIds', to_jsonb(p_case_ids)
  ));

  return jsonb_build_object('id', new_id, 'version', 1);
end;
$$;

-- Replaces the cases of collection `p_collection_id` with `p_case_ids`, in that order, if its
-- version is still `p_expected_version`; bumps the version and logs `p_event_type` with
-- `p_event_data`. A case already in the collection may stay even if no longer approved; a new one
-- must be approved. Returns the new version. Raises P0001 `COLLECTION_NOT_FOUND`,
-- `STALE_COLLECTION`, `INVALID_INPUT` or `CASE_NOT_COLLECTABLE`; nothing is written then.
create function public.set_collection_items(
  p_collection_id uuid,
  p_expected_version integer,
  p_case_ids uuid[],
  p_actor_id uuid,
  p_event_type text,
  p_event_data jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept uuid[];
  next_version integer;
begin
  if p_actor_id is null or p_event_type is null or p_event_type !~ '^collection_[a-z_]+$'
     or p_event_data is null or jsonb_typeof(p_event_data) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform public.collection_lock(p_collection_id, p_expected_version);
  select coalesce(array_agg(case_id), '{}'::uuid[]) into kept from public.collection_item where collection_id = p_collection_id;
  perform public.collection_check_items(p_case_ids, kept);

  delete from public.collection_item where collection_id = p_collection_id;
  insert into public.collection_item (collection_id, case_id, position)
  select p_collection_id, item.case_id, (item.ord - 1)::integer from unnest(p_case_ids) with ordinality as item (case_id, ord);
  update public.collection set version = version + 1, updated_at = now() where id = p_collection_id returning version into next_version;
  insert into public.collection_event (collection_id, actor_id, type, version, data)
  values (p_collection_id, p_actor_id, p_event_type, next_version, p_event_data || jsonb_build_object('caseIds', to_jsonb(p_case_ids)));
  return next_version;
end;
$$;

-- Renames collection `p_collection_id` to `p_name` (trimmed, 1–120 characters) if its version is
-- still `p_expected_version`; returns the new version. Raises P0001 `INVALID_INPUT`,
-- `COLLECTION_NOT_FOUND` or `STALE_COLLECTION`; nothing is written then.
create function public.rename_collection(p_collection_id uuid, p_expected_version integer, p_name text, p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if p_name is null or p_actor_id is null or p_name <> btrim(p_name) or char_length(p_name) not between 1 and 120 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'name';
  end if;
  perform public.collection_lock(p_collection_id, p_expected_version);
  update public.collection set name = p_name, version = version + 1, updated_at = now() where id = p_collection_id returning version into next_version;
  insert into public.collection_event (collection_id, actor_id, type, version, data)
  values (p_collection_id, p_actor_id, 'collection_renamed', next_version, jsonb_build_object('name', p_name));
  return next_version;
end;
$$;

-- Replaces the tags of collection `p_collection_id` if its version is still
-- `p_expected_version`; returns the new version. Raises P0001 `INVALID_INPUT`,
-- `COLLECTION_NOT_FOUND` or `STALE_COLLECTION`; nothing is written then.
create function public.set_collection_tags(
  p_collection_id uuid,
  p_expected_version integer,
  p_business_lines text[],
  p_industries text[],
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  perform public.collection_check_tags(p_business_lines, p_industries);
  perform public.collection_lock(p_collection_id, p_expected_version);
  delete from public.collection_tag where collection_id = p_collection_id;
  insert into public.collection_tag (collection_id, kind, key)
  select p_collection_id, 'business_line', k from unnest(p_business_lines) as k
  union all
  select p_collection_id, 'industry', k from unnest(p_industries) as k;
  update public.collection set version = version + 1, updated_at = now() where id = p_collection_id returning version into next_version;
  insert into public.collection_event (collection_id, actor_id, type, version, data)
  values (p_collection_id, p_actor_id, 'collection_retagged', next_version,
          jsonb_build_object('businessLines', to_jsonb(p_business_lines), 'industries', to_jsonb(p_industries)));
  return next_version;
end;
$$;

-- Soft-deletes collection `p_collection_id` (`deleted_at`), bumping its version, with one
-- `collection_deleted` event. Raises P0001 `INVALID_INPUT` or `COLLECTION_NOT_FOUND` (unknown or
-- already deleted); nothing is written then.
create function public.delete_collection(p_collection_id uuid, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if p_collection_id is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  update public.collection set deleted_at = now(), version = version + 1, updated_at = now()
   where id = p_collection_id and deleted_at is null
  returning version into next_version;
  if not found then
    raise exception 'COLLECTION_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.collection_event (collection_id, actor_id, type, version, data)
  values (p_collection_id, p_actor_id, 'collection_deleted', next_version, '{}'::jsonb);
end;
$$;

revoke all on function public.create_collection(text, text[], text[], uuid[], uuid) from public, anon, authenticated;
revoke all on function public.set_collection_items(uuid, integer, uuid[], uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.rename_collection(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.set_collection_tags(uuid, integer, text[], text[], uuid) from public, anon, authenticated;
revoke all on function public.delete_collection(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_collection(text, text[], text[], uuid[], uuid) to service_role;
grant execute on function public.set_collection_items(uuid, integer, uuid[], uuid, text, jsonb) to service_role;
grant execute on function public.rename_collection(uuid, integer, text, uuid) to service_role;
grant execute on function public.set_collection_tags(uuid, integer, text[], text[], uuid) to service_role;
grant execute on function public.delete_collection(uuid, uuid) to service_role;
