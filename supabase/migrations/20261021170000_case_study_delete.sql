-- Delete a draft case history (Story 4.1 row action, AR3: delete only in `draft`, soft).
-- Forward-only (AD-12). No applied migration is edited and no table changes: a case
-- already has `deleted_at`, and the delete and truncate triggers on `case_study` stay
-- (a soft delete is an UPDATE).
--
-- A deleted case gets `deleted_at`; no row and no storage object is removed, so its
-- events, material and number stay (numbers are never reused, AD-21). Every read and
-- every write already ignores a case with `deleted_at`.

-- Soft-deletes one non-deleted draft and writes its `case_deleted` case event, with the
-- actor, in one transaction; returns the case as deleted. The row is read `for update`,
-- so a concurrent status change or details save either waits for the delete or makes
-- it refuse. Raises P0001 `NOT_FOUND` (unknown or already deleted case) or
-- `CASE_NOT_DELETABLE` (the case is no longer a draft); nothing is written then.
-- Service role only.
create function public.delete_case_study(p_case_id uuid, p_actor_id uuid)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.case_study;
  deleted public.case_study;
begin
  select * into existing from public.case_study where id = p_case_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if existing.status <> 'draft' then
    raise exception 'CASE_NOT_DELETABLE' using errcode = 'P0001';
  end if;

  update public.case_study set deleted_at = now() where id = p_case_id
  returning * into deleted;

  insert into public.case_event (case_id, actor_id, type, data)
  values (
    deleted.id,
    p_actor_id,
    'case_deleted',
    jsonb_build_object(
      'reason', 'draft_deleted',
      'clientId', deleted.client_id,
      'code', deleted.code,
      'status', deleted.status
    )
  );

  return deleted;
end;
$$;

revoke all on function public.delete_case_study(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_case_study(uuid, uuid) to service_role;
