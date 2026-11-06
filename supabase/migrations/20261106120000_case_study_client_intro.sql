-- Story 3.11 (moved here from 3.9): a client's intro-and-outro document, owned by the
-- `case-study` module (AD-11, AD-23). Forward-only (AD-12).
--
-- `client_intro`: one per client, with the case lifecycle (draft → generating →
-- in_review → approved; a failure goes back to draft), `head_revision_id` /
-- `approved_revision_id` pointers and a `head_version` compare-and-set counter, as
-- `case_study` has them. `client_event`: its append-only log, mirroring `case_event`
-- with `client_intro_id` in place of `case_id`. `revision.client_intro_id` gets its FK.
--
-- The browser never queries tables: RLS is on with no policies, and every table is
-- revoked from anon and authenticated. The service role may only read; every write
-- goes through a security-definer function below, executable by the service role only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.client_intro (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null constraint client_intro_client_id_fkey references public.client (id),
  -- AD-3 set; must list exactly CASE_STATUSES in src/shared/case-status.ts.
  status text not null default 'draft' check (status in ('draft', 'generating', 'in_review', 'approved')),
  head_revision_id uuid null constraint client_intro_head_revision_id_fkey references public.revision (id),
  approved_revision_id uuid null constraint client_intro_approved_revision_id_fkey references public.revision (id),
  head_version integer not null default 0 check (head_version >= 0),
  created_by uuid not null constraint client_intro_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One intro document per client.
  constraint client_intro_client_id_key unique (client_id)
);

create index client_intro_head_revision_id_idx on public.client_intro (head_revision_id) where head_revision_id is not null;
create index client_intro_approved_revision_id_idx on public.client_intro (approved_revision_id) where approved_revision_id is not null;

create table public.client_event (
  id uuid primary key default gen_random_uuid(),
  client_intro_id uuid not null constraint client_event_client_intro_id_fkey references public.client_intro (id),
  revision_id uuid null constraint client_event_revision_id_fkey references public.revision (id),
  actor_id uuid not null constraint client_event_actor_id_fkey references public.profile (id),
  type text not null check (type ~ '^[a-z][a-z0-9_]*$'),
  at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object')
);

create index client_event_client_intro_id_at_idx on public.client_event (client_intro_id, at);
create index client_event_revision_id_idx on public.client_event (revision_id) where revision_id is not null;
-- The draft-ready poll reads an actor's latest presses.
create index client_event_actor_id_at_idx on public.client_event (actor_id, at);

-- The revision's subject, a plain uuid since Story 3.3.
alter table public.revision
  add constraint revision_client_intro_id_fkey foreign key (client_intro_id) references public.client_intro (id);
create index revision_client_intro_id_idx on public.revision (client_intro_id) where client_intro_id is not null;

-- Backstop: RLS on with no policies denies anon and authenticated. The service role may only read.
alter table public.client_intro enable row level security;
alter table public.client_event enable row level security;
revoke all on table public.client_intro from public, anon, authenticated, service_role;
revoke all on table public.client_event from public, anon, authenticated, service_role;
grant select on table public.client_intro to service_role;
grant select on table public.client_event to service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- updated_at follows every update.
create function public.client_intro_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger client_intro_touch_updated_at
  before update on public.client_intro
  for each row execute function public.client_intro_touch_updated_at();

-- The id, the client and who created it never change.
create function public.client_intro_reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'client_intro id, client_id, created_by and created_at are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger client_intro_reject_immutable_change
  before update on public.client_intro
  for each row execute function public.client_intro_reject_immutable_change();

-- Rejects any status change not made inside `transition_client_intro`, which sets the
-- transaction-local flag around its single update (as `case_study` does).
create function public.client_intro_reject_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('mac_recap.intro_transition', true), '') <> 'on' then
    raise exception 'client_intro.status changes only through transition_client_intro' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger client_intro_reject_status_change
  before update on public.client_intro
  for each row execute function public.client_intro_reject_status_change();

-- Intro rows are never deleted (their client is only soft-deleted).
create function public.client_intro_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'client_intro rows are never deleted (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger client_intro_reject_delete
  before delete on public.client_intro
  for each row execute function public.client_intro_reject_delete();

create trigger client_intro_reject_truncate
  before truncate on public.client_intro
  for each statement execute function public.client_intro_reject_delete();

-- The event log is append-only.
create function public.client_event_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'client_event is append-only (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger client_event_reject_update_delete
  before update or delete on public.client_event
  for each row execute function public.client_event_reject_mutation();

create trigger client_event_reject_truncate
  before truncate on public.client_event
  for each statement execute function public.client_event_reject_mutation();

revoke all on function public.client_intro_touch_updated_at() from public, anon, authenticated;
revoke all on function public.client_intro_reject_immutable_change() from public, anon, authenticated;
revoke all on function public.client_intro_reject_status_change() from public, anon, authenticated;
revoke all on function public.client_intro_reject_delete() from public, anon, authenticated;
revoke all on function public.client_event_reject_mutation() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writers (service role only)
-- ---------------------------------------------------------------------------

-- Returns the intro of a non-deleted client, creating it (status `draft`) with one
-- `client_intro_created` event when it has none, in one transaction. Two concurrent
-- calls create one row: the second returns the first's. Raises P0001 `CLIENT_NOT_FOUND`
-- (unknown or deleted client); nothing is written then.
create function public.create_client_intro(p_client_id uuid, p_actor_id uuid)
returns public.client_intro
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_intro public.client_intro;
begin
  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.client_intro (client_id, created_by)
  values (p_client_id, p_actor_id)
  on conflict (client_id) do nothing
  returning * into found_intro;

  if found_intro.id is null then
    select * into found_intro from public.client_intro where client_id = p_client_id;
    return found_intro;
  end if;

  insert into public.client_event (client_intro_id, actor_id, type, data)
  values (found_intro.id, p_actor_id, 'client_intro_created', jsonb_build_object('clientId', p_client_id));

  return found_intro;
