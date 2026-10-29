-- Story 4.3a: saving an edited document (`revision.doc`), owned by the `case-study`
-- module (AD-11). Forward-only (AD-12).
--
-- The configurator's autosave writes the whole edited `doc` (already validated by
-- zod in `generation/domain`) by compare-and-set on `revision.version`, so a save
-- based on an older read never overwrites a newer one. Only the case's head may be
-- edited, only while it is `working` and the case is `in_review` (an approved case
-- is edited through a fork, Story 4.9). `generated_doc` never changes (the
-- `revision_reject_immutable_change` trigger already refuses it).

-- Writes `p_doc` to the `working` head revision `p_revision_id` of an `in_review`
-- case when its `version` still equals `p_expected_version`, increments `version`,
-- keeps `schema_version` in step and writes one `revision_saved` case event
-- (`{ version }`, the new version). All in one transaction; the case row is locked
-- first, as `create_working_revision` locks it, so the two never deadlock.
--
-- Raises P0001 with the message, checked in this order, `INVALID_INPUT` (a shape
-- check failed), `NOT_FOUND` (unknown revision, or its case unknown or soft-deleted),
-- `STALE_HEAD` (the revision is no longer the case's head), `CASE_NOT_EDITABLE`
-- (the case is not `in_review`), `REVISION_NOT_WRITABLE` (the revision is not
-- `working`) or `STALE_REVISION` (`version` moved since it was read); nothing is
-- written then. Service role only.
create function public.save_revision_doc(
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

  select status, head_revision_id into c_status, c_head_revision_id
    from public.case_study
   where id = r_case_id and deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if c_head_revision_id is distinct from p_revision_id then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;
  if c_status <> 'in_review' then
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
