-- Story 2.11: store project files in Supabase Storage (Sprint Change Proposal
-- 2026-10-14, storage; AD-8), owned by the `material` module (AD-11). Forward-only (AD-12).
--
-- The private bucket `material` holds every uploaded original under
-- `cases/{caseId}/assets/{assetId}/original.{ext}` (`adapters/asset-key.ts`).
-- Supabase enforces its limits on every upload: at most 100 MB per object and
-- only the content types of the `material/domain/files.ts` allowlist (the same
-- list as the `asset.content_type` check).
--
-- The bucket is not public and gets no storage policies: anon and authenticated
-- (the browser keys) can neither read nor write it. Only the service role signs
-- uploads and reads, from the server. There is no versioning, so the app never
-- deletes objects; removing a file is a soft delete of its `asset` row (AR18).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material',
  'material',
  false,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
