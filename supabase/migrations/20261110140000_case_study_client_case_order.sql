-- Story 4.12b: the order of a client's cases, owned by the `case-study` module. Forward-only
-- (AD-12); runs as one transaction. No applied migration is edited.
--
-- `client_case_order`: one row per client with the case ids in the order the owner arranged
-- them in the client's file (the client pack follows it, B5). No row: the cases are listed
-- newest created first. The row is read by `orderClientCases` in the module, which skips ids
-- that are no longer approved or no longer exist and puts any approved case missing from it
-- (approved later) after the arranged ones, newest created first. Saving an order changes no
-- case, intro or revision.
--
-- The browser never queries tables: RLS is on with no policies, and the table is revoked from
-- anon and authenticated. The service role may only read; the one writer below is a
-- security-definer function executable by the service role only.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.client_case_order (
  client_id uuid primary key constraint client_case_order_client_id_fkey references public.client (id),
  -- The case ids in order: one-dimensional, no null, no repeat (checked by the writer).
  case_ids uuid[] not null constraint client_case_order_case_ids_check check (
    coalesce(array_ndims(case_ids), 1) = 1 and array_position(case_ids, null) is null
  ),
  updated_by uuid not null constraint client_case_order_updated_by_fkey references public.profile (id),
  updated_at timestamptz not null default now()
);

-- Backstop: RLS on with no policies denies anon and authenticated. The service role may only read.
alter table public.client_case_order enable row level security;
revoke all on table public.client_case_order from public, anon, authenticated, service_role;
grant select on table public.client_case_order to service_role;

-- ---------------------------------------------------------------------------
-- Writer (service role only)
-- ---------------------------------------------------------------------------

-- Saves the order of client `p_client_id`'s cases as `p_case_ids`, in the order given, replacing
-- any saved one, and returns it. Every id must be one of the client's own non-deleted cases,
-- each at most once; nothing is dropped or added. Raises P0001 `INVALID_INPUT` (a null argument,
-- a null, repeated, foreign, unknown or deleted id, more than 500 ids) or `CLIENT_NOT_FOUND`
-- (unknown or deleted client); nothing is written then. Takes a per-client lock, so two saves
-- at the same moment apply one after the other.
create function public.set_client_case_order(p_client_id uuid, p_case_ids uuid[], p_actor_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  own_count integer;
begin
  if p_client_id is null or p_case_ids is null or p_actor_id is null
     or coalesce(array_ndims(p_case_ids), 1) <> 1
     or cardinality(p_case_ids) > 500
     or array_position(p_case_ids, null) is not null
     or cardinality(p_case_ids) <> (select count(distinct id) from unnest(p_case_ids) as id) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_case_order:' || p_client_id::text, 0));

  select count(*) into own_count
    from public.case_study
   where id = any (p_case_ids) and client_id = p_client_id and deleted_at is null;
  if own_count <> cardinality(p_case_ids) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001', detail = 'every id must be one of the client''s own non-deleted cases';
  end if;

  insert into public.client_case_order (client_id, case_ids, updated_by)
  values (p_client_id, p_case_ids, p_actor_id)
  on conflict (client_id) do update
    set case_ids = excluded.case_ids, updated_by = excluded.updated_by, updated_at = now();

  return p_case_ids;
end;
$$;

revoke all on function public.set_client_case_order(uuid, uuid[], uuid) from public, anon, authenticated;
grant execute on function public.set_client_case_order(uuid, uuid[], uuid) to service_role;
