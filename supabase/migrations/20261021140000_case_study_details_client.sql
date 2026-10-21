-- The client of a draft can change in Dettagli (owner, 2026-10-21). As
-- `update_case_study_details` in `20261020140000_case_study_business_line.sql`,
-- plus `p_client_id`: a draft whose client or year changes takes the next number
-- for that client in that year from `case_number_counter` (exactly as
-- `create_case_study` does) and a new code; its old number is never reused. Pages
-- address a case by its uuid, never by its code, so no link changes. An unknown or
-- deleted client raises P0001 `CLIENT_NOT_FOUND`; nothing is written then. The
-- `case_details_updated` event adds `clientId`, and `previousClientId` when it changed;
-- `previousYear`, `previousCode` and `code` now come with any renumber. Service role only.
drop function public.update_case_study_details(uuid, text, integer, text, text, uuid);

create function public.update_case_study_details(
  p_case_id uuid,
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
     and existing.client_id = p_client_id
     and existing.year = p_year
     and existing.locale = p_locale
     and existing.business_line is not distinct from p_business_line then
    return existing;
  end if;

  next_number := existing.number;
  next_code := existing.code;
  if existing.client_id <> p_client_id or existing.year <> p_year then
    select * into owner from public.client where id = p_client_id and deleted_at is null for share;
    if not found then
      raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
    end if;

    insert into public.case_number_counter as counter (client_id, year, last_number)
    values (p_client_id, p_year, 1)
    on conflict (client_id, year) do update set last_number = counter.last_number + 1
    returning counter.last_number into next_number;

    next_code := public.case_study_code(owner.code, p_year, next_number);
  end if;

  perform pg_catalog.set_config('mac_recap.case_renumber', 'on', true);
  update public.case_study set
    name = p_name,
    client_id = p_client_id,
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
    'clientId', updated.client_id,
    'year', updated.year,
    'locale', updated.locale,
    'businessLine', updated.business_line
  );
  if existing.client_id <> updated.client_id then
    event_data := event_data || jsonb_build_object('previousClientId', existing.client_id);
  end if;
  if existing.code <> updated.code then
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

revoke all on function public.update_case_study_details(uuid, text, uuid, integer, text, text, uuid) from public, anon, authenticated;
grant execute on function public.update_case_study_details(uuid, text, uuid, integer, text, text, uuid) to service_role;
