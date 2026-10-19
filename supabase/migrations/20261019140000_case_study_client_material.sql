-- Story 2.16: the client material step (SCP 2026-10-19). Forward-only (AD-12);
-- runs as one transaction. No applied migration is edited.
--
-- A client has up to 3 files (the intro needs at least 2 images). They are the case
-- material types, up to 50 MB each; images also carry their pixel size, checked at
-- confirm (≥1600 px on the short side, ≤8000 px on any side). Objects live in the
-- existing private `material` bucket under `clients/{clientId}/material/{assetId}.{ext}`
-- (the key is built by the case-study adapter); the bucket already allows these
-- types and sizes for every path, so it is not changed. A removed file's row and
-- object are deleted for real (client info is live; no history). The limits match
-- `CLIENT_MATERIAL_*` in case-study/domain/client-material.ts.

-- ---------------------------------------------------------------------------
-- client_asset
-- ---------------------------------------------------------------------------

create table public.client_asset (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null constraint client_asset_client_id_fkey references public.client (id),
  position smallint not null constraint client_asset_position_check check (position between 1 and 3),
  path text not null constraint client_asset_path_key unique constraint client_asset_path_check check (btrim(path) <> ''),
  -- The browser's file name, stored trimmed (shown on the row, as the case material).
  file_name text not null constraint client_asset_file_name_check check (
    file_name = btrim(file_name) and char_length(file_name) between 1 and 255
  ),
  -- Must list exactly `CLIENT_MATERIAL_FILE_TYPES` (the case material types).
  mime_type text not null constraint client_asset_mime_type_check check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  size_bytes bigint not null constraint client_asset_size_bytes_check check (size_bytes between 1 and 52428800),
  width integer null constraint client_asset_width_check check (width is null or width between 1 and 8000),
  height integer null constraint client_asset_height_check check (height is null or height between 1 and 8000),
  created_by uuid not null constraint client_asset_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  -- Images carry both sides; every other type carries neither.
  constraint client_asset_dimensions_check check (
    case
      when mime_type in ('image/jpeg', 'image/png', 'image/webp') then width is not null and height is not null
      else width is null and height is null
    end
  ),
  constraint client_asset_client_position_key unique (client_id, position)
);

create index client_asset_client_id_idx on public.client_asset (client_id);

-- Backstop: the browser never queries tables. RLS on with no policies denies
-- anon and authenticated; only the server's secret (service-role) key reaches it.
alter table public.client_asset enable row level security;
revoke all on table public.client_asset from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Records one confirmed client file at the lowest free position (1–3), under a
-- per-client advisory lock, so two confirms at the same moment never take the same
-- position and the 3-file cap holds even when the browser's count is stale. Raises
-- P0001 `ASSET_ALREADY_CONFIRMED` (this id exists), `CLIENT_NOT_FOUND` or
-- `CLIENT_MATERIAL_LIMIT` (the client already has 3 files); a value outside a
-- column check fails that check; nothing is written then. Service role only.
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

  perform 1 from public.client where id = p_client_id;
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select min(candidate)::smallint into free_position
    from generate_series(1, 3) as candidate
   where not exists (
     select 1 from public.client_asset where client_id = p_client_id and position = candidate
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

-- Deletes one client file's row, under the same per-client lock as
-- `insert_client_asset`. Returns false when no row has this id. The object is
-- deleted by the case-study adapter afterwards. Service role only.
create function public.delete_client_asset(p_asset_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.client_asset where id = p_asset_id;
  if not found then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('client_asset:' || v_client_id::text, 0));

  delete from public.client_asset where id = p_asset_id;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: service role only
-- ---------------------------------------------------------------------------

revoke all on function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid) from public, anon, authenticated;
revoke all on function public.delete_client_asset(uuid) from public, anon, authenticated;

grant execute on function public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid) to service_role;
grant execute on function public.delete_client_asset(uuid) to service_role;
