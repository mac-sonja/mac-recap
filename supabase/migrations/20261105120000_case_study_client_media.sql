-- Story 4.5c-2: client media in the case configurator. Forward-only (AD-12); runs as
-- one transaction. No applied migration is edited: the two client file functions are
-- dropped and recreated.
--
-- 1. Removing a client file becomes a soft delete: the row gets `deleted_at` and its
--    object stays (as a soft-deleted case file's), so a revision that still references
--    it reports `MATERIAL_MISSING` at approval. A removed file frees its 1–3 slot: the
--    position key holds among non-deleted rows only.
-- 2. Client images and videos get display renditions, made by the same worker and specs
--    as case files (`material` module, AD-11). `client_rendition` mirrors `rendition`
--    (whose FK points at `asset`, so it is not loosened); its copies live next to the
--    original, at `clients/{clientId}/material/{assetId}/renditions/{specHash}.{ext}`
--    (built only by `material/adapters/asset-key.ts`). The worker writes rows only
--    through `upsert_client_rendition`.
--
-- Everything here is service role only.

-- ---------------------------------------------------------------------------
-- client_asset.deleted_at and the position key
-- ---------------------------------------------------------------------------

alter table public.client_asset add column deleted_at timestamptz null;

alter table public.client_asset drop constraint client_asset_client_position_key;
create unique index client_asset_client_position_key on public.client_asset (client_id, position) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Client file functions, recreated
-- ---------------------------------------------------------------------------

-- As `20261019180000_case_study_client_delete.sql`, except that a removed (soft-deleted)
-- file holds no position: the lowest position free among non-deleted rows is taken.
-- An id is still confirmed once only, removed or not. Service role only.
drop function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid);

create function public.insert_client_asset(
  p_id uuid,
  p_client_id uuid,
  p_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_actor_id uuid
)
returns public.client_asset
language plpgsql
security invoker
set search_path = ''
as $$
declare
  free_position smallint;
  created public.client_asset;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_asset:' || p_client_id::text, 0));

  perform 1 from public.client_asset where id = p_id;
  if found then
    raise exception 'ASSET_ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;

  perform 1 from public.client where id = p_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select min(candidate)::smallint into free_position
    from generate_series(1, 3) as candidate
   where not exists (
     select 1 from public.client_asset
      where client_id = p_client_id and position = candidate and deleted_at is null
   );
  if free_position is null then
    raise exception 'CLIENT_MATERIAL_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.client_asset (id, client_id, position, path, file_name, mime_type, size_bytes, width, height, created_by)
  values (p_id, p_client_id, free_position, p_path, btrim(p_file_name), p_mime_type, p_size_bytes, p_width, p_height, p_actor_id)
  returning * into created;
  return created;
end;
$$;

-- As `20261019180000_case_study_client_delete.sql`, except that the row is soft-deleted
-- (`deleted_at = now()`) instead of deleted, and nothing else is touched: its object
-- and its renditions stay. Returns false when no non-deleted row has this id (an
-- unknown or already removed file). A file of a deleted client raises P0001
-- `CLIENT_NOT_FOUND` and nothing changes. Service role only.
drop function public.delete_client_asset(uuid);

create function public.delete_client_asset(p_asset_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.client_asset where id = p_asset_id and deleted_at is null;
  if not found then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_asset:' || v_client_id::text, 0));

  perform 1 from public.client where id = v_client_id and deleted_at is null for share;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.client_asset set deleted_at = now() where id = p_asset_id and deleted_at is null;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- client_rendition
-- ---------------------------------------------------------------------------

create table public.client_rendition (
  asset_id uuid not null constraint client_rendition_asset_id_fkey references public.client_asset (id),
  -- As `rendition.spec_hash` (`material/application/spec-hash.ts`).
  spec_hash text not null check (spec_hash ~ '^[0-9a-f]{16}$'),
  path text not null check (char_length(path) between 1 and 1024),
  -- Must list exactly RENDITION_CONTENT_TYPES in material/domain/rendition.ts.
  content_type text not null check (content_type in ('image/webp', 'video/mp4')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  constraint client_rendition_pkey primary key (asset_id, spec_hash)
);

-- Backstop: the browser never queries tables (AD-11). RLS on with no policies denies
-- anon and authenticated. The service role may only read; writes go through
-- upsert_client_rendition.
alter table public.client_rendition enable row level security;
revoke all on table public.client_rendition from public, anon, authenticated, service_role;
grant select on table public.client_rendition to service_role;

-- Records one rendition of a client file, or replaces the row of the same (file, spec)
-- when the worker made it again (a retry). The path must be exactly the file's
-- rendition key for this spec hash and content type. Raises P0001 with the message
-- `NOT_FOUND` (no such file, it was removed, e.g. during the transcode, or its client
-- was deleted) or `RENDITION_PATH_INVALID`; nothing is written then. Service role only.
create function public.upsert_client_rendition(
  p_asset_id uuid,
  p_spec_hash text,
  p_path text,
  p_content_type text,
  p_width integer,
  p_height integer,
  p_size_bytes bigint
)
returns public.client_rendition
language plpgsql
security definer
set search_path = ''
as $$
declare
  a_client_id uuid;
  saved public.client_rendition;
begin
  select a.client_id into a_client_id
    from public.client_asset a
    join public.client c on c.id = a.client_id
   where a.id = p_asset_id and a.deleted_at is null and c.deleted_at is null;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_path is distinct from (
    'clients/' || a_client_id::text || '/material/' || p_asset_id::text || '/renditions/' || p_spec_hash || '.'
    || case p_content_type when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' else '' end
  ) then
    raise exception 'RENDITION_PATH_INVALID' using errcode = 'P0001';
  end if;

  insert into public.client_rendition (asset_id, spec_hash, path, content_type, width, height, size_bytes)
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

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.delete_client_asset(uuid) from public, anon, authenticated;
revoke all on function public.upsert_client_rendition(uuid, text, text, text, integer, integer, bigint) from public, anon, authenticated;

grant execute on function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid) to service_role;
grant execute on function public.delete_client_asset(uuid) to service_role;
grant execute on function public.upsert_client_rendition(uuid, text, text, text, integer, integer, bigint) to service_role;
