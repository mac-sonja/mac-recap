-- Story 2.5 (backend, part 1): `case_study` and its append-only `case_event` log,
-- both owned by the `case-study` module (AD-11). Forward-only (AD-12).
-- The case id is DB-generated, immutable and never reused: rows are soft-deleted
-- only. Status changes arrive with `transition()` in part 2; nothing here writes
-- `status` except its default.

create table public.case_study (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  client text not null check (btrim(client) <> ''),
  year integer not null check (year between 1900 and 2100),
  -- Narrative locale; must list exactly LOCALES in case-study/domain/case-study.ts.
  locale text not null default 'it' check (locale in ('it', 'en')),
  -- AD-3 set; must list exactly CASE_STATUSES in src/shared/case-status.ts.
  status text not null default 'draft' check (status in ('draft', 'generating', 'in_review', 'approved')),
  -- Exists but stays null, with no UI and no writer (Epic 2 context).
  project_order_ref text null,
  -- Plain uuids until the revision table exists (Epic 3), which adds the FKs.
  head_revision_id uuid null,
  approved_revision_id uuid null,
  head_version integer not null default 0 check (head_version >= 0),
  created_by uuid not null constraint case_study_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table public.case_event (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null constraint case_event_case_id_fkey references public.case_study (id),
  -- Plain uuid until the revision table exists (Epic 3).
  revision_id uuid null,
  actor_id uuid not null constraint case_event_actor_id_fkey references public.profile (id),
  type text not null check (type ~ '^[a-z][a-z0-9_]*$'),
  at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create index case_event_case_id_at_idx on public.case_event (case_id, at);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches them.
alter table public.case_study enable row level security;
alter table public.case_event enable row level security;
revoke all on table public.case_study from anon, authenticated;
revoke all on table public.case_event from anon, authenticated;

-- updated_at follows every update.
create function public.case_study_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger case_study_touch_updated_at
  before update on public.case_study
  for each row execute function public.case_study_touch_updated_at();

-- The case id is permanent.
create function public.case_study_reject_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'case_study.id is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger case_study_reject_id_change
  before update on public.case_study
  for each row execute function public.case_study_reject_id_change();

-- Delete is soft only (set deleted_at), so an id is never freed for reuse.
create function public.case_study_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'case_study rows are never deleted; set deleted_at instead (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger case_study_reject_delete
  before delete on public.case_study
  for each row execute function public.case_study_reject_delete();

create trigger case_study_reject_truncate
  before truncate on public.case_study
  for each statement execute function public.case_study_reject_delete();

-- The event log is append-only.
create function public.case_event_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'case_event is append-only (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger case_event_reject_update_delete
  before update or delete on public.case_event
  for each row execute function public.case_event_reject_mutation();

create trigger case_event_reject_truncate
  before truncate on public.case_event
  for each statement execute function public.case_event_reject_mutation();

revoke all on function public.case_study_touch_updated_at() from public, anon, authenticated;
revoke all on function public.case_study_reject_id_change() from public, anon, authenticated;
revoke all on function public.case_study_reject_delete() from public, anon, authenticated;
revoke all on function public.case_event_reject_mutation() from public, anon, authenticated;

-- Creates a case and its `case_created` event in one transaction (the adapter's
-- only write path for new cases). Inputs are validated by the domain schema;
-- the table checks are the backstop. Service role only.
create function public.create_case_study(
  p_name text,
  p_client text,
  p_year integer,
  p_locale text,
  p_actor_id uuid
)
returns public.case_study
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.case_study;
begin
  insert into public.case_study (name, client, year, locale, created_by)
  values (p_name, p_client, p_year, coalesce(p_locale, 'it'), p_actor_id)
  returning * into created;

  insert into public.case_event (case_id, actor_id, type, data)
  values (
    created.id,
    p_actor_id,
    'case_created',
    jsonb_build_object('name', created.name, 'client', created.client, 'year', created.year, 'locale', created.locale)
  );

  return created;
end;
$$;

revoke all on function public.create_case_study(text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.create_case_study(text, text, integer, text, uuid) to service_role;
