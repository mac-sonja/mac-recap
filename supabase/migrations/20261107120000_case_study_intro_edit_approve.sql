-- Story 4.11a: a client's intro-and-outro document in the configurator, owned by the
-- `case-study` module (AD-11). Forward-only (AD-12).
--
-- The intro's own versions of `save_revision_doc` (Story 4.3a) and `approve_revision`
-- (Story 4.8): the same compare-and-set on `revision.version` and
-- `client_intro.head_version`, the intro row locked first, and `client_event` in place of
-- `case_event`. Editing an approved intro (fork, update, discard) comes with Story 4.11b:
-- only an `in_review` intro is written or approved here.

-- Writes `p_doc` to the `working` head revision `p_revision_id` of an `in_review` intro of
-- a non-deleted client when its `version` still equals `p_expected_version`, increments
-- `version`, keeps `schema_version` in step and writes one `revision_saved` client event
-- (`{ version }`).
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown revision, not an intro's, or its client deleted), `STALE_HEAD` (not the head),
-- `CASE_NOT_EDITABLE` (the intro is not `in_review`), `REVISION_NOT_WRITABLE` (not
-- `working`) or `STALE_REVISION` (`version` moved); nothing is written then. Service role
-- only.
create function public.save_intro_revision_doc(
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

  select i.status, i.head_revision_id into i_status, i_head_revision_id
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
  if i_status <> 'in_review' then
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

-- Approves revision `p_revision_id`, the head of intro `p_client_intro_id`, when its
-- `version` is still `p_expected_revision_version` and the intro's `head_version` is still
-- `p_expected_head_version`: the revision becomes `approved`, the intro `approved` (AD-3
-- `approve`, through the `mac_recap.intro_transition` flag as `transition_client_intro`)
-- with `approved_revision_id` set, and two client events are written: `transition`
-- (`{ event: "approve", from, to }`) and `revision_approved` (`{ revisionId, version }`),
-- both with the actor. All in one transaction; the intro row is locked first.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown intro, its client deleted, or a revision of another subject), `STALE_HEAD`
-- (not the head, or `head_version` moved), `CASE_NOT_APPROVABLE` (the intro is not
-- `in_review`), `REVISION_NOT_WRITABLE` (not `working`) or `STALE_REVISION` (`version`
-- moved); nothing is written then. Service role only.
create function public.approve_client_intro(
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
  i_head_version integer;
  current_rev public.revision;
  approved_rev public.revision;
begin
  if p_client_intro_id is null or p_revision_id is null or p_expected_revision_version is null
     or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select i.status, i.head_revision_id, i.head_version into i_status, i_head_revision_id, i_head_version
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
  if i_status <> 'in_review' then
    raise exception 'CASE_NOT_APPROVABLE' using errcode = 'P0001';
  end if;
  if current_rev.status <> 'working' then
    raise exception 'REVISION_NOT_WRITABLE' using errcode = 'P0001';
  end if;
  if current_rev.version <> p_expected_revision_version then
    raise exception 'STALE_REVISION' using errcode = 'P0001';
  end if;

  update public.revision
     set status = 'approved'
   where id = p_revision_id
  returning * into approved_rev;

  perform pg_catalog.set_config('mac_recap.intro_transition', 'on', true);
  update public.client_intro
     set status = 'approved',
         approved_revision_id = p_revision_id
   where id = p_client_intro_id;
  perform pg_catalog.set_config('mac_recap.intro_transition', 'off', true);

  insert into public.client_event (client_intro_id, actor_id, type, data)
  values (p_client_intro_id, p_actor_id, 'transition', jsonb_build_object('event', 'approve', 'from', 'in_review', 'to', 'approved'));
  insert into public.client_event (client_intro_id, revision_id, actor_id, type, data)
  values (
    p_client_intro_id,
    p_revision_id,
    p_actor_id,
    'revision_approved',
    jsonb_build_object('revisionId', p_revision_id, 'version', approved_rev.version)
  );

  return approved_rev;
end;
$$;

revoke all on function public.save_intro_revision_doc(uuid, jsonb, integer, uuid) from public, anon, authenticated;
revoke all on function public.approve_client_intro(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.save_intro_revision_doc(uuid, jsonb, integer, uuid) to service_role;
grant execute on function public.approve_client_intro(uuid, uuid, integer, integer, uuid) to service_role;
