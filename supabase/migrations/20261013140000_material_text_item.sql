-- Story 2.8 (backend): `text_item`, pasted text stored as material, owned by the
-- `material` module (AD-11). Forward-only (AD-12). Text items never count toward
-- the 20-file asset cap. Removal is soft (`deleted_at`); rows are never deleted.
-- Also `has_material`, the single "does this case have material?" check.

create table public.text_item (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null constraint text_item_case_id_fkey references public.case_study (id),
  -- Trimmed by the app; 1..200 characters (text-item.ts).
  title text not null constraint text_item_title_check check (btrim(title) <> '' and char_length(title) <= 200),
  -- Stored as given; must contain non-whitespace, at most 200,000 characters.
  body text not null
    constraint text_item_body_check check (body ~ '\S')
    constraint text_item_body_length_check check (char_length(body) <= 200000),
  created_by uuid not null constraint text_item_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index text_item_live_case_id_idx on public.text_item (case_id) where deleted_at is null;

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches it.
alter table public.text_item enable row level security;
revoke all on table public.text_item from anon, authenticated;

-- updated_at follows every update.
create function public.text_item_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger text_item_touch_updated_at
  before update on public.text_item
  for each row execute function public.text_item_touch_updated_at();

-- Material is never hard-deleted: set deleted_at instead.
create function public.text_item_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'text_item rows are never deleted; set deleted_at instead (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger text_item_reject_delete
  before delete on public.text_item
  for each row execute function public.text_item_reject_delete();

create trigger text_item_reject_truncate
  before truncate on public.text_item
  for each statement execute function public.text_item_reject_delete();

revoke all on function public.text_item_touch_updated_at() from public, anon, authenticated;
revoke all on function public.text_item_reject_delete() from public, anon, authenticated;

-- True when the case has at least one non-deleted asset or one non-deleted text
-- item with non-whitespace body. The details form never counts. An unknown or
-- soft-deleted case has no material. Service role only.
create function public.has_material(p_case_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.case_study where id = p_case_id and deleted_at is null
  ) and (
    exists (
      select 1 from public.asset where case_id = p_case_id and deleted_at is null
    ) or exists (
      select 1 from public.text_item where case_id = p_case_id and deleted_at is null and body ~ '\S'
    )
  );
$$;

revoke all on function public.has_material(uuid) from public, anon, authenticated;
grant execute on function public.has_material(uuid) to service_role;
