-- Story 2.11: lower the `material` bucket's per-object limit to 50 MB (owner
-- decision 2026-10-14), owned by the `material` module (AD-11). Forward-only (AD-12).
--
-- The hosted Supabase plan caps uploads at 50 MB (a 60 MB PUT got 413 on
-- mac-recap-dev), so the bucket matches that cap and MAX_FILE_BYTES in
-- `material/domain/files.ts`. When the plan allows (Pro), a later migration sets
-- it back to 104857600 together with MAX_FILE_BYTES. The `asset.size_bytes`
-- check still allows up to 100 MB; the 50 MB limit is enforced at presign, by
-- the bucket and at confirm.

update storage.buckets
set file_size_limit = 52428800
where id = 'material';
