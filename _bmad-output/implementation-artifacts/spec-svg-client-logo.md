---
title: 'Accept SVG client logos'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: '4c05b53835309baeca450c5d89c75fa6ff25bdbf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-14-client-info-description-sector-logo.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Client logos accept only PNG, JPEG and WebP. Many clients supply their logo as SVG, and the owner wants it accepted (owner, 2026-10-19).

**Approach:** Add `image/svg+xml` (`.svg`, ≤5 MB) to the logo types. An SVG is accepted only if a dependency-free safety scan passes, run in the browser at pick and again at confirm. It is always shown through `<img>`. The ≥400 px and ≤8000 px rules apply to PNG, JPEG and WebP only. A forward migration allows the type on `client_logo` and on the `material` bucket.

## Boundaries & Constraints

**Always:**
- **The safety scan** reads the file as UTF-8 text. It accepts it only when all of these hold:
  - the text decodes as valid UTF-8;
  - the root element is `<svg` (an optional `<?xml …?>` declaration and comments may come first), and the text ends with `</svg>` (trailing whitespace allowed);
  - there is no `<!ENTITY` and no internal DTD subset; a standard `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.0//EN" | "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/…">` with no `[` is allowed (owner, 2026-10-19);
  - there is no `<script`, `<foreignObject`, `<iframe`, `<embed` or `<object`;
  - no attribute name starts with `on`;
  - no `javascript:` appears anywhere;
  - every `href` / `xlink:href` value starts with `#`, except an `<image>` href that is a `data:image/png`, `data:image/jpeg` or `data:image/webp` base64 URI (owner, 2026-10-19);
  - every `url(` points to `#…`;
  - there is no `@import`.

  Matching is case-insensitive and tolerates whitespace, entity-encoded characters (`&#…;`) and comments placed to dodge the scan.
- The scan is one shared pure function (domain or `shared/`, no new dependency, safe for both the browser and the server).
- A refused SVG shows "Il file SVG non è sicuro: contiene script o collegamenti esterni." in the browser. A direct confirm of one fails with `CLIENT_LOGO_INVALID`, and nothing is written.
- The logo hint and the type error mention SVG.
- `LogoTile` stays a plain `<img>`.
- Every existing rule for PNG, JPEG and WebP is unchanged.
- Planning docs:
  - Story 2.14 gets an amendment note;
  - AD-8 lists SVG;
  - Stories 3.5 and 5.3 note that renderers rasterise an SVG logo at render time;
  - EXPERIENCE.md C20 lists SVG.

**Never:**
- Editing an applied migration, or running `supabase db push`.
- Sanitising or rewriting the SVG: it is accepted as is or refused.
- `sharp` or any new package in web code.
- Accepting SVG for client material, or anything else besides the logo.
- Changing the case material flow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clean SVG | `<svg viewBox…><path d…/></svg>`, 3 KB | Preview shows; saved; client page shows it | N/A |
| Script | `<svg><script>…</script></svg>` | Refused inline | Confirm → `CLIENT_LOGO_INVALID`, no row |
| Event handler | `<svg onload="…">` or `<rect ONclick=…>` | Refused | Same |
| External ref | `<image href="https://…">`, `xlink:href="data:…"`, `fill="url(https://…)"` | Refused | Same |
| Internal ref | `<use href="#a"/>`, `fill="url(#g)"` | Accepted | N/A |
| Illustrator DOCTYPE | Standard SVG 1.1 `<!DOCTYPE svg PUBLIC …>` | Accepted | N/A |
| DOCTYPE with subset | `<!DOCTYPE svg [ <!ENTITY …> ]>` | Refused | Same |
| Embedded raster | `<image href="data:image/png;base64,…">` | Accepted | N/A |
| Embedded SVG/HTML | `<image href="data:image/svg+xml,…">`, `data:text/html…` | Refused | Same |
| Obfuscated | `<scr<!-- -->ipt>`, `&#106;avascript:` | Refused | Same |
| Not SVG | `.svg` holding HTML or a PNG | Refused | Same |
| Tiny SVG | `width="10"` | Accepted (no pixel rule) | N/A |
| Too big | 6 MB SVG | Refused | `CLIENT_LOGO_INVALID` at presign |

</frozen-after-approval>

## Spec Change Log

- **2026-10-19, owner decision (renegotiates the frozen intent).** After implementation, the owner chose to accept a standard SVG `<!DOCTYPE>` with no internal subset (common in Illustrator exports) and embedded PNG/JPEG/WebP `data:` images in `<image>` (common in Figma exports). Everything else in the scan stays. KEEP: the shared scan and its multi-pass normalisation, the strict UTF-8 decode, and the extra refusals already built.

## Code Map

- `src/modules/case-study/domain/case-study.ts` L43–81: add SVG to `LOGO_FILE_TYPES` (ext `svg`) and fix the L43 comment. The pixel helpers apply to raster types only.
- `src/modules/case-study/application/confirm-client-logo-upload.ts` L36–56:
  - for SVG, read the body (reuse the `logo-storage.ts` `dimensions` download, bounded by `LOGO_MAX_BYTES`, or add a `read()` on the port) and run the scan instead of `FORMAT_OF` and the pixel checks;
  - the stored type must equal `image/svg+xml`.
