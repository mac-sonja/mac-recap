-- Story 4.11b: editing an approved client intro, owned by the `case-study` module
-- (AD-11). Forward-only (AD-12).
--
-- Story 4.9's model for the intro subject: an approved intro stays `approved`. The first
-- edit forks a `working` copy of the approved revision (`fork_intro_head`) and makes it
-- the head; every save then lands on that copy (`save_intro_revision_doc`, now also for
-- an approved intro's fork) while every live read keeps returning `approved_revision_id`.
-- **Aggiorna la versione approvata** (`update_approved_intro_revision`) makes the copy
-- the approved revision and supersedes the old one; **Scarta le modifiche**
-- (`discard_intro_head`) supersedes the copy and points the head back at the approved
-- revision. Each is one transaction with a client event (never a case event) carrying
-- the actor. Nothing here changes `client_intro.status`: an approved intro has no path
-- back to Da approvare.

-- Forks the head of the approved intro `p_client_intro_id`: a `working` revision copied
-- from `approved_revision_id` (`doc`, `generated_doc`, `manifest`, the generator's meta
-- and `schema_version`), made the head by compare-and-set on `head_version` (then
-- incremented), with one `revision_forked` client event. Idempotent: when the head is
-- already a `working` copy (not the approved revision), it is returned as it is and
-- nothing is written, whatever `p_expected_head_version` says. Returns
-- `{ revision, headVersion }`. The intro row is locked first.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown intro, or its client deleted), `CASE_NOT_EDITABLE` (the intro is not
-- `approved`, or has no approved revision), `REVISION_NOT_WRITABLE` (the head is neither
-- the approved revision nor a working copy) or `STALE_HEAD` (`head_version` moved);
-- nothing is written then. Service role only.
create function public.fork_intro_head(
  p_client_intro_id uuid,
  p_expected_head_version integer,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i_status text;
  i_head_revision_id uuid;
  i_approved_revision_id uuid;
  i_head_version integer;
  head_rev public.revision;
  source_rev public.revision;
  created public.revision;
begin
  if p_client_intro_id is null or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select i.status, i.head_revision_id, i.approved_revision_id, i.head_version
    into i_status, i_head_revision_id, i_approved_revision_id, i_head_version
    from public.client_intro i
    join public.client c on c.id = i.client_id
   where i.id = p_client_intro_id and c.deleted_at is null
     for update of i;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if i_status <> 'approved' or i_approved_revision_id is null then
    raise exception 'CASE_NOT_EDITABLE' using errcode = 'P0001';
  end if;

  -- Already forked: the copy is the head.
  if i_head_revision_id is distinct from i_approved_revision_id then
    select * into head_rev from public.revision where id = i_head_revision_id;
    if not found or head_rev.status <> 'working' then
      raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
    end if;
    return jsonb_build_object('revision', to_jsonb(head_rev), 'headVersion', i_head_version);
  end if;

  if i_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;

  select * into source_rev from public.revision where id = i_approved_revision_id;
  if not found or source_rev.status <> 'approved' then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;

  insert into public.revision (client_intro_id, status, generated_doc, doc, manifest, model, fell_back, prompt_version, schema_version, created_by)
  values (
    p_client_intro_id,
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

  update public.client_intro
     set head_revision_id = created.id, head_version = head_version + 1
   where id = p_client_intro_id;

  insert into public.client_event (client_intro_id, revision_id, actor_id, type, data)
  values (
    p_client_intro_id,
    created.id,
    p_actor_id,
    'revision_forked',
    jsonb_build_object('fromRevisionId', i_approved_revision_id, 'headVersion', i_head_version + 1)
  );

  return jsonb_build_object('revision', to_jsonb(created), 'headVersion', i_head_version + 1);
end;
$$;

revoke all on function public.fork_intro_head(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fork_intro_head(uuid, integer, uuid) to service_role;

-- Story 4.11a's intro save, now also for an approved intro's fork (Story 4.11b): writes
-- `p_doc` to the `working` head revision `p_revision_id` when its `version` still equals
-- `p_expected_version`, increments `version`, keeps `schema_version` in step and writes
-- one `revision_saved` client event (`{ version }`). The intro must be `in_review`, or
-- `approved` with an approved revision and a head other than it (the fork); the approved
-- revision itself is never written.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`,
-- `STALE_HEAD`, `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE` or `STALE_REVISION`, as
-- before; nothing is written then. Service role only.
create or replace function public.save_intro_revision_doc(
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
  r_intro_id uuid;
  i_status text;
  i_head_revision_id uuid;
  i_approved_revision_id uuid;
  current_rev public.revision;
  saved public.revision;
begin
  if p_revision_id is null or p_expected_version is null or p_actor_id is null
     or coalesce(jsonb_typeof(p_doc), '') <> 'object'
     or coalesce(jsonb_typeof(p_doc -> 'schemaVersion'), '') <> 'number'
     or coalesce(p_doc ->> 'schemaVersion', '') !~ '^[0-9]{1,4}$'
     or coalesce(p_doc ->> 'kind', '') <> 'client_intro' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select client_intro_id into r_intro_id from public.revision where id = p_revision_id;
  if r_intro_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select i.status, i.head_revision_id, i.approved_revision_id
    into i_status, i_head_revision_id, i_approved_revision_id
    from public.client_intro i
    join public.client c on c.id = i.client_id
   where i.id = r_intro_id and c.deleted_at is null
     for update of i;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if i_head_revision_id is distinct from p_revision_id then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  if not (i_status = 'in_review'
          or (i_status = 'approved' and i_approved_revision_id is not null and i_head_revision_id is distinct from i_approved_revision_id)) then
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

  insert into public.client_event (client_intro_id, revision_id, actor_id, type, data)
  values (r_intro_id, p_revision_id, p_actor_id, 'revision_saved', jsonb_build_object('version', saved.version));

  return saved;
end;
$$;

revoke all on function public.save_intro_revision_doc(uuid, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.save_intro_revision_doc(uuid, jsonb, integer, uuid) to service_role;

-- **Aggiorna la versione approvata** for an intro: makes the `working` fork
-- `p_revision_id`, the head of approved intro `p_client_intro_id`, the approved
-- revision, when its `version` is still `p_expected_revision_version` and the intro's
-- `head_version` is still `p_expected_head_version`. The fork becomes `approved`, the
-- previous approved revision `superseded`, `approved_revision_id` the fork, and one
-- `approved_version_updated` client event (`{ revisionId, version, supersededRevisionId }`)
-- is written with the actor, in one transaction. The intro stays `approved` and the head
-- stays where it is (`head_version` unchanged, as approval leaves it).
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown intro, its client deleted, or a revision of another subject), `STALE_HEAD`
-- (not the head, or `head_version` moved), `CASE_NOT_APPROVABLE` (the intro is not
-- `approved`, has no approved revision, or its approved pointer is not an `approved`
-- revision), `REVISION_NOT_WRITABLE` (the revision is not a `working` fork) or
-- `STALE_REVISION` (`version` moved); nothing is written then. Service role only.
create function public.update_approved_intro_revision(
  p_client_intro_id uuid,
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
  i_status text;
  i_head_revision_id uuid;
  i_approved_revision_id uuid;
  i_head_version integer;
  current_rev public.revision;
  approved_rev public.revision;
begin
  if p_client_intro_id is null or p_revision_id is null or p_expected_revision_version is null
     or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select i.status, i.head_revision_id, i.approved_revision_id, i.head_version
    into i_status, i_head_revision_id, i_approved_revision_id, i_head_version
    from public.client_intro i
    join public.client c on c.id = i.client_id
   where i.id = p_client_intro_id and c.deleted_at is null
     for update of i;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into current_rev from public.revision where id = p_revision_id for update;
  if not found or current_rev.client_intro_id is distinct from p_client_intro_id then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if i_head_revision_id is distinct from p_revision_id or i_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  if i_status <> 'approved' or i_approved_revision_id is null then
    raise exception 'CASE_NOT_APPROVABLE' using errcode = 'P0001';
  end if;
  if current_rev.status <> 'working' or i_approved_revision_id = p_revision_id then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;
  if current_rev.version <> p_expected_revision_version then
    raise exception 'STALE_REVISION' using errcode = 'P0001';
  end if;

  -- The old approved revision first: the status only moves forward (approved → superseded).
  update public.revision
     set status = 'superseded'
   where id = i_approved_revision_id and status = 'approved';
  if not found then
    raise exception 'CASE_NOT_APPROVABLE' using errcode = 'P0001';
  end if;

  update public.revision
     set status = 'approved'
   where id = p_revision_id
  returning * into approved_rev;

  update public.client_intro
     set approved_revision_id = p_revision_id
   where id = p_client_intro_id;

  insert into public.client_event (client_intro_id, revision_id, actor_id, type, data)
  values (
    p_client_intro_id,
    p_revision_id,
    p_actor_id,
    'approved_version_updated',
    jsonb_build_object('revisionId', p_revision_id, 'version', approved_rev.version, 'supersededRevisionId', i_approved_revision_id)
  );

  return approved_rev;
end;
$$;

revoke all on function public.update_approved_intro_revision(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.update_approved_intro_revision(uuid, uuid, integer, integer, uuid) to service_role;

-- **Scarta le modifiche** for an intro: supersedes the `working` fork `p_revision_id`,
-- the head of approved intro `p_client_intro_id`, and points `head_revision_id` back at
-- `approved_revision_id` by compare-and-set on `head_version` (then incremented), with one
-- `revision_discarded` client event (`{ discardedRevisionId, headVersion }`) and the
-- actor, in one transaction. Returns the approved revision, the head again. The intro
-- stays `approved`.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown intro, its client deleted, or a revision of another subject), `STALE_HEAD`
-- (not the head, or `head_version` moved), `CASE_NOT_EDITABLE` (the intro is not
-- `approved`) or `REVISION_NOT_WRITABLE` (the head is the approved revision itself, or
-- not `working`); nothing is written then. Service role only.
create function public.discard_intro_head(
  p_client_intro_id uuid,
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
  i_status text;
  i_head_revision_id uuid;
  i_approved_revision_id uuid;
  i_head_version integer;
  current_rev public.revision;
  live_rev public.revision;
begin
  if p_client_intro_id is null or p_revision_id is null or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select i.status, i.head_revision_id, i.approved_revision_id, i.head_version
    into i_status, i_head_revision_id, i_approved_revision_id, i_head_version
    from public.client_intro i
    join public.client c on c.id = i.client_id
   where i.id = p_client_intro_id and c.deleted_at is null
     for update of i;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into current_rev from public.revision where id = p_revision_id for update;
  if not found or current_rev.client_intro_id is distinct from p_client_intro_id then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if i_head_revision_id is distinct from p_revision_id or i_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  if i_status <> 'approved' or i_approved_revision_id is null then
    raise exception 'CASE_NOT_EDITABLE' using errcode = 'P0001';
  end if;
  if current_rev.status <> 'working' or i_approved_revision_id = p_revision_id then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;

  update public.revision
     set status = 'superseded'
   where id = p_revision_id;

  update public.client_intro
     set head_revision_id = i_approved_revision_id, head_version = head_version + 1
   where id = p_client_intro_id;

  insert into public.client_event (client_intro_id, revision_id, actor_id, type, data)
  values (
    p_client_intro_id,
    p_revision_id,
    p_actor_id,
    'revision_discarded',
    jsonb_build_object('discardedRevisionId', p_revision_id, 'headVersion', i_head_version + 1)
  );

  select * into live_rev from public.revision where id = i_approved_revision_id;
  return live_rev;
end;
$$;

revoke all on function public.discard_intro_head(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.discard_intro_head(uuid, uuid, integer, uuid) to service_role;
