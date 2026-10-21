-- Material first (owner, 2026-10-21): the case wizard opens on Materiale, so a new
-- case is created from a small dialog with its client only, before the details.
-- `create_case_study` now accepts a null business line (as `20261020140000_case_study_business_line.sql`
-- otherwise): the case starts without one and the Dettagli step sets it, which is what
-- makes the details complete. One outside the list still fails the check. Same
-- signature, so the grants of `20261020140000` stay as they are.

create or replace function public.create_case_study(
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
