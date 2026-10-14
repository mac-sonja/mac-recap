---
title: 'Story 2.7 UI: wizard step 1 Material'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a422b3617b2254b1ba43b130c0322c7a1d07fdeb'
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-MAC Recap-2026-10-08/mockups/material-step.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Wizard step 1 is a placeholder. The owner/designer can't upload project files, even though the upload, listing, remove and favourite backends are all merged (#17, #22, #26, #27).

**Approach:** Build the Material step from EXPERIENCE.md Step 1, using `mockups/material-step.html` for layout and copy and DESIGN.md tokens for the look:
- a drop zone with a lime *sfoglia* link and accepted-type chips
- parallel browser-to-S3 uploads (presign, then a POST with progress, then confirm), each with a progress bar announced to screen readers
- inline rejection of only the bad file
- file rows showing a thumbnail or type icon, the name and the size in mono
- **Preferito** on images and videos only
- remove that takes effect at once, with no undo

**Avanti** is active once one file has uploaded and goes to step 2 (`?caseId=…&step=2`, a placeholder until the Story 2.10 UI). With 0 files, step 2 can't be reached.

## Boundaries & Constraints

**Always:**
- Client components import only `type`s from `@/modules/*`. The server page passes the limits, the allowlist and the initial `listAssets` rows as props, as Story 2.5 does.
- **Limits:**
  - Never presign more files than the remaining slots (20 minus live files minus in-flight uploads). Files beyond that get the 20-file message.
  - Reject files over 100 MB and types outside the allowlist on the client, before presigning.
  - The server enforces the same limits again.
- Use a normalized content type per file, from the extension when the browser reports `""` or `text/x-markdown` (deferred-work L100).
- A failed confirm re-presigns and re-uploads once, because a confirm can't be retried with the same `assetId`.
- Remaining files keep uploading when one fails.
- `STORAGE_NOT_CONFIGURED` shows one clear Italian message and blocks uploads.
- Copy lives in `it.ts`; sizes use an it-IT formatter (e.g. "4,2 MB").
- Uploading or removing files never changes case status.
- Accessibility:
  - the drop zone works by keyboard
  - progress and rejections are announced in a polite live region
  - the toggle uses `aria-pressed`
  - remove has a named button
  - a visible focus ring

**Never:**
- No pasted text, tags or undo.
- No backend or policy changes.
- No step 2 content (Story 2.10 UI).
- No `next/image`; thumbnails are a plain `<img>`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload | 3 valid files dropped | 3 rows with progress in parallel; each becomes a listed row; count "3 / 20 file"; Avanti active | N/A |
| Too large | 140 MB video among valid files | that row shows "Oltre 100 MB. Non caricato."; others upload | inline, announced |
| Wrong type | `.zip` | inline unsupported-type message; nothing sent | inline, announced |
| Over cap | 18 live + 4 dropped | 2 upload; 2 rows show the 20-file message | inline |
| Server rejects | presign/confirm `FILE_LIMIT_REACHED` / `FILE_TOO_LARGE` / `FILE_TYPE_NOT_ALLOWED` / `UPLOAD_REJECTED` | that row shows the matching message | inline |
| S3 POST or confirm fails | network error or confirm 404/500 | one re-presign + retry; then "Caricamento non riuscito." on the row | inline |
| No storage | `STORAGE_NOT_CONFIGURED` | one message above the drop zone; drop zone inactive | banner |
| Favourite | image or video row toggled | `aria-pressed` flips at once; `setAssetFavourite`; on failure it flips back with a row message | inline |
| No toggle | PDF / DOCX / TXT / MD row | no Preferito control | N/A |
| Remove | ✕ on a row | row gone at once (optimistic); on failure it comes back with a message | inline |
| Zero files | no live files | Avanti inactive with reason; `&step=2` URL renders step 1 | server guard |
| Reopen | draft with files | rows listed from the server, oldest first | N/A |

</frozen-after-approval>

## Code Map

