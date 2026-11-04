-- Story 5.4: several formats as one ZIP. Forward-only (AD-12).
--
-- A bundle is one more `export` row: format `bundle`, a ZIP of the ticked formats' own
-- stored exports (the Presentazione PDF at the root, the Carosello's PNGs in
-- `Carosello/`), at `exports/{content_hash}/bundle.zip`. Its `content_hash` covers the
-- ticked formats (sorted), each one's own content hash, EXPORT_RENDER_VERSION and the
-- names of the files inside, which carry the case's code and name
-- (`rendering/domain/export.ts`, `bundleHashInput`). Immutable like every export row: the trigger and grants of
-- 20261105140000_rendering_export.sql are unchanged.

alter table public.export drop constraint export_format_check;
alter table public.export drop constraint export_format_content_type_check;
alter table public.export drop constraint export_path_check;

-- Must list exactly EXPORT_RECORD_FORMATS in rendering/domain/export.ts (Video does not export yet).
alter table public.export add constraint export_format_check
  check (format in ('presentazione_16_9', 'carosello_1_1', 'bundle'));

-- A Presentazione is a PDF, a Carosello a ZIP of PNGs, a bundle a ZIP of those files.
alter table public.export add constraint export_format_content_type_check check (
  (format = 'presentazione_16_9' and content_type = 'application/pdf')
  or (format = 'carosello_1_1' and content_type = 'application/zip')
  or (format = 'bundle' and content_type = 'application/zip')
);

-- The path is exactly the export's key: `exports/{hash}/{format}.{pdf|zip}`, a bundle's `bundle.zip`.
alter table public.export add constraint export_path_check check (
  path = 'exports/' || content_hash || '/' || format || case content_type when 'application/pdf' then '.pdf' else '.zip' end
);
