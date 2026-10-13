-- Story 2.7 (backend): `asset`, one row per confirmed project file, owned by the
-- `material` module (AD-11). Forward-only (AD-12). A row exists only after the
-- server HEAD-checked the uploaded S3 object. Removal is soft (`deleted_at`);
-- rows are never deleted. Writes that touch the 20-file cap go through
-- `create_asset` / `restore_asset`, which serialize per case.

create table public.asset (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null constraint asset_case_id_fkey references public.case_study (id),
  -- Must list exactly ASSET_KINDS in material/domain/files.ts.
  kind text not null check (kind in ('image', 'video', 'document', 'text')),
  original_file_name text not null check (btrim(original_file_name) <> '' and char_length(original_file_name) <= 255),
  -- Must list exactly the allowlisted content types in material/domain/files.ts.
  content_type text not null check (content_type in (
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  -- 1 byte .. 100 MB (MAX_FILE_BYTES in material/domain/files.ts).
  size_bytes bigint not null check (size_bytes between 1 and 104857600),
  -- Built only in material/adapters: cases/{caseId}/assets/{assetId}/original.{ext}.
  s3_key text not null constraint asset_s3_key_key unique,
  created_by uuid not null constraint asset_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index asset_live_case_id_idx on public.asset (case_id) where deleted_at is null;

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches it.
alter table public.asset enable row level security;
revoke all on table public.asset from anon, authenticated;

-- Material is never hard-deleted: set deleted_at instead.
create function public.asset_reject_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'asset rows are never deleted; set deleted_at instead (%)', tg_op using errcode = 'P0001';
end;
$$;

create trigger asset_reject_delete
  before delete on public.asset
  for each row execute function public.asset_reject_delete();

create trigger asset_reject_truncate
  before truncate on public.asset
  for each statement execute function public.asset_reject_delete();

revoke all on function public.asset_reject_delete() from public, anon, authenticated;

-- Inserts one confirmed asset, holding a per-case lock so concurrent confirms
-- cannot pass the cap together. Raises P0001 with the message
-- `ASSET_ALREADY_CONFIRMED` (a row with `p_id` exists, checked before the cap so a
-- repeated confirm at the cap is reported as such), `NOT_FOUND` (unknown or
-- soft-deleted case) or `FILE_LIMIT_REACHED` (20 non-deleted assets,
-- MAX_ASSETS_PER_CASE in material/domain/files.ts); nothing is written then.
-- Service role only.
create function public.create_asset(
  p_id uuid,
  p_case_id uuid,
  p_kind text,
  p_original_file_name text,
  p_content_type text,
  p_size_bytes bigint,
  p_s3_key text,
  p_actor_id uuid
)
returns public.asset
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created public.asset;
  live integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('asset:' || p_case_id::text, 0));

  perform 1 from public.asset where id = p_id;
  if found then
    raise exception 'ASSET_ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;

  perform 1 from public.case_study where id = p_case_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*) into live from public.asset where case_id = p_case_id and deleted_at is null;
  if live >= 20 then
    raise exception 'FILE_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.asset (id, case_id, kind, original_file_name, content_type, size_bytes, s3_key, created_by)
  values (p_id, p_case_id, p_kind, p_original_file_name, p_content_type, p_size_bytes, p_s3_key, p_actor_id)
  returning * into created;

  return created;
end;
$$;

revoke all on function public.create_asset(uuid, uuid, text, text, text, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.create_asset(uuid, uuid, text, text, text, bigint, text, uuid) to service_role;

-- Clears `deleted_at` on one asset of a case, under the same per-case lock as
-- `create_asset`. Returns true when it restored the asset, false when the asset
-- was already live (nothing written). Raises P0001 `NOT_FOUND` (unknown or
-- soft-deleted case, or no such asset in this case) or `FILE_LIMIT_REACHED` (the case already has 20 non-deleted assets).
-- Service role only.
create function public.restore_asset(
  p_case_id uuid,
  p_asset_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed_at timestamptz;
  live integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('asset:' || p_case_id::text, 0));

  perform 1 from public.case_study where id = p_case_id and deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select deleted_at into removed_at from public.asset where id = p_asset_id and case_id = p_case_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if removed_at is null then
    return false;
  end if;

  select count(*) into live from public.asset where case_id = p_case_id and deleted_at is null;
  if live >= 20 then
    raise exception 'FILE_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  update public.asset set deleted_at = null where id = p_asset_id and case_id = p_case_id;
  return true;
end;
$$;

revoke all on function public.restore_asset(uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_asset(uuid, uuid) to service_role;