- **Page** `src/app/(wizard)/case-studies/new/page.tsx`:
  - With `?caseId=`, call `material.listAssets({caseId})` server-side and pass the rows, `MAX_ASSETS_PER_CASE`, `MAX_FILE_BYTES` and `ALLOWED_CONTENT_TYPES` (from `@/modules/material`) to `<MaterialStep>`. This replaces the placeholder (`it.wizard.materialPlaceholder`, the `wizard-step-note` Avanti).
  - Read `step`. With `step=2` and `hasMaterial` true, render a step-2 placeholder (`current={2}`). Otherwise render step 1.
  - Extend the mocks in `page.test.tsx` (`@/modules/material`).
- **Routes** `src/app/_lib/routes.ts`: `wizardHref(id, step?)` adds `&step=2`.
- **Client upload helper** `src/app/(wizard)/_lib/upload.ts` (new):
  - `uploadToS3(url, fields, file, onProgress): Promise<void>` using XHR. FormData gets every `fields` entry first and `file` last. No Content-Type header. 204 or 2xx is success.
  - `normalizeContentType(file, allowed)` resolves the type from the extension map when the browser's type is empty or a non-canonical alias.
  - Keep both injectable for tests; component tests mock this module.
- **Format** `src/shared/i18n/format.ts`: `formatBytes(n)` via `Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 })` and KB/MB, plus a test.
- **Component** `src/app/(wizard)/_components/material-step.tsx` (`"use client"`), plus sub-parts if it grows (`drop-zone.tsx`, `asset-row.tsx`):
  - State: confirmed rows plus pending rows `{tempId, file, progress, error?}`.
  - Actions come from `@/app/(tool)/case-studies/actions`: `presignAssetUpload`, `confirmAssetUpload`, `listAssets` (refresh the row thumbnail after confirm), `removeAsset`, `setAssetFavourite`.
  - Use `<input type="file" multiple accept=…>` behind the *sfoglia* link. The drop zone handles drag and drop, Enter and Space.
  - Patterns come from `name-step.tsx`: an `inFlight` guard, a `role="alert"` region, and `try/catch` around actions.
  - The footer uses `WizardFooter` (`wizard-frame.tsx`). The `start` slot holds "I preferiti sono facoltativi." The action slot holds an Avanti link to `wizardHref(id, 2)`, or the inactive `PRIMARY_ACTION_INACTIVE` button with `aria-describedby` pointing at the reason.
  - A type icon for non-images comes from lucide-react (`FileText`, `Film`, `File`).
- **Copy** `src/shared/i18n/it.ts` `wizard.material.*`, from the mockup:
  - heading: "Aggiungi il materiale del progetto"
  - intro: "Carica il materiale già verificato. La generazione parte solo da qui."
  - drop zone: "Trascina qui i file o", the link "sfoglia", and "Fino a 20 file, 100 MB ciascuno."
  - type chips: PDF, DOCX, TXT, PNG / JPG, MP4 / MOV (plus MD and WEBP to match the allowlist: "TXT / MD", "PNG / JPG / WEBP")
  - list: "Materiale", "{n} / 20 file", "Preferito", a remove label with the file name
  - rejections: "Oltre 100 MB. Non caricato.", "Questo tipo di file non è supportato. Usa immagini, video, testi o PDF.", the 20-file limit message
  - "Caricamento non riuscito."
  - the storage-off message
  - the Avanti reason "Aggiungi almeno un file per continuare."
  - "I preferiti sono facoltativi."
  - the step-2 placeholder
  - add `it.test.ts` assertions