- `src/modules/case-study/ports/logo-storage.ts`, `adapters/supabase/logo-storage.ts` (~L88–102): expose the bytes, or a text read, for SVG.
- `src/app/(tool)/clients/_components/use-client-logo.ts` L39–42, L124–134: for SVG, skip `createImageBitmap` and run the scan on `file.text()`.
- `src/app/(wizard)/_lib/upload.ts` L81–93: add `svg: "image/svg+xml"`. It is filtered by `allowed`, so the material step is unaffected.
- `src/shared/i18n/it.ts` L220 `logoType`, L282 `logoHint` (mention SVG), plus a new `logoUnsafe`.
- Migration `supabase/migrations/20261019160000_case_study_client_logo_svg.sql`:
  - drop and re-add `client_logo_mime_type_check` with `image/svg+xml`;
  - `update storage.buckets set allowed_mime_types = … || 'image/svg+xml' where id = 'material'`.
- Tests to flip (they assert SVG is refused):
  - `test/db/case-study.db.test.ts` L1321, L1513–1516;
  - `use-cases.test.ts` L643, L704–706;
  - `case-study.test.ts` L312;
  - `logo-storage.test.ts` L87;
  - the type lists in `clients/new/page.test.tsx` L29 and `client-details-step.test.tsx` L37.
- Docs: `epics.md` L787 (2.14), plus notes on 3.5 (~L1103) and 5.3 (~L1830); `ARCHITECTURE-SPINE.md` L187; `EXPERIENCE.md` L516; a banner in `spec-2-14`.

## Tasks & Acceptance

**Execution:**
- [x] Domain and the shared `isSafeSvg(text)` scan, with a unit test per matrix row plus the extra cases (uppercase tags, whitespace inside tags, `xlink:href` with spaces, nested comments).
- [x] The confirm and storage changes, with use-case and adapter tests (clean SVG accepted, unsafe SVG refused, no pixel check).
- [x] The browser hook, the upload type map and the copy, with component tests (clean SVG previews and saves; unsafe SVG shows `logoUnsafe` and calls no presign).
- [x] The migration, with DB tests (`client_logo` accepts `image/svg+xml`; the bucket allows it; presign accepts SVG and refuses a 6 MB file). `db.types.ts` is unchanged unless CI says otherwise.
- [x] The doc notes listed in the Code Map.

**Acceptance Criteria:**
- Given a PNG, JPEG or WebP logo, when it is picked and saved, then every 2.14 rule (≥400 px, ≤8000 px, end-of-file checks) still applies.
- Given CI, when `check`, `db` and `image` run, then they pass.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.
- `npm run test:db` -- runs in CI only (no local Docker).

**Manual checks:**
- After the owner applies the change to dev, add an SVG logo to a client and check that it shows on the client page.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | edge-case | The XML-declaration strip also matches `<?xml-stylesheet …?>`, bypassing the processing-instruction refusal | medium | patch | The declaration regex has no boundary after `xml`. |
| 2 | edge-case | CSS `image-set('https://…')`, `cross-fade(` or `src(` with a bare string fetches externally without `url(` | medium | patch | Only `url(` and `@import` are scanned. |
| 3 | blind, edge-case, verification-gap | Every SVG refusal (not SVG, bad UTF-8, size, not uploaded, scan) shows "contiene script o collegamenti esterni" | medium | patch | `use-client-logo.ts` and `showLogoFailure` map all SVG failures to `logoUnsafe`. |
| 4 | edge-case | A trailing comment after `</svg>` gets a harmless SVG refused | low | patch | `/<\/svg\s*>\s*$/` runs before comments are stripped; direct fix. |
| 5 | verification-gap, blind | The SVG branch's stale-pick guard is untested | medium | patch | The race test only enters the raster branch. |
| 6 | blind | The epics.md 2.14 note still says DOCTYPE is refused | low | patch | Owner allowed the standard DOCTYPE and embedded rasters. |
| 7 | blind | The renderer notes (3.5, 5.3) don't require external DTD/entity loading and network to be off when rasterising | medium | patch | The standard DOCTYPE carries a w3.org system id that permissive parsers may fetch. |
| 8 | blind, verification-gap | Stacked or misplaced doc comments in `svg-safety.ts` | low | patch | Direct correction in a security-critical file. |
| 9 | blind, edge-case | `maskImageData` finds the tag by `lastIndexOf("<")`, so a `>` in an earlier attribute value refuses a valid embedded PNG | low | reject | Refuses in the safe direction; exporters don't write `>` in attribute values. |
| 10 | blind | The spec matrix and Always list don't list every extra refusal | low | reject | The fix edits this build's spec. |
| 11 | blind | An embedded low-res raster bypasses the 400 px quality rule | low | reject | Quality of a vector logo is the uploader's choice; the 400 px rule exists for raster logos. |
| 12 | blind | No well-formedness or `viewBox` check; a broken SVG hides itself in `LogoTile` | low | reject | The preview shows it in the browser before saving; adds a parser. |
| 13 | blind | The shared bucket now allows SVG bodies on case-material presigned URLs | low | reject | The confirm-time type check refuses them; only an orphan object remains (orphans already deferred). |
| 14 | blind | Nothing forces logos to render only through `<img>` | low | reject | Scripts and external refs are refused anyway, and signed URLs are on the Supabase storage origin, not the app's. |
| 15 | blind | The scan's cost on a 5 MB worst case is untested | low | reject | About 1 s measured on 5 MB, run once per confirm. |
| 16 | blind | `readBytes` returns empty bytes for an object over 5 MB, so it is logged as an empty-size refusal | low | reject | The refusal is still correct; only the log reason is imprecise. |
| 17 | blind | No test for the new `logoHint` or `accept` attribute | low | reject | Copy and attribute are static; covered by type-list tests. |
