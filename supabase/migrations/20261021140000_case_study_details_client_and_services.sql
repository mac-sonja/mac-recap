-- Dettagli, 2026-10-21 (owner): the client of a draft can change, and Servizi (the
-- business lines) are a multi-select. Owned by the `case-study` module (AD-11).
--
-- 1. `case_study.business_lines text[]` replaces `business_line`: every value is one
--    of BUSINESS_LINES in case-study/domain/case-study.ts (the check keeps the list),
--    in that order, without repeats (the domain sorts and dedupes); `{}` means none yet.
--    Existing cases keep their one business line as a one-item list. The backfill
--    leaves `updated_at` as it was.
-- 2. `create_case_study` takes `p_business_lines` (`{}` or null for none: a case starts
--    from the client-only dialog). Its event records `businessLines`.
-- 3. `update_case_study_details` takes `p_client_id` and `p_business_lines` (at least one,
--    else P0001 `INVALID_INPUT`). A draft whose client or year changes takes the next
--    number for that client in that year from `case_number_counter` (exactly as
--    `create_case_study` does) and a new code; its old number is never reused. Pages
--    address a case by its uuid, never by its code, so no link changes. An unknown or
--    deleted client raises P0001 `CLIENT_NOT_FOUND`; nothing is written then. The
--    `case_details_updated` event records `clientId` and `businessLines`, plus
--    `previousClientId` when the client changed and `previousYear`, `previousCode` and
--    `code` with any renumber. Both functions: service role only.

alter table public.case_study add column business_lines text[] not null default '{}';

alter table public.case_study disable trigger case_study_touch_updated_at;
update public.case_study set business_lines = array[business_line] where business_line is not null;
alter table public.case_study enable trigger case_study_touch_updated_at;

alter table public.case_study
  add constraint case_study_business_lines_check
  check (business_lines <@ array['branding', 'social_media', 'video', 'web_design', 'advertising', 'eventi', 'sviluppo']::text[]);

drop function public.create_case_study(text, uuid, integer, text, text, uuid);
drop function public.update_case_study_details(uuid, text, integer, text, text, uuid);

alter table public.case_study drop constraint case_study_business_line_check;
alter table public.case_study drop column business_line;

create function public.create_case_study(
  p_name text,
  p_client_id uuid,
  p_year integer,
  p_locale text,
  p_business_lines text[],
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
  select * into owner from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.case_number_counter as counter (client_id, year, last_number)
  values (p_client_id, p_year, 1)
  on conflict (client_id, year) do update set last_number = counter.last_number + 1
  returning counter.last_number into next_number;

  insert into public.case_study (name, client_id, year, locale, business_lines, created_by, number, code)
  values (
    p_name,
    p_client_id,
    p_year,
    coalesce(p_locale, 'it'),
    coalesce(p_business_lines, '{}'),
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
      'businessLines', created.business_lines
    )
  );

  return created;
end;
$$;

create function public.update_case_study_details(
  p_case_id uuid,
  p_name text,
  p_client_id uuid,
  p_year integer,
  p_locale text,
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
  if coalesce(cardinality(p_business_lines), 0) = 0 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if existing.name = p_name
     and existing.client_id = p_client_id
     and existing.year = p_year
     and existing.locale = p_locale
     and existing.business_lines = p_business_lines then
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
    business_lines = p_business_lines,
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
    'businessLines', updated.business_lines
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

revoke all on function public.create_case_study(text, uuid, integer, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.update_case_study_details(uuid, text, uuid, integer, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.create_case_study(text, uuid, integer, text, text[], uuid) to service_role;
grant execute on function public.update_case_study_details(uuid, text, uuid, integer, text, text[], uuid) to service_role;