- **Tests:** `material-step.test.tsx` (happy-dom, testing-library, user-event `upload`; mock the actions module and `../_lib/upload`) covering every matrix row; `upload.test.ts` for FormData order and progress (happy-dom XHR or a stub); page tests for `step=2` with and without material.
- Leave alone: `stepper.tsx` (steps stay non-clickable here; visited-step navigation is Story 2.10 UI) and the backend.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(wizard)/_lib/upload.ts` + test -- XHR POST with progress, content-type normalization
- [x] `src/shared/i18n/format.ts` + test -- `formatBytes`
- [x] `src/shared/i18n/it.ts` + `it.test.ts` -- `wizard.material.*` copy
- [x] `src/app/(wizard)/_components/material-step.tsx` (+ parts) + tests -- every matrix row
- [x] `src/app/(wizard)/case-studies/new/page.tsx` + test, `src/app/_lib/routes.ts` -- server props, `step=2` guard and placeholder
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.7 comment: UI done; 2.5 step 1 no longer waiting

**Acceptance Criteria:**
- Given a draft with no files, when step 1 renders, then the drop zone, chips and hint show, Avanti is inactive with its reason, and no file list shows.
- Given the repo, when lint, typecheck, tests and build run, then all pass.

## Implementation Notes

- The whole drop zone is the keyboard control (`role="button"`, Enter/Space/click opens the hidden input); *sfoglia* is a styled span, so no interactive element is nested inside a button.
- The live region (`role="status"`, polite) appends lines and keeps the last 5, so a quick "caricato" doesn't overwrite a rejection before it is read. It announces start, done, removed and every row error; each upload row also has a named `role="progressbar"`.
- Rows keep their drop order in one list (listed and pending rows together); after an image confirms, `listAssets` is called and only thumbnail URLs are merged in by id, so slow listings can't drop or resurrect rows.
- ✕ on an uploading row cancels it (aborts the XHR); if confirm already went through, the asset is removed again, and if that remove fails it shows as a listed row with the remove error. ✕ on a rejected row dismisses it.
- `UPLOAD_REJECTED` has its own line ("Il file caricato non corrisponde a quello scelto. Non caricato."); presign/confirm codes outside the rejection list (and thrown errors) take the single re-presign retry. A 0-byte file is refused on the client with "Caricamento non riuscito.".
- `STORAGE_NOT_CONFIGURED` drops the affected pending rows; the banner explains them.
- `NOT_FOUND` on remove counts as removed.
- `step=2` uses `material.hasMaterial`; false or a failed check redirects to the step 1 URL. A failed `listAssets` throws into the wizard error boundary.
- After a confirm that threw or answered 5xx, `listAssets` is checked for that `assetId` before re-presigning, so a file stored anyway isn't uploaded twice. Unmounting aborts running S3 POSTs; confirmed files stay.
- `it.wizard.materialPlaceholder` is replaced by `it.wizard.detailsPlaceholder` (step 2).

- Review patches applied (triage #1–3, #5, #6, #8–11, #13–16). Full run: 53 files / 1371 tests, lint, typecheck, build pass.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | Retry after a thrown/5xx confirm can leave a hidden duplicate asset | medium | Real: re-presign never checks whether the first `assetId` was stored | patch |
| 2 | blind, edge | Uploads keep running after unmount (Avanti clicked mid-upload) | medium | Real: no abort on unmount | patch (abort on unmount) |
| 3 | blind | Row error copy hardcodes 100 MB / 20 while the hint uses props | low | Real | patch |
| 4 | blind | Type chips and type error not derived from the allowlist | low | Chips are mockup copy; allowlist changes need a migration anyway | reject |
| 5 | blind | Drag highlight flickers on child dragleave | low | Real | patch |
| 6 | blind | Expired thumbnail URL breaks the image | low | Real | patch (`onError` → type icon) |
| 7 | blind | One `listAssets` per confirmed image | low | Coalescing adds machinery; ≤20 calls | reject |
| 8 | blind, edge | ✕ ignored while a favourite save is in flight | low | Real: shared `busy` set | patch |
| 9 | blind, edge | `formatBytes` prints "1024 KB" just under 1 MB | low | Real | patch |
| 10 | vg, blind | Cancel-after-confirm cleanup untested | medium | Pre-verified gap | patch |
| 11 | vg, blind | 0-byte refusal and live-region cap untested | low | Real | patch |
| 12 | blind, edge | Failed remove restored after its slot was reused can show 21/20 | low | Rare; server cap still holds | reject |
| 13 | blind | `&step=2` fallback keeps the wrong URL | low | Real | patch (redirect to step 1 URL) |
| 14 | blind | `wizardHref` accepts step 3 the page ignores | low | Real | patch (narrow type) |
| 15 | blind | Every Preferito toggle has the same accessible name | low | Real | patch (describe by file name) |
| 16 | edge | Cancel-after-confirm cleanup failure is swallowed | low | Real: hidden asset holds a slot | patch (show it back as a row with the remove error) |
| 17 | edge | XHR has no timeout | low | A timeout risks killing slow 100 MB uploads; stalls are rare | reject |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- all pass

**Manual checks (if no CLI):**
- Real uploads need a dev Supabase project plus an S3 bucket with CORS (deferred-work L91); not possible locally.
