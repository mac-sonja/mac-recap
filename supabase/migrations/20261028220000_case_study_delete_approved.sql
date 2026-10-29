-- Delete an approved case history too (Story 5.2 part; AR3 amended by the owner on
-- 2026-10-28: delete in `draft` or `approved`, always soft). Forward-only (AD-12): the
-- function from 20261021170000_case_study_delete.sql is dropped and replaced, with a third
-- argument, the status the person confirmed. No table changes.
--
-- Compatible with the running image (README, Migrations): `p_status` defaults to `draft`,
-- so the previous image's two-argument call keeps its exact meaning (delete a draft only)
-- until the new image is out. A later migration may drop the default.
--
-- The caller states the status it is deleting, and the case must still be in it: so
-- **Elimina bozza** never deletes an approved case and **Elimina** never deletes a draft,
-- even when the status changed after the page loaded. Generating and Da approvare cases
-- stay undeletable.

drop function public.delete_case_study(uuid, uuid);

-- Soft-deletes one non-deleted case in `p_status` (`draft` or `approved`) and writes its
-- `case_deleted` case event, with the actor and reason `{p_status}_deleted`, in one
-- transaction; returns the case as deleted. The row is read `for update`, so a concurrent
-- status change either waits for the delete or makes it refuse. Raises P0001 `NOT_FOUND`
-- (unknown or already deleted case) or `CASE_NOT_DELETABLE` (`p_status` is not deletable,
-- or the case is not in `p_status`); nothing is written then. Service role only.
create function public.delete_case_study(p_case_id uuid, p_actor_id uuid, p_status text default 'draft')
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
  if p_status is null or p_status not in ('draft', 'approved') or existing.status <> p_status then
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
      'reason', p_status || '_deleted',
      'clientId', deleted.client_id,
      'code', deleted.code,
      'status', deleted.status
    )
  );

  return deleted;
end;
$$;

revoke all on function public.delete_case_study(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_case_study(uuid, uuid, text) to service_role;
