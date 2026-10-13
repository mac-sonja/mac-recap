-- Story 2.10 (backend): `context_form`, the details form (context, solution,
-- results), owned by the `material` module (AD-11). Forward-only (AD-12).
--
-- One row per case, created by the first save that changes something. Every
-- field is optional plain text stored as given ('' means empty), at most 5,000
-- characters. The form is never material: `has_material` does not read it.
-- Rows are never deleted.

create table public.context_form (
  case_id uuid primary key constraint context_form_case_id_fkey references public.case_study (id),
  -- Must list exactly FORM_FIELDS in material/domain/details-form.ts (MAX_FORM_FIELD_CHARS).
  context text not null default '' constraint context_form_context_check check (char_length(context) <= 5000),
  solution text not null default '' constraint context_form_solution_check check (char_length(solution) <= 5000),
  results text not null default '' constraint context_form_results_check check (char_length(results) <= 5000),
  updated_by uuid not null constraint context_form_updated_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches it.
alter table public.context_form enable row level security;
revoke all on table public.context_form from anon, authenticated;

-- updated_at follows every update.
create function public.context_form_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger context_form_touch_updated_at
  before update on public.context_form
  for each row execute function public.context_form_touch_updated_at();

-- The form is cleared field by field (''), never deleted.
create function public.context_form_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'context_form rows are never deleted; save empty fields instead (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger context_form_reject_delete
  before delete on public.context_form
  for each row execute function public.context_form_reject_delete();

create trigger context_form_reject_truncate
  before truncate on public.context_form
  for each statement execute function public.context_form_reject_delete();

revoke all on function public.context_form_touch_updated_at() from public, anon, authenticated;
revoke all on function public.context_form_reject_delete() from public, anon, authenticated;

-- Saves one field of a live case's form and returns the field's previous text
-- ('' when the case has no row yet). The other fields are untouched; the row is
-- created on the first save. Saving the stored text again writes nothing (and a
-- first save of '' creates no row). Serialized per case. Raises P0001
-- `NOT_FOUND` (unknown or soft-deleted case) or `UNKNOWN_FIELD` (a field other
-- than context, solution, results); nothing is written then. Service role only.
create function public.save_context_field(
  p_case_id uuid,
  p_field text,
  p_text text,
  p_actor_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_row boolean;
  previous text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('context_form:' || coalesce(p_case_id::text, ''), 0)
  );

  perform 1 from public.case_study where id = p_case_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_field is null or p_field not in ('context', 'solution', 'results') then
    raise exception 'UNKNOWN_FIELD' using errcode = 'P0001';
  end if;

  select
    case p_field when 'context' then f.context when 'solution' then f.solution else f.results end
  into previous
  from public.context_form f
  where f.case_id = p_case_id
  for update;
  has_row := found;
  previous := coalesce(previous, '');

  if previous = p_text then
    return previous;
  end if;

  if has_row then
    update public.context_form set
      context = case when p_field = 'context' then p_text else context end,
      solution = case when p_field = 'solution' then p_text else solution end,
      results = case when p_field = 'results' then p_text else results end,
      updated_by = p_actor_id
    where case_id = p_case_id;
  else
    insert into public.context_form (case_id, context, solution, results, updated_by)
    values (
      p_case_id,
      case when p_field = 'context' then p_text else '' end,
      case when p_field = 'solution' then p_text else '' end,
      case when p_field = 'results' then p_text else '' end,
      p_actor_id
    );
  end if;

  return previous;
end;
$$;

revoke all on function public.save_context_field(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.save_context_field(uuid, text, text, uuid) to service_role;
