-- Story 4.3d, 2026-11-04 (owner, 2026-11-03): the case's year and services (the business
-- lines) can be changed from the configurator while the case is Da approvare. Owned by
-- the `case-study` module (AD-11).
--
-- `update_case_fields(p_case_id, p_year, p_business_lines, p_actor_id)` saves both on a
-- non-deleted case in `in_review` only: an unknown or deleted case raises P0001
-- `NOT_FOUND`, any other status P0001 `STALE_STATUS`, no business line P0001
-- `INVALID_INPUT` (an unknown one fails `case_study_business_lines_check`). It never
-- touches `code` or `number` (the year changes, the code stays: `case_study_reject_code_change`
-- refuses any change of them, as `mac_recap.case_renumber` is never set here). A changed
-- save writes one `case_details_updated` event `{ year, businessLines }` with the actor in
-- the same transaction; an unchanged one writes nothing. Nothing is written on any error.
-- Service role only.

create function public.update_case_fields(
  p_case_id uuid,
  p_year integer,
  p_business_lines text[],
  p_actor_id uuid
)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.case_study;
  updated public.case_study;
begin
  select * into existing from public.case_study where id = p_case_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if existing.status <> 'in_review' then
    raise exception 'STALE_STATUS' using errcode = 'P0001';
  end if;
  if p_year is null or coalesce(cardinality(p_business_lines), 0) = 0 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if existing.year = p_year and existing.business_lines = p_business_lines then
    return existing;
  end if;

  update public.case_study set
    year = p_year,
    business_lines = p_business_lines
  where id = p_case_id
  returning * into updated;

  insert into public.case_event (case_id, actor_id, type, data)
  values (
    updated.id,
    p_actor_id,
    'case_details_updated',
    jsonb_build_object('year', updated.year, 'businessLines', updated.business_lines)
  );

  return updated;
end;
$$;

revoke all on function public.update_case_fields(uuid, integer, text[], uuid) from public, anon, authenticated;
grant execute on function public.update_case_fields(uuid, integer, text[], uuid) to service_role;
