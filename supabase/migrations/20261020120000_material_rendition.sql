-- Story 3.2: display renditions of case images and videos, owned by the
-- `material` module (AD-11). Forward-only (AD-12).
--
-- One row per (asset, spec): a light display copy the worker made from the
-- original (thumbnail, display image, video poster, display transcode). The
-- copy lives in the private `material` bucket next to the original, at
-- `cases/{caseId}/assets/{assetId}/renditions/{specHash}.{ext}` (built only by
-- `material/adapters/asset-key.ts`). Originals are never written by this.
--
-- The worker (system actor, service role) writes rows only through
-- `upsert_rendition`, which is security definer: the service role itself may
-- only read the table, so nothing else can change a row. The bucket already
-- allows image/webp and video/mp4, so its settings are unchanged.

create table public.rendition (
  asset_id uuid not null constraint rendition_asset_id_fkey references public.asset (id),
  -- The first 16 hex characters of the sha256 of the spec's canonical JSON
  -- (`material/application/spec-hash.ts`).
  spec_hash text not null check (spec_hash ~ '^[0-9a-f]{16}$'),
  path text not null check (char_length(path) between 1 and 1024),
  -- Must list exactly RENDITION_CONTENT_TYPES in material/domain/rendition.ts.
  content_type text not null check (content_type in ('image/webp', 'video/mp4')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  constraint rendition_pkey primary key (asset_id, spec_hash)
);

-- Backstop: the browser never queries tables (AD-11). RLS on with no policies
-- denies anon and authenticated. The service role may only read; writes go
-- through upsert_rendition.
alter table public.rendition enable row level security;
revoke all on table public.rendition from public, anon, authenticated, service_role;
grant select on table public.rendition to service_role;

-- Records one rendition of an asset, or replaces the row of the same (asset,
-- spec) when the worker made it again (a retry). The path must be exactly the
-- asset's rendition key for this spec hash and content type. Raises P0001 with
-- the message `NOT_FOUND` (no such asset, or it was removed, e.g. during the
-- transcode) or `RENDITION_PATH_INVALID`; nothing is written then. Service role only.
create function public.upsert_rendition(
  p_asset_id uuid,
  p_spec_hash text,
  p_path text,
  p_content_type text,
  p_width integer,
  p_height integer,
  p_size_bytes bigint
)
returns public.rendition
language plpgsql
security definer
set search_path = ''
as $$
declare
  a_case_id uuid;
  a_deleted_at timestamptz;
  saved public.rendition;
begin
  select case_id, deleted_at into a_case_id, a_deleted_at from public.asset where id = p_asset_id;
  if not found or a_deleted_at is not null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_path is distinct from (
    'cases/' || a_case_id::text || '/assets/' || p_asset_id::text || '/renditions/' || p_spec_hash || '.'
    || case p_content_type when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' else '' end
  ) then
    raise exception 'RENDITION_PATH_INVALID' using errcode = 'P0001';
  end if;

  insert into public.rendition (asset_id, spec_hash, path, content_type, width, height, size_bytes)
  values (p_asset_id, p_spec_hash, p_path, p_content_type, p_width, p_height, p_size_bytes)
  on conflict (asset_id, spec_hash) do update set
    path = excluded.path,
    content_type = excluded.content_type,
    width = excluded.width,
    height = excluded.height,
    size_bytes = excluded.size_bytes
  returning * into saved;

  return saved;
end;
$$;

revoke all on function public.upsert_rendition(uuid, text, text, text, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.upsert_rendition(uuid, text, text, text, integer, integer, bigint) to service_role;
