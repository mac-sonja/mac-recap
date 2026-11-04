-- Story 4.9: editing an approved case, owned by the `case-study` module (AD-11).
-- Forward-only (AD-12).
--
-- An approved case stays `approved`. The first edit forks a `working` copy of the
-- approved revision (`fork_head`) and makes it the head; every save then lands on
-- that copy (`save_revision_doc`, now also for an approved case's fork) while every
-- live read keeps returning `approved_revision_id`. **Aggiorna la versione approvata**
-- (`update_approved_revision`) makes the copy the approved revision and supersedes
-- the old one; **Scarta le modifiche** (`discard_head`) supersedes the copy and points
-- the head back at the approved revision. Each is one transaction with a case event
-- carrying the actor. Nothing here changes `case_study.status`: an approved case has
-- no path back to Da approvare or Bozza.

-- Forks the head of approved case `p_case_id`: a `working` revision copied from
-- `approved_revision_id` (`doc`, `generated_doc`, `manifest`, the generator's meta and
-- `schema_version`), made the head by compare-and-set on `head_version` (then
-- incremented), with one `revision_forked` case event. Idempotent: when the head is
-- already a `working` copy (not the approved revision), it is returned as it is and
-- nothing is written, whatever `p_expected_head_version` says. Returns
-- `{ revision, headVersion }` (the revision row as JSON, the case's `head_version` after
-- the call). The case row is locked first, as the other revision writes lock it.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown or soft-deleted case), `CASE_NOT_EDITABLE` (the case is not `approved`, or has
-- no approved revision), `REVISION_NOT_WRITABLE` (the head is neither the approved revision
-- nor a working copy) or `STALE_HEAD` (`head_version` moved); nothing is written then.
-- Service role only.
create function public.fork_head(
  p_case_id uuid,
  p_expected_head_version integer,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_status text;
  c_head_revision_id uuid;
  c_approved_revision_id uuid;
  c_head_version integer;
  head_rev public.revision;
  source_rev public.revision;
  created public.revision;
begin
  if p_case_id is null or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select status, head_revision_id, approved_revision_id, head_version
    into c_status, c_head_revision_id, c_approved_revision_id, c_head_version
    from public.case_study
   where id = p_case_id and deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if c_status <> 'approved' or c_approved_revision_id is null then
    raise exception 'CASE_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  -- Already forked: the copy is the head.
  if c_head_revision_id is distinct from c_approved_revision_id then
    select * into head_rev from public.revision where id = c_head_revision_id;
    if not found or head_rev.status <> 'working' then
      raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
    end if;
    return jsonb_build_object('revision', to_jsonb(head_rev), 'headVersion', c_head_version);
  end if;

  if c_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;

  select * into source_rev from public.revision where id = c_approved_revision_id;
  if not found or source_rev.status <> 'approved' then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;

  insert into public.revision (case_id, status, generated_doc, doc, manifest, model, fell_back, prompt_version, schema_version, created_by)
  values (
    p_case_id,
    'working',
    source_rev.generated_doc,
    source_rev.doc,
    source_rev.manifest,
    source_rev.model,
    source_rev.fell_back,
    source_rev.prompt_version,
    source_rev.schema_version,
    p_actor_id
  )
  returning * into created;

  update public.case_study
     set head_revision_id = created.id, head_version = head_version + 1
   where id = p_case_id;

  insert into public.case_event (case_id, revision_id, actor_id, type, data)
  values (
    p_case_id,
    created.id,
    p_actor_id,
    'revision_forked',
    jsonb_build_object('fromRevisionId', c_approved_revision_id, 'headVersion', c_head_version + 1)
  );

  return jsonb_build_object('revision', to_jsonb(created), 'headVersion', c_head_version + 1);
end;
$$;

revoke all on function public.fork_head(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fork_head(uuid, integer, uuid) to service_role;

-- Story 4.3a's save, now also for an approved case's fork (Story 4.9): writes `p_doc` to
-- the `working` head revision `p_revision_id` when its `version` still equals
-- `p_expected_version`, increments `version`, keeps `schema_version` in step and writes
-- one `revision_saved` case event (`{ version }`). The case must be `in_review`, or
-- `approved` with an approved revision and a head other than it (the fork); the approved
-- revision itself is never written.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`,
-- `STALE_HEAD`, `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE` or `STALE_REVISION`, as
-- before; nothing is written then. Service role only.
create or replace function public.save_revision_doc(
  p_revision_id uuid,
  p_doc jsonb,
  p_expected_version integer,
  p_actor_id uuid
)
returns public.revision
language plpgsql
security definer
set search_path = ''
as $$
declare
  r_case_id uuid;
  c_status text;
  c_head_revision_id uuid;
  c_approved_revision_id uuid;
  current_rev public.revision;
  saved public.revision;
begin
  -- Shape checks only (zod validated the document); every operand is non-null, so
  -- the OR chain is never null.
  if p_revision_id is null or p_expected_version is null or p_actor_id is null
     or coalesce(jsonb_typeof(p_doc), '') <> 'object'
     or coalesce(jsonb_typeof(p_doc -> 'schemaVersion'), '') <> 'number'
     or coalesce(p_doc ->> 'schemaVersion', '') !~ '^[0-9]{1,4}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select case_id into r_case_id from public.revision where id = p_revision_id;
  if r_case_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select status, head_revision_id, approved_revision_id into c_status, c_head_revision_id, c_approved_revision_id
    from public.case_study
   where id = r_case_id and deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if c_head_revision_id is distinct from p_revision_id then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  if not (c_status = 'in_review'
          or (c_status = 'approved' and c_approved_revision_id is not null and c_head_revision_id is distinct from c_approved_revision_id)) then
    raise exception 'CASE_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  select * into current_rev from public.revision where id = p_revision_id for update;
  if current_rev.status <> 'working' then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;
  if current_rev.version <> p_expected_version then
    raise exception 'STALE_REVISION' using errcode = 'P0001';
  end if;

  update public.revision
     set doc = p_doc,
         schema_version = (p_doc ->> 'schemaVersion')::integer,
         version = version + 1
   where id = p_revision_id
  returning * into saved;

  insert into public.case_event (case_id, revision_id, actor_id, type, data)
  values (r_case_id, p_revision_id, p_actor_id, 'revision_saved', jsonb_build_object('version', saved.version));

  return saved;
end;
$$;

revoke all on function public.save_revision_doc(uuid, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.save_revision_doc(uuid, jsonb, integer, uuid) to service_role;

-- **Aggiorna la versione approvata**: makes the `working` fork `p_revision_id`, the head
-- of approved case `p_case_id`, the approved revision, when its `version` is still
-- `p_expected_revision_version` and the case's `head_version` is still
-- `p_expected_head_version` (Story 4.8's compare-and-set). The fork becomes `approved`,
-- the previous approved revision `superseded`, `approved_revision_id` the fork, and one
-- `approved_version_updated` case event (`{ revisionId, version, supersededRevisionId }`)
-- is written with the actor, in one transaction. The case stays `approved` and the head
-- stays where it is (`head_version` unchanged, as approval leaves it).
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown or soft-deleted case, or a revision of another case), `STALE_HEAD` (not the
-- head, or `head_version` moved), `CASE_NOT_APPROVABLE` (the case is not `approved`, has no
-- approved revision, or its approved pointer is not an `approved` revision),
-- `REVISION_NOT_WRITABLE` (the revision is not a `working` fork: e.g. the head is the
-- approved revision itself) or `STALE_REVISION` (`version` moved); nothing is written
-- then. Service role only.
create function public.update_approved_revision(
  p_case_id uuid,
  p_revision_id uuid,
  p_expected_revision_version integer,
  p_expected_head_version integer,
  p_actor_id uuid
)
returns public.revision
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_status text;
  c_head_revision_id uuid;
  c_approved_revision_id uuid;
  c_head_version integer;
  current_rev public.revision;
  approved_rev public.revision;
begin
  if p_case_id is null or p_revision_id is null or p_expected_revision_version is null
     or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select status, head_revision_id, approved_revision_id, head_version
    into c_status, c_head_revision_id, c_approved_revision_id, c_head_version
    from public.case_study
   where id = p_case_id and deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into current_rev from public.revision where id = p_revision_id for update;
  if not found or current_rev.case_id is distinct from p_case_id then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if c_head_revision_id is distinct from p_revision_id or c_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  -- An approved case from before Story 4.8 may have no approved revision: nothing to update.
  if c_status <> 'approved' or c_approved_revision_id is null then
    raise exception 'CASE_NOT_APPROVABLE' using errcode = 'P0001';
  end if;
  if current_rev.status <> 'working' or c_approved_revision_id = p_revision_id then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;
  if current_rev.version <> p_expected_revision_version then
    raise exception 'STALE_REVISION' using errcode = 'P0001';
  end if;

  -- The old approved revision first: the status only moves forward (approved → superseded).
  update public.revision
     set status = 'superseded'
   where id = c_approved_revision_id and status = 'approved';
  if not found then
    raise exception 'CASE_NOT_APPROVABLE' using errcode = 'P0001';
  end if;

  update public.revision
     set status = 'approved'
   where id = p_revision_id
  returning * into approved_rev;

  update public.case_study
     set approved_revision_id = p_revision_id
   where id = p_case_id;

  insert into public.case_event (case_id, revision_id, actor_id, type, data)
  values (
    p_case_id,
    p_revision_id,
    p_actor_id,
    'approved_version_updated',
    jsonb_build_object('revisionId', p_revision_id, 'version', approved_rev.version, 'supersededRevisionId', c_approved_revision_id)
  );

  return approved_rev;
end;
$$;

revoke all on function public.update_approved_revision(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.update_approved_revision(uuid, uuid, integer, integer, uuid) to service_role;

-- **Scarta le modifiche**: supersedes the `working` fork `p_revision_id`, the head of
-- approved case `p_case_id`, and points `head_revision_id` back at `approved_revision_id`
-- by compare-and-set on `head_version` (then incremented), with one `revision_discarded`
-- case event (`{ discardedRevisionId, headVersion }`) and the actor, in one transaction.
-- Returns the approved revision, the head again. The case stays `approved`.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown or soft-deleted case, or a revision of another case), `STALE_HEAD` (not the
-- head, or `head_version` moved), `CASE_NOT_EDITABLE` (the case is not `approved`) or
-- `REVISION_NOT_WRITABLE` (the head is the approved revision itself, or not `working`);
-- nothing is written then. Service role only.
create function public.discard_head(
  p_case_id uuid,
  p_revision_id uuid,
  p_expected_head_version integer,
  p_actor_id uuid
)
returns public.revision
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_status text;
  c_head_revision_id uuid;
  c_approved_revision_id uuid;
  c_head_version integer;
  current_rev public.revision;
  live_rev public.revision;
begin
  if p_case_id is null or p_revision_id is null or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select status, head_revision_id, approved_revision_id, head_version
    into c_status, c_head_revision_id, c_approved_revision_id, c_head_version
    from public.case_study
   where id = p_case_id and deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into current_rev from public.revision where id = p_revision_id for update;
  if not found or current_rev.case_id is distinct from p_case_id then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if c_head_revision_id is distinct from p_revision_id or c_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  if c_status <> 'approved' or c_approved_revision_id is null then
    raise exception 'CASE_NOT_EDITABLE' using errcode = 'P0001';
  end if;
  if current_rev.status <> 'working' or c_approved_revision_id = p_revision_id then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;

  update public.revision
     set status = 'superseded'
   where id = p_revision_id;

  update public.case_study
     set head_revision_id = c_approved_revision_id, head_version = head_version + 1
   where id = p_case_id;

  insert into public.case_event (case_id, revision_id, actor_id, type, data)
  values (
    p_case_id,
    p_revision_id,
    p_actor_id,
    'revision_discarded',
    jsonb_build_object('discardedRevisionId', p_revision_id, 'headVersion', c_head_version + 1)
  );

  select * into live_rev from public.revision where id = c_approved_revision_id;
  return live_rev;
end;
$$;

revoke all on function public.discard_head(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.discard_head(uuid, uuid, integer, uuid) to service_role;
