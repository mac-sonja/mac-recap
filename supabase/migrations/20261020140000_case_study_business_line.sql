-- Story 2.17 (owner, 2026-10-20): a case history has a business line, picked on
-- wizard step 1 Dettagli, and the name, year, language and business line of a draft
-- can be edited there. Owned by the `case-study` module (AD-11). Forward-only (AD-12).
--
-- `business_line` is one of a fixed list, which must list exactly BUSINESS_LINES in
-- case-study/domain/case-study.ts. Cases created before this story have none (null)
-- and keep it until the wizard saves one. The check is added `NOT VALID`; it accepts
-- null, so a legacy row can still change status or be soft-deleted with its client.
-- A new case always gets one: `create_case_study` and `update_case_study_details`
-- refuse a null business line (P0001 `INVALID_INPUT`).
--
-- A draft whose year changes is renumbered in the new year (owner, 2026-10-20,
-- AD-21 note: drafts renumber when their year changes); only
-- `update_case_study_details` may change a code or number.

alter table public.case_study add column business_line text null;

alter table public.case_study
  add constraint case_study_business_line_check
  check (business_line in ('branding', 'social_media', 'video', 'web_design', 'advertising', 'eventi'))
  not valid;

-- ---------------------------------------------------------------------------
-- create_case_study
-- ---------------------------------------------------------------------------

-- As `20261019180000_case_study_client_delete.sql`, plus `p_business_line`, stored
-- on the case and recorded in its `case_created` event. A null business line raises
-- P0001 `INVALID_INPUT`; one outside the list fails the check. Nothing is written then.
-- Service role only.
drop function public.create_case_study(text, uuid, integer, text, uuid);

create function public.create_case_study(
  p_name text,
  p_client_id uuid,
  p_year integer,
  p_locale text,
  p_business_line text,
  p_actor_id uuid
)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner public.client;
  next_number integer;
  created public.case_study;
begin
  if p_business_line is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select * into owner from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.case_number_counter as counter (client_id, year, last_number)
  values (p_client_id, p_year, 1)
  on conflict (client_id, year) do update set last_number = counter.last_number + 1
  returning counter.last_number into next_number;

  insert into public.case_study (name, client_id, year, locale, business_line, created_by, number, code)
  values (
    p_name,
    p_client_id,
    p_year,
    coalesce(p_locale, 'it'),
    p_business_line,
    p_actor_id,
    next_number,
    public.case_study_code(owner.code, p_year, next_number)
  )
  returning * into created;

  insert into public.case_event (case_id, actor_id, type, data)
  values (
    created.id,
    p_actor_id,
    'case_created',
    jsonb_build_object(
      'name', created.name,
      'client', owner.name,
      'clientId', owner.id,
      'clientCode', owner.code,
      'code', created.code,
      'year', created.year,
      'locale', created.locale,
      'businessLine', created.business_line
    )
  );

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- case_study_reject_code_change
-- ---------------------------------------------------------------------------

-- As `20261015120000_case_study_clients_and_codes.sql`, except that
-- `update_case_study_details` may renumber a draft whose year changes (owner,
-- 2026-10-20, AD-21 note): it sets the transaction-local `mac_recap.case_renumber`
-- to `on` around its own update only. Every other change of code or number is refused.
create or replace function public.case_study_reject_code_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.code is distinct from old.code or new.number is distinct from old.number)
     and coalesce(current_setting('mac_recap.case_renumber', true), '') <> 'on' then
    raise exception 'case_study.code and case_study.number are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_case_study_details
-- ---------------------------------------------------------------------------

-- Saves the name, year, language and business line of a draft case (wizard step 1,
-- an existing case). The client is fixed once the case exists. The row is locked
-- `for update`, so concurrent saves apply one after the other. When the year
-- changes (owner, 2026-10-20) the draft takes the next number for its client in the
-- new year from `case_number_counter`, exactly as `create_case_study` does, and a
-- new code; its old number is never reused. When nothing changed the row is
-- returned as is and nothing is written; otherwise one `case_details_updated` case
-- event records the new values (and, on a renumber, the previous year and code)
-- with the actor, in the same transaction. Raises P0001 `NOT_FOUND` (unknown or
-- soft-deleted case), `STALE_STATUS` (no longer a draft) or `INVALID_INPUT` (null
-- business line); a value outside the list fails the check. Nothing is written
-- then. Service role only.
create function public.update_case_study_details(
  p_case_id uuid,
  p_name text,
  p_year integer,
  p_locale text,
  p_business_line text,
  p_actor_id uuid
)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.case_study;
  owner public.client;
  updated public.case_study;
  next_number integer;
  next_code text;
  event_data jsonb;
begin
  select * into existing from public.case_study where id = p_case_id and deleted_at is null for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if existing.status <> 'draft' then
    raise exception 'STALE_STATUS' using errcode = 'P0001';
  end if;
  if p_business_line is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if existing.name = p_name
     and existing.year = p_year
     and existing.locale = p_locale
     and existing.business_line is not distinct from p_business_line then
    return existing;
  end if;

  next_number := existing.number;
  next_code := existing.code;
  if existing.year <> p_year then
    select * into owner from public.client where id = existing.client_id for share;

    insert into public.case_number_counter as counter (client_id, year, last_number)
    values (existing.client_id, p_year, 1)
    on conflict (client_id, year) do update set last_number = counter.last_number + 1
    returning counter.last_number into next_number;

    next_code := public.case_study_code(owner.code, p_year, next_number);
  end if;

  perform pg_catalog.set_config('mac_recap.case_renumber', 'on', true);
  update public.case_study set
    name = p_name,
    year = p_year,
    locale = p_locale,
    business_line = p_business_line,
    number = next_number,
    code = next_code
  where id = p_case_id
  returning * into updated;
  perform pg_catalog.set_config('mac_recap.case_renumber', 'off', true);

  event_data := jsonb_build_object(
    'name', updated.name,
    'year', updated.year,
    'locale', updated.locale,
    'businessLine', updated.business_line
  );
  if existing.year <> updated.year then
    event_data := event_data || jsonb_build_object(
      'previousYear', existing.year,
      'previousCode', existing.code,
      'code', updated.code
    );
  end if;

  insert into public.case_event (case_id, actor_id, type, data)
  values (updated.id, p_actor_id, 'case_details_updated', event_data);

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.create_case_study(text, uuid, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_case_study_details(uuid, text, integer, text, text, uuid) from public, anon, authenticated;
revoke all on function public.case_study_reject_code_change() from public, anon, authenticated;

grant execute on function public.create_case_study(text, uuid, integer, text, text, uuid) to service_role;
grant execute on function public.update_case_study_details(uuid, text, integer, text, text, uuid) to service_role;
