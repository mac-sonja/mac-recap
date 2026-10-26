-- Story 2.21: Risultati and Testimonial in the case Details step (SCP 2026-10-26, C24).
--
-- A case's Risultati was one free text (`context_form.results`, hidden since #63); it
-- becomes up to 3 `{label, value}` pairs (jsonb), and the form gets a testimonial: a
-- quote and its author. Same shape and limits as the client's (#88,
-- `20261022120000_case_study_client_results_testimonial.sql`): the results reuse
-- `client_brief_results_valid`. Both are optional and never material. The old results
-- text and its data are dropped (owner decision: nothing is carried over).
--
-- Each new field saves through a service-role-only function with the same advisory
-- lock and live-case check as `save_context_field`, and returns the previous value so
-- the material module can put it back when its `details_saved` event fails.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Must list exactly the form in material/domain/details-form.ts (`detailsFormSchema`).
-- `context_form_results_check` reuses the client's `client_brief_results_valid`
-- (20261022120000): a change to the client's results limits there changes a case's
-- limits too (as `CLIENT_RESULT*` in case-study does on the TypeScript side).
alter table public.context_form drop constraint context_form_results_check;
alter table public.context_form drop column results;

alter table public.context_form
  add column results jsonb not null default '[]'::jsonb
    constraint context_form_results_check check (public.client_brief_results_valid(results)),
  add column testimonial_quote text not null default ''
    constraint context_form_testimonial_quote_check
      check (char_length(btrim(testimonial_quote, E' \t\n\r\f\v')) <= 600),
  add column testimonial_author text not null default ''
    constraint context_form_testimonial_author_check
      check (char_length(btrim(testimonial_author, E' \t\n\r\f\v')) <= 120),
  -- An author without a quote is not a testimonial.
  add constraint context_form_testimonial_check
    check (btrim(testimonial_quote, E' \t\n\r\f\v') <> '' or btrim(testimonial_author, E' \t\n\r\f\v') = '');

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- As `20261013180000_material_context_form.sql`, for the two texts left (`context`,
-- `solution`); `results` is now `UNKNOWN_FIELD` (saved by `save_case_results`).
-- Service role only (the grants are kept).
create or replace function public.save_context_field(
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

  if p_field is null or p_field not in ('context', 'solution') then
    raise exception 'UNKNOWN_FIELD' using errcode = 'P0001';
  end if;

  select
    case p_field when 'context' then f.context else f.solution end
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
      updated_by = p_actor_id
    where case_id = p_case_id;
  else
    insert into public.context_form (case_id, context, solution, updated_by)
    values (
      p_case_id,
      case when p_field = 'context' then p_text else '' end,
      case when p_field = 'solution' then p_text else '' end,
      p_actor_id
    );
  end if;

  return previous;
end;
$$;

-- Replaces a live case's results with `p_results` (the filled rows, top to bottom;
-- `[]` clears them) and returns the previous list (`[]` when the case has no row).
-- Saving the stored list again, or `[]` for a case with no row, writes nothing. The
-- row is created on the first change. Serialized per case with `save_context_field`.
-- Raises P0001 `NOT_FOUND` (unknown or soft-deleted case); a list outside the shape
-- fails `context_form_results_check`. Nothing is written then. Service role only.
create function public.save_case_results(p_case_id uuid, p_results jsonb, p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_row boolean;
  previous jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('context_form:' || coalesce(p_case_id::text, ''), 0)
  );

  perform 1 from public.case_study where id = p_case_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select f.results into previous from public.context_form f where f.case_id = p_case_id for update;
  has_row := found;
  previous := coalesce(previous, '[]'::jsonb);

  if previous = p_results then
    return previous;
  end if;

  if has_row then
    update public.context_form set results = p_results, updated_by = p_actor_id where case_id = p_case_id;
  else
    insert into public.context_form (case_id, results, updated_by) values (p_case_id, p_results, p_actor_id);
  end if;

  return previous;
end;
$$;

-- Replaces a live case's testimonial with `p_quote` and `p_author` (`''` and `''`
-- clear it) and returns the previous pair as `{"quote": …, "author": …}` (both `''`
-- when the case has no row). Saving the stored pair again writes nothing, like
-- `save_case_results`. Raises P0001 `NOT_FOUND`; a text over its limit, or an author
-- without a quote, fails its `context_form_testimonial*_check`. Service role only.
create function public.save_case_testimonial(p_case_id uuid, p_quote text, p_author text, p_actor_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_row boolean;
  previous_quote text;
  previous_author text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('context_form:' || coalesce(p_case_id::text, ''), 0)
  );

  perform 1 from public.case_study where id = p_case_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select f.testimonial_quote, f.testimonial_author
  into previous_quote, previous_author
  from public.context_form f
  where f.case_id = p_case_id
  for update;
  has_row := found;
  previous_quote := coalesce(previous_quote, '');
  previous_author := coalesce(previous_author, '');

  if previous_quote = p_quote and previous_author = p_author then
    return pg_catalog.jsonb_build_object('quote', previous_quote, 'author', previous_author);
  end if;

  if has_row then
    update public.context_form set
      testimonial_quote = p_quote,
      testimonial_author = p_author,
      updated_by = p_actor_id
    where case_id = p_case_id;
  else
    insert into public.context_form (case_id, testimonial_quote, testimonial_author, updated_by)
    values (p_case_id, p_quote, p_author, p_actor_id);
  end if;

  return pg_catalog.jsonb_build_object('quote', previous_quote, 'author', previous_author);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.save_case_results(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_case_testimonial(uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.save_case_results(uuid, jsonb, uuid) to service_role;
grant execute on function public.save_case_testimonial(uuid, text, text, uuid) to service_role;
