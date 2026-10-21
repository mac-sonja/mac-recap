-- Story 3.3: `revision`, owned by the `case-study` module (AD-11). Forward-only (AD-12).
--
-- One row per revision of a case study's document (`CaseStudyDocument`, validated
-- by zod in `generation/domain` before any write; SQL checks only the shape).
-- Exactly one subject is set: `case_id`, or `client_intro_id` (stays null, with
-- no FK, until Story 3.9 adds the `client_intro` table).
--
-- `generated_doc` is what the generator (or the test draft) produced and never
-- changes; `doc` is the editable copy (edited only in Epic 4). Neither holds a
-- client value: client info is filled at render time from the client's current
-- values, so it is never stored in a revision or its manifest.
--
-- The service role may only read; every write goes through a security-definer
-- function (`create_working_revision` here; approval and editing arrive in Epic 4).

create table public.revision (
  id uuid primary key default gen_random_uuid(),
  case_id uuid null constraint revision_case_id_fkey references public.case_study (id),
  -- FK to public.client_intro arrives with Story 3.9.
  client_intro_id uuid null,
  -- Must list exactly REVISION_STATUSES in case-study/domain/revision.ts.
  status text not null default 'working' check (status in ('working', 'approved', 'superseded')),
  -- Compare-and-set counter for edits of `doc` (`STALE_REVISION`, Epic 4).
  version integer not null default 0 check (version >= 0),
  generated_doc jsonb not null check (jsonb_typeof(generated_doc) = 'object'),
  doc jsonb not null check (jsonb_typeof(doc) = 'object'),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  model text null check (model is null or char_length(model) between 1 and 200),
  fell_back boolean not null default false,
  prompt_version text null check (prompt_version is null or char_length(prompt_version) between 1 and 200),
  -- The `schemaVersion` of `doc` as written.
  schema_version integer not null check (schema_version >= 0),
  created_by uuid not null constraint revision_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revision_subject_check check (num_nonnulls(case_id, client_intro_id) = 1),
  -- CASE, not AND: Postgres may evaluate the cast first, and a non-number must be a check violation.
  constraint revision_doc_schema_version_check check (
    case when jsonb_typeof(doc -> 'schemaVersion') = 'number' then (doc ->> 'schemaVersion')::numeric = schema_version else false end
  ),
  constraint revision_generated_doc_schema_version_check check (coalesce(jsonb_typeof(generated_doc -> 'schemaVersion'), '') = 'number')
);

create index revision_case_id_idx on public.revision (case_id) where case_id is not null;

-- At most one `working` revision per subject.
create unique index revision_one_working_per_case_idx on public.revision (case_id) where status = 'working' and case_id is not null;
create unique index revision_one_working_per_client_intro_idx on public.revision (client_intro_id)
  where status = 'working' and client_intro_id is not null;

-- Backstop: the browser never queries tables (AD-11). RLS on with no policies
-- denies anon and authenticated. The service role may only read.
alter table public.revision enable row level security;
revoke all on table public.revision from public, anon, authenticated, service_role;
grant select on table public.revision to service_role;

-- updated_at follows every update.
create function public.revision_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger revision_touch_updated_at
  before update on public.revision
  for each row execute function public.revision_touch_updated_at();

-- What was generated, whose revision it is, and who made it when never change;
-- the status only moves forward.
create function public.revision_reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.generated_doc is distinct from old.generated_doc
     or new.case_id is distinct from old.case_id
     or new.client_intro_id is distinct from old.client_intro_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'revision id, generated_doc, case_id, client_intro_id, created_by and created_at are immutable'
      using errcode = 'P0001';
  end if;
  -- Status only moves forward: working → approved | superseded, approved → superseded.
  if new.status is distinct from old.status
     and (old.status, new.status) not in (('working', 'approved'), ('working', 'superseded'), ('approved', 'superseded')) then
    raise exception 'REVISION_STATUS_INVALID' using errcode = 'P0001', detail = old.status || ' -> ' || new.status;
  end if;
  return new;
end;
$$;

create trigger revision_reject_immutable_change
  before update on public.revision
  for each row execute function public.revision_reject_immutable_change();

-- Revisions are never deleted.
create function public.revision_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'revision rows are never deleted (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger revision_reject_delete
  before delete on public.revision
  for each row execute function public.revision_reject_delete();

create trigger revision_reject_truncate
  before truncate on public.revision
  for each statement execute function public.revision_reject_delete();

