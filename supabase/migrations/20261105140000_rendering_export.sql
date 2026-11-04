-- Story 5.3: export a format as a file, owned by the `rendering` module (AD-1, AD-11).
-- Forward-only (AD-12).
--
-- One row per stored export file: one format of a case's approved revision, drawn by
-- the worker (Playwright Chromium) and stored in the private `rendering` bucket at
-- `exports/{content_hash}/{format}.{pdf|zip}` (built only by
-- `rendering/adapters/supabase/export-storage.ts`). `content_hash` (sha256 hex) covers
-- the ordered parts (subject and revision id), each part's client info, the case's
-- bound fields and the format, so the same hash reuses the stored file and any edit
-- renders again (`rendering/domain/export.ts`).
--
-- A row is immutable: no role may update or delete it (a trigger refuses it even for
-- the table owner). Only the service role (the worker) inserts; it and the web server
-- read. RLS is on with no policies, so anon and authenticated see nothing.

create table public.export (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null constraint export_content_hash_key unique check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Must list exactly EXPORT_FORMAT_IDS in rendering/domain/export.ts (Video does not export yet).
  format text not null check (format in ('presentazione_16_9', 'carosello_1_1')),
  -- `[{ subject: { kind: "case", id }, revisionId }]`, in order.
  parts jsonb not null check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) between 1 and 200),
  path text not null,
  content_type text not null check (content_type in ('application/pdf', 'application/zip')),
  size_bytes bigint not null check (size_bytes > 0),
  created_by uuid not null constraint export_created_by_fkey references public.profile (id),
  created_at timestamptz not null default now(),
  -- A Presentazione is a PDF, a Carosello a ZIP of PNGs.
  constraint export_format_content_type_check check (
    (format = 'presentazione_16_9' and content_type = 'application/pdf')
    or (format = 'carosello_1_1' and content_type = 'application/zip')
  ),
  -- The path is exactly the export's key.
  constraint export_path_check check (
    path = 'exports/' || content_hash || '/' || format || case content_type when 'application/pdf' then '.pdf' else '.zip' end
  )
);

-- Backstop: the browser never queries tables (AD-11). RLS on with no policies
-- denies anon and authenticated. The service role may read and insert, nothing else.
alter table public.export enable row level security;
revoke all on table public.export from public, anon, authenticated, service_role;
grant select, insert on table public.export to service_role;

-- Immutable: refuses every update and delete, whoever runs it.
create function public.export_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'export rows are immutable' using errcode = 'P0001';
end;
$$;

revoke all on function public.export_immutable() from public, anon, authenticated;

create trigger export_immutable
before update or delete on public.export
for each row execute function public.export_immutable();

create trigger export_no_truncate
before truncate on public.export
for each statement execute function public.export_immutable();

-- The private bucket for export files: no storage policies, so only the service role
-- signs reads and writes. 50 MB per object, as the hosted plan caps uploads (see
-- 20261014180000_material_bucket_50mb.sql); only PDF and ZIP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rendering', 'rendering', false, 52428800, array['application/pdf', 'application/zip'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