end;
$$;

-- Moves the intro of a non-deleted client from `p_from` to `p_to` (both computed by the
-- domain, the same table as cases) and appends its `transition` event, in one
-- transaction. Raises P0001 `NOT_FOUND` (unknown intro, or its client deleted),
-- `STALE_STATUS` (status is no longer `p_from`) or `INVALID_TRANSITION` (`p_from`
-- equals `p_to`); nothing is written then.
create function public.transition_client_intro(
  p_client_intro_id uuid,
  p_event text,
  p_from text,
  p_to text,
  p_actor_id uuid
)
returns public.client_intro
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved public.client_intro;
  updated boolean;
begin
  if p_from is not distinct from p_to then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = 'from and to must differ';
  end if;

  perform pg_catalog.set_config('mac_recap.intro_transition', 'on', true);
  update public.client_intro i
     set status = p_to
   where i.id = p_client_intro_id
     and i.status = p_from
     and exists (select 1 from public.client c where c.id = i.client_id and c.deleted_at is null)
  returning * into moved;
  -- Capture FOUND now: the PERFORM below resets it.
  updated := found;
  perform pg_catalog.set_config('mac_recap.intro_transition', 'off', true);

  if not updated then
    perform 1
       from public.client_intro i
       join public.client c on c.id = i.client_id
      where i.id = p_client_intro_id and c.deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
    raise exception 'STALE_STATUS' using errcode = 'P0001';
  end if;

  insert into public.client_event (client_intro_id, actor_id, type, data)
  values (moved.id, p_actor_id, 'transition', jsonb_build_object('event', p_event, 'from', p_from, 'to', p_to));

  return moved;
end;
$$;

-- As `create_working_revision`, for an intro: creates a `working` revision of the intro
-- of a non-deleted client from `p_doc` (validated by zod first; `generated_doc` and
-- `doc` both start as it) and makes it the head by compare-and-set on
-- `client_intro.head_version`. A previous `working` head becomes `superseded` first.
-- One `revision_created` client event with the revision id. All in one transaction.
-- Raises P0001 `NOT_FOUND`, `STALE_HEAD` or `INVALID_INPUT`; nothing is written then.
create function public.create_working_revision_for_client_intro(
  p_client_intro_id uuid,
  p_doc jsonb,
  p_manifest jsonb,
  p_meta jsonb,
  p_expected_head_version integer,
  p_actor_id uuid
)
returns public.revision
language plpgsql
security definer
set search_path = ''
as $$
declare
  i_head_revision_id uuid;
  i_head_version integer;
  created public.revision;
  superseded_id uuid;
begin
  if p_client_intro_id is null or p_expected_head_version is null or p_actor_id is null
     or coalesce(jsonb_typeof(p_doc), '') <> 'object'
     or coalesce(jsonb_typeof(p_doc -> 'schemaVersion'), '') <> 'number'
     or coalesce(p_doc ->> 'schemaVersion', '') !~ '^[0-9]{1,4}$'
     or coalesce(p_doc ->> 'kind', '') <> 'client_intro'
     or coalesce(jsonb_typeof(p_manifest), '') <> 'object'
     or coalesce(jsonb_typeof(p_meta), '') <> 'object'
     or coalesce(jsonb_typeof(p_meta -> 'model'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_meta -> 'promptVersion'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_meta -> 'fellBack'), 'null') not in ('boolean', 'null') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select i.head_revision_id, i.head_version into i_head_revision_id, i_head_version
    from public.client_intro i
    join public.client c on c.id = i.client_id
   where i.id = p_client_intro_id and c.deleted_at is null
     for update of i;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if i_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;

  -- Supersede first: at most one working revision per intro (unique index).
  update public.revision
     set status = 'superseded'
   where id = i_head_revision_id and status = 'working'
  returning id into superseded_id;

  insert into public.revision (client_intro_id, status, generated_doc, doc, manifest, model, fell_back, prompt_version, schema_version, created_by)
  values (
    p_client_intro_id,
    'working',
    p_doc,
    p_doc,
    p_manifest,
    p_meta ->> 'model',
    coalesce((p_meta ->> 'fellBack')::boolean, false),
    p_meta ->> 'promptVersion',
    (p_doc ->> 'schemaVersion')::integer,
    p_actor_id
  )
  returning * into created;

  update public.client_intro
     set head_revision_id = created.id, head_version = head_version + 1
   where id = p_client_intro_id and head_version = p_expected_head_version;

  insert into public.client_event (client_intro_id, revision_id, actor_id, type, data)
  values (
    p_client_intro_id,
    created.id,
    p_actor_id,
    'revision_created',
    jsonb_build_object(
      'headVersion', p_expected_head_version + 1,
      'previousHeadRevisionId', i_head_revision_id,
      'supersededRevisionId', superseded_id
    )
  );

  return created;
end;
$$;

revoke all on function public.create_client_intro(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transition_client_intro(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.create_working_revision_for_client_intro(uuid, jsonb, jsonb, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_client_intro(uuid, uuid) to service_role;
grant execute on function public.transition_client_intro(uuid, text, text, text, uuid) to service_role;
grant execute on function public.create_working_revision_for_client_intro(uuid, jsonb, jsonb, jsonb, integer, uuid) to service_role;
