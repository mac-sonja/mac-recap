-- Accept SVG client logos (spec "Accept SVG client logos", owner 2026-10-19), owned
-- by the `case-study` module (AD-1, AD-22). Forward-only (AD-12): the applied
-- 2.14 migration `20261016140000_case_study_client_info.sql` is unchanged.
--
-- An SVG logo is stored as is (never rewritten) under
-- `clients/{clientId}/logos/{logoId}.svg`, only after the app's SVG safety scan
-- passed in the browser and again at confirm, and is always shown through <img>.
-- The ≥400 px and ≤8000 px rules stay for PNG, JPEG and WebP; the 1 B–5 MB size
-- check is unchanged. Client material does not accept SVG: its own check
-- (`client_asset_mime_type_check`) and the app's allowlists are untouched.

alter table public.client_logo drop constraint client_logo_mime_type_check;
alter table public.client_logo
  add constraint client_logo_mime_type_check check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'));

-- The shared private bucket must let the signed logo PUT through. The bucket only
-- checks the declared type; which types each flow accepts stays the app's job, so
-- project files and client material still refuse SVG at presign.
update storage.buckets
set allowed_mime_types = allowed_mime_types || array['image/svg+xml']
where id = 'material' and not ('image/svg+xml' = any (allowed_mime_types));