revoke all on function public.revision_touch_updated_at() from public, anon, authenticated;
revoke all on function public.revision_reject_immutable_change() from public, anon, authenticated;
revoke all on function public.revision_reject_delete() from public, anon, authenticated;

-- The pointers that were plain uuids until now (Story 2.5).
alter table public.case_study
  add constraint case_study_head_revision_id_fkey foreign key (head_revision_id) references public.revision (id),
  add constraint case_study_approved_revision_id_fkey foreign key (approved_revision_id) references public.revision (id);
alter table public.case_event
  add constraint case_event_revision_id_fkey foreign key (revision_id) references public.revision (id);

create index case_study_head_revision_id_idx on public.case_study (head_revision_id) where head_revision_id is not null;
create index case_study_approved_revision_id_idx on public.case_study (approved_revision_id) where approved_revision_id is not null;
create index case_event_revision_id_idx on public.case_event (revision_id) where revision_id is not null;

-- Creates a `working` revision of a non-deleted case from `p_doc` (already
-- validated by zod; `generated_doc` and `doc` both start as it) and makes it the
-- head, by compare-and-set on `case_study.head_version`: only when it still equals
-- `p_expected_head_version` are `head_revision_id` set and `head_version`
-- incremented. A previous head that was `working` becomes `superseded` first. One
-- `revision_created` case event with the revision id is written. All in one
-- transaction.
--
-- `p_meta` is `{ model?, fellBack?, promptVersion? }`. Raises P0001 with the
-- message `NOT_FOUND` (unknown or soft-deleted case), `STALE_HEAD` (the head moved
-- since it was read) or `INVALID_INPUT` (a shape check failed); nothing is
-- written then. Service role only.
create function public.create_working_revision(
  p_case_id uuid,
  p_doc jsonb,
  p_manifest jsonb,
  p_meta jsonb,
  p_expected_head_version integer,
  p_actor_id uuid
)
returns public.revision
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_head_revision_id uuid;
  c_head_version integer;
  created public.revision;
  superseded_id uuid;
begin
  -- Shape checks only (zod validated the document); every operand is non-null, so
  -- the OR chain is never null.
  if p_case_id is null or p_expected_head_version is null or p_actor_id is null
     or coalesce(jsonb_typeof(p_doc), '') <> 'object'
     or coalesce(jsonb_typeof(p_doc -> 'schemaVersion'), '') <> 'number'
     or coalesce(p_doc ->> 'schemaVersion', '') !~ '^[0-9]{1,4}$'
     or coalesce(jsonb_typeof(p_manifest), '') <> 'object'
     or coalesce(jsonb_typeof(p_meta), '') <> 'object'
     or coalesce(jsonb_typeof(p_meta -> 'model'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_meta -> 'promptVersion'), 'null') not in ('string', 'null')
     or coalesce(jsonb_typeof(p_meta -> 'fellBack'), 'null') not in ('boolean', 'null') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select head_revision_id, head_version into c_head_revision_id, c_head_version
    from public.case_study
   where id = p_case_id and deleted_at is null
     for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if c_head_version <> p_expected_head_version then
    raise exception 'STALE_HEAD' using errcode = 'P0001';
  end if;

  -- Supersede first: at most one working revision per case (unique index).
  update public.revision
     set status = 'superseded'
   where id = c_head_revision_id and status = 'working'
  returning id into superseded_id;

  insert into public.revision (case_id, status, generated_doc, doc, manifest, model, fell_back, prompt_version, schema_version, created_by)
  values (
    p_case_id,
    'working',
    p_doc,
    p_doc,
    p_manifest,
    p_meta ->> 'model',
    coalesce((p_meta ->> 'fellBack')::boolean, false),
    p_meta ->> 'promptVersion',
    (p_doc ->> 'schemaVersion')::integer,
    p_actor_id
  )
  returning * into created;

  update public.case_study
     set head_revision_id = created.id, head_version = head_version + 1
   where id = p_case_id and head_version = p_expected_head_version;

  insert into public.case_event (case_id, revision_id, actor_id, type, data)
  values (
    p_case_id,
    created.id,
    p_actor_id,
    'revision_created',
    jsonb_build_object(
      'headVersion', p_expected_head_version + 1,
      'previousHeadRevisionId', c_head_revision_id,
      'supersededRevisionId', superseded_id
    )
  );

  return created;
end;
$$;

revoke all on function public.create_working_revision(uuid, jsonb, jsonb, jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_working_revision(uuid, jsonb, jsonb, jsonb, integer, uuid) to service_role;
