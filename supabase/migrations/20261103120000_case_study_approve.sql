-- Story 4.8: approving a case study, owned by the `case-study` module (AD-11).
-- Forward-only (AD-12).
--
-- A person approves the case's `working` head of an `in_review` case after the
-- configurator measured no overflow in any format and the use case found no
-- referenced material deleted (AR18, AR19; C39: no per-block check for the demo).
-- Compare-and-set on `revision.version` and `case_study.head_version`, so an
-- approval based on an older read never lands.

-- Approves revision `p_revision_id`, the head of case `p_case_id`, when its `version`
-- is still `p_expected_revision_version` and the case's `head_version` is still
-- `p_expected_head_version`: the revision becomes `approved`, the case `approved`
-- (AD-3 `approve`, through the status-transition flag as `transition_case_study`) with
-- `approved_revision_id` set, and two case events are written: `transition`
-- (`{ event: "approve", from, to }`) and `revision_approved` (`{ revisionId, version }`),
-- both with the actor. All in one transaction; the case row is locked first, as the
-- other revision writes lock it.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT`, `NOT_FOUND`
-- (unknown or soft-deleted case, or a revision of another case), `STALE_HEAD` (not
-- the head, or `head_version` moved), `CASE_NOT_APPROVABLE` (the case is not
-- `in_review`), `REVISION_NOT_WRITABLE` (the revision is not `working`) or
-- `STALE_REVISION` (`version` moved); nothing is written then. Service role only.
create function public.approve_revision(
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
  c_head_version integer;
  current_rev public.revision;
  approved_rev public.revision;
begin
  if p_case_id is null or p_revision_id is null or p_expected_revision_version is null
     or p_expected_head_version is null or p_actor_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select status, head_revision_id, head_version into c_status, c_head_revision_id, c_head_version
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
  if c_status <> 'in_review' then
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

  perform pg_catalog.set_config('mac_recap.status_transition', 'on', true);
  update public.case_study
     set status = 'approved',
         approved_revision_id = p_revision_id
   where id = p_case_id;
  perform pg_catalog.set_config('mac_recap.status_transition', 'off', true);

  insert into public.case_event (case_id, actor_id, type, data)
  values (p_case_id, p_actor_id, 'transition', jsonb_build_object('event', 'approve', 'from', 'in_review', 'to', 'approved'));
  insert into public.case_event (case_id, revision_id, actor_id, type, data)
  values (
    p_case_id,
    p_revision_id,
    p_actor_id,
    'revision_approved',
    jsonb_build_object('revisionId', p_revision_id, 'version', approved_rev.version)
  );

  return approved_rev;
end;
$$;

revoke all on function public.approve_revision(uuid, uuid, integer, integer, uuid) from public, anon, authenticated;
grant execute on function public.approve_revision(uuid, uuid, integer, integer, uuid) to service_role;
