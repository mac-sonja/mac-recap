-- Story 2.5 (backend, part 2): `case_study.status` changes only through
-- `transition_case_study`, called by `case-study.transition()` (AD-3).
-- Forward-only (AD-12). The transition table lives only in the case-study
-- domain (`domain/transition.ts`): the domain computes `to` from the expected
-- `from` and the event; this function compare-and-sets and logs it.

-- Rejects any status change not made inside `transition_case_study`, which sets
-- the transaction-local flag around its single update. Soft deletes and
-- `updated_at` touches leave status unchanged and pass.
create function public.case_study_reject_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('mac_recap.status_transition', true), '') <> 'on' then
    raise exception 'case_study.status changes only through transition_case_study' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger case_study_reject_status_change
  before update on public.case_study
  for each row execute function public.case_study_reject_status_change();

revoke all on function public.case_study_reject_status_change() from public, anon, authenticated;

-- Moves a non-deleted case from `p_from` to `p_to` (both computed by the domain)
-- and appends its `transition` event, in one transaction. Raises P0001 with the
-- message `NOT_FOUND` (unknown or soft-deleted case), `STALE_STATUS` (status is
-- no longer `p_from`) or `INVALID_TRANSITION` (`p_from` equals `p_to`); nothing
-- is written then. Service role only.
create function public.transition_case_study(
  p_case_id uuid,
  p_event text,
  p_from text,
  p_to text,
  p_actor_id uuid
)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved public.case_study;
  updated boolean;
begin
  if p_from is not distinct from p_to then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = 'from and to must differ';
  end if;

  perform pg_catalog.set_config('mac_recap.status_transition', 'on', true);
  update public.case_study
     set status = p_to
   where id = p_case_id
     and deleted_at is null
     and status = p_from
  returning * into moved;
  -- Capture FOUND now: the PERFORM below resets it.
  updated := found;
  perform pg_catalog.set_config('mac_recap.status_transition', 'off', true);

  if not updated then
    perform 1 from public.case_study where id = p_case_id and deleted_at is null;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0001';
    end if;
    raise exception 'STALE_STATUS' using errcode = 'P0001';
  end if;

  insert into public.case_event (case_id, actor_id, type, data)
  values (
    moved.id,
    p_actor_id,
    'transition',
    jsonb_build_object('event', p_event, 'from', p_from, 'to', p_to)
  );

  return moved;
end;
$$;

revoke all on function public.transition_case_study(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.transition_case_study(uuid, text, text, text, uuid) to service_role;
