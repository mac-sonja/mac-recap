-- Client Racconto: structured Risultati and a Testimonial (owner, 2026-10-21/22).
--
-- `client_brief.results` was one free text; it becomes up to 3 `{label, value}` pairs
-- (jsonb), and the brief gets a testimonial: a quote and its author. Both are optional,
-- so a client's completeness needs only `context` and `solution`. The old results text
-- and its data are dropped (owner decision: nothing is carried over).
--
-- Each new field saves through a service-role-only function with the same advisory
-- lock, `for share` read of the client and `updated_by` as `save_client_brief_field`.

-- ---------------------------------------------------------------------------
-- Results shape
-- ---------------------------------------------------------------------------

-- Whether `p_results` is a valid results list: an array of at most 3 objects, each
-- with exactly a `label` and a `value` string, both stored trimmed and non-blank,
-- label at most 80 characters (code points), value at most 20. Must match
-- `CLIENT_RESULTS_MAX`, `CLIENT_RESULT_LABEL_MAX` and `CLIENT_RESULT_VALUE_MAX` in
-- case-study/domain/case-study.ts.
create function public.client_brief_results_valid(p_results jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  v_label text;
  v_value text;
begin
  if p_results is null or pg_catalog.jsonb_typeof(p_results) <> 'array' or pg_catalog.jsonb_array_length(p_results) > 3 then
    return false;
  end if;
  for item in select e.value from pg_catalog.jsonb_array_elements(p_results) as e(value) loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 2
      or pg_catalog.jsonb_typeof(item -> 'label') is distinct from 'string'
      or pg_catalog.jsonb_typeof(item -> 'value') is distinct from 'string' then
      return false;
    end if;
    v_label := item ->> 'label';
    v_value := item ->> 'value';
    if v_label <> pg_catalog.btrim(v_label, E' \t\n\r\f\v') or v_value <> pg_catalog.btrim(v_value, E' \t\n\r\f\v')
      or pg_catalog.char_length(v_label) not between 1 and 80
      or pg_catalog.char_length(v_value) not between 1 and 20 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

-- Must list exactly the brief in case-study/domain/case-study.ts (`clientBriefSchema`).
alter table public.client_brief drop constraint client_brief_results_check;
alter table public.client_brief drop column results;

alter table public.client_brief
  add column results jsonb not null default '[]'::jsonb
    constraint client_brief_results_check check (public.client_brief_results_valid(results)),
  add column testimonial_quote text not null default ''
    constraint client_brief_testimonial_quote_check
      check (char_length(btrim(testimonial_quote, E' \t\n\r\f\v')) <= 600),
  add column testimonial_author text not null default ''
    constraint client_brief_testimonial_author_check
      check (char_length(btrim(testimonial_author, E' \t\n\r\f\v')) <= 120),
  -- An author without a quote is not a testimonial.
  add constraint client_brief_testimonial_check
    check (btrim(testimonial_quote, E' \t\n\r\f\v') <> '' or btrim(testimonial_author, E' \t\n\r\f\v') = '');

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- As `20261019180000_case_study_client_delete.sql`, for the two texts left
-- (`context`, `solution`); `results` is now `UNKNOWN_FIELD` (saved by
-- `save_client_results`). Service role only (the grants are kept).
create or replace function public.save_client_brief_field(
  p_client_id uuid,
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
    pg_catalog.hashtextextended('client_brief:' || coalesce(p_client_id::text, ''), 0)
  );

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_field is null or p_field not in ('context', 'solution') then
    raise exception 'UNKNOWN_FIELD' using errcode = 'P0001';
  end if;

  select
    case p_field when 'context' then b.context else b.solution end
  into previous
  from public.client_brief b
  where b.client_id = p_client_id
  for update;
  has_row := found;
  previous := coalesce(previous, '');

  if previous = p_text then
    return previous;
  end if;

  if has_row then
    update public.client_brief set
      context = case when p_field = 'context' then p_text else context end,
      solution = case when p_field = 'solution' then p_text else solution end,
      updated_by = p_actor_id
    where client_id = p_client_id;
  else
    insert into public.client_brief (client_id, context, solution, updated_by)
    values (
      p_client_id,
      case when p_field = 'context' then p_text else '' end,
      case when p_field = 'solution' then p_text else '' end,
      p_actor_id
    );
  end if;

  return previous;
end;
$$;

-- Replaces the client's results with `p_results` (the filled rows, top to bottom;
-- `[]` clears them) and returns whether anything changed: saving the stored list
-- again, or `[]` for a client with no brief row, writes nothing. The row is created
-- on the first change. Raises P0001 `CLIENT_NOT_FOUND` (unknown or deleted client);
-- a list outside the shape fails `client_brief_results_check`. Service role only.
create function public.save_client_results(p_client_id uuid, p_results jsonb, p_actor_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  has_row boolean;
  previous jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('client_brief:' || coalesce(p_client_id::text, ''), 0)
  );

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select b.results into previous from public.client_brief b where b.client_id = p_client_id for update;
  has_row := found;
  previous := coalesce(previous, '[]'::jsonb);

  if previous = p_results then
    return false;
  end if;

  if has_row then
    update public.client_brief set results = p_results, updated_by = p_actor_id where client_id = p_client_id;
  else
    insert into public.client_brief (client_id, results, updated_by) values (p_client_id, p_results, p_actor_id);
  end if;

  return true;
end;
$$;

-- Replaces the client's testimonial with `p_quote` and `p_author` (`''` and `''`
-- clear it) and returns whether anything changed, like `save_client_results`.
-- Raises P0001 `CLIENT_NOT_FOUND`; a text over its limit, or an author without a
-- quote, fails its `client_brief_testimonial*_check`. Service role only.
create function public.save_client_testimonial(p_client_id uuid, p_quote text, p_author text, p_actor_id uuid)
returns boolean
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
    pg_catalog.hashtextextended('client_brief:' || coalesce(p_client_id::text, ''), 0)
  );

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select b.testimonial_quote, b.testimonial_author
  into previous_quote, previous_author
  from public.client_brief b
  where b.client_id = p_client_id
  for update;
  has_row := found;

  if coalesce(previous_quote, '') = p_quote and coalesce(previous_author, '') = p_author then
    return false;
  end if;

  if has_row then
    update public.client_brief set
      testimonial_quote = p_quote,
      testimonial_author = p_author,
      updated_by = p_actor_id
    where client_id = p_client_id;
  else
    insert into public.client_brief (client_id, testimonial_quote, testimonial_author, updated_by)
    values (p_client_id, p_quote, p_author, p_actor_id);
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.client_brief_results_valid(jsonb) from public, anon, authenticated;
revoke all on function public.save_client_results(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.save_client_testimonial(uuid, text, text, uuid) from public, anon, authenticated;

grant execute on function public.client_brief_results_valid(jsonb) to service_role;
grant execute on function public.save_client_results(uuid, jsonb, uuid) to service_role;
grant execute on function public.save_client_testimonial(uuid, text, text, uuid) to service_role;
