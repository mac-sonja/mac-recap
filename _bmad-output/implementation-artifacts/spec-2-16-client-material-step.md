---
title: 'Story 2.16: Client material step'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_commit: 'dafed69bfe7f97038d8f4b778e36a5505f3a3eb5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-15-client-wizard-and-details-step.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Step 2 **Materiale** of the client wizard is a placeholder, so a client can't get the 2–3 images its intro pages need.

**Approach:** Build step 2 by reusing the case material step with client actions. A new `client_asset` table and the logo upload pipeline handle up to 3 files, at least 2 of them images, and **Crea introduzione** goes to the client page until Story 3.9. (The owner's Clients-list changes of 2026-10-19, the **ID** header and rows that always open the client page, ship first in their own PR.)

## Boundaries & Constraints

**Always:**
- **File rules:**
  - The case material types and size limit: JPEG, PNG, WebP, MP4, MOV, PDF, TXT, MD and DOCX, up to 50 MB.
  - Images must be ≥1600 px on the short side and ≤8000 px on any side, checked in the browser and again at confirm.
  - At most 3 files per client. A 4th is refused inline with "Massimo 3 file.", and the other files keep uploading.
- **Upload flow:** presign (authorize, type, size, cap) → PUT to `clients/{clientId}/material/{assetId}.{ext}` in bucket `material` → confirm. Confirm re-checks the stored type, size and image pixels before it inserts the row. The database assigns the first free position (1–3) and refuses a 4th row.
- **Removal:** it is immediate, with no confirm and no undo, and deletes the row and the object. If the object delete fails, the removal still succeeds and the failure is logged. Removing an image can bring the count below 2; the button then turns off again.
- **Copy:**
  - Above the drop zone: "Carica fino a 3 file, almeno 2 immagini. Le immagini servono per le pagine di introduzione."
  - **Crea introduzione** is inactive with fewer than 2 images, with the reason "Carica almeno 2 immagini." linked via `aria-describedby`.
- **Crea introduzione** (until Story 3.9) navigates to the client page.
- Step 2 opens only once step 1 is complete (as in 2.15), and it lists the client's current files.
- Every action calls `getActor` and then `authorize("manage clients")`; any other role gets `FORBIDDEN` and nothing is written. The `case-study` module owns `client_asset` and its key prefix; material-module code is copied, never imported.

**Never:**
- Editing an applied migration, or running `supabase db push`.
- Favourites, reorder or replace on client files (reorder and replace come with 4.12).
- Sending client files to the LLM.
- Changing the case material step's behaviour.
- Building any intro job (that is 3.9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two images | Two valid JPEGs | Rows listed; **Crea introduzione** active | N/A |
| Image + PDF | One image, one PDF | Rows listed; button inactive, "Carica almeno 2 immagini." | N/A |
| 4th file | 3 stored, a 4th dropped | Inline "Massimo 3 file." on that file only | Direct call → `CLIENT_MATERIAL_LIMIT`, nothing written |
| Small image | 1200 px short side | Refused inline before upload | Confirm also refuses → `UPLOAD_REJECTED`, no row |
| Wrong type / too big | `.zip`, or 60 MB | Refused inline | Presign → `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` |
| Type mismatch | Stored object type ≠ declared | No row | `UPLOAD_REJECTED` |
| Remove | Remove 1 of 2 images | Row gone at once; button inactive | Object delete failure is logged only |
| Crea introduzione | 2+ images | Opens `/clients/{clientId}` | N/A |
| Other role | account/sales/social or admin | Fails | `FORBIDDEN`, nothing written |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/_components/material-step.tsx`:
  - Today it imports the case actions (L5–11), hard-codes `it.wizard.material`, `WizardFooter current={1}` and `wizardHref(caseId, 2)` (L388–407), and `ready = listed.length > 0` (L344).
  - Generalise it with optional props (`actions`, `copy`, `ready`, `footerAction`, `steps`), keeping the case defaults identical.
  - Its client-side checks and slot cap (L261–292) and its per-file errors are reused as they are.
- `src/app/(wizard)/_components/asset-row.tsx`: make `onToggleFavourite` optional, with no toggle when it is absent. `drop-zone.tsx` and `_lib/upload.ts` are reused as is.
- `src/modules/case-study/application/{request,confirm}-client-logo-upload.ts`, `ports/logo-storage.ts`, `adapters/supabase/logo-storage.ts`, `adapters/logo-key.ts`, `adapters/image-size.ts`: the logo pipeline. Copy it for client material.
  - `dimensions` downloads the whole object, and `imageSize` needs the full body. That is acceptable at ≤50 MB.
  - Only images get a pixel check; other types get type and size only.
- `src/modules/material/domain/files.ts`: `ALLOWED_FILE_TYPES`, `MAX_FILE_BYTES`, `kindFor`. Mirror them as client constants in `case-study/domain` (module boundary), and add a test that keeps both lists equal.
- `src/modules/case-study/{ports,adapters/supabase}/client-repository.ts`: add `listAssets`, `insertAsset` (RPC) and `deleteAsset`. `getClient` returns the assets with signed thumbnail URLs for images (≤15 min).
- `src/app/(wizard)/clients/new/page.tsx` L91–112: replace the placeholder with the step.
- `supabase/migrations/20261016140000_case_study_client_info.sql` L24–38: the `client_logo` pattern (checks, index, RLS, revokes). Bucket `material` already allows all nine types up to 50 MB for every path, so no bucket change is needed.
- `src/shared/i18n/it.ts`: `clientWizard.material.*` (L301–305), with a new pixel-size error.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261019140000_case_study_client_material.sql`:
  - add `client_asset` (`id` uuid pk; `client_id` FK; `position` smallint 1–3; `path` unique non-blank; `mime_type` in the nine types; `size_bytes` 1–52428800; `width`/`height` null or 1–8000, and both set exactly when `mime_type` is an image; `created_by`; `created_at`), unique on (`client_id`, `position`), with an index, RLS on and revokes;
  - add `insert_client_asset(...)` (advisory lock per client, first free position, P0001 `CLIENT_MATERIAL_LIMIT` when 3 exist, `CLIENT_NOT_FOUND`) and `delete_client_asset(p_asset_id)`;
  - grants to service_role only.
- [x] `src/modules/case-study/**`:
  - constants: types, max 3, min images 2, ≥1600 px;
  - schemas;
  - the use cases `requestClientMaterialUpload`, `confirmClientMaterialUpload`, `listClientMaterial`, `removeClientMaterial`;
  - storage port and adapter (presign, head, dimensions, remove, signed GET);
  - `clientMaterialKey`;
  - `index.ts` exports;
  - errors mapped as in the matrix.
- [x] `src/app/(tool)/clients/actions.ts`: the four actions above.
- [x] `src/app/(wizard)/_components/{material-step,asset-row}.tsx`: generalised. Case tests unchanged and green.
- [x] `src/app/(wizard)/clients/new/page.tsx`, `_components/client-material-step.tsx`: step 2 per the matrix. Update `page.test.tsx`.
- [x] `src/shared/i18n/it.ts`, `it.test.ts`: the copy above.
- [x] Tests:
  - `test/db/case-study.db.test.ts`: table, checks, positions, the 4th refusal, delete, grants, `FORBIDDEN` through the actions;
  - `use-cases.test.ts`, the storage adapter test and `actions.test.ts`;
  - component tests for the client material step (every matrix row).

**Acceptance Criteria:**
- Given the case material step, when it runs after the generalisation, then its uploads, favourites, removal and Avanti behave as before.
- Given a client with files, when step 2 opens again, then its files are listed in position order, with thumbnails for images.
- Given CI, when `check`, `db` and `image` run, then they pass and `db.types.ts` matches.

## Design Notes

**Positions are chosen in SQL.** `insert_client_asset` takes a per-client advisory lock, picks the lowest free position and refuses a 4th. Two uploads confirmed at the same moment can't both take position 2, and the 3-file cap holds even when the browser's count is stale.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.
- `npm run test:db` -- runs in CI only (no local Docker). Commit CI's `db.types.ts` if it drifts.

**Manual checks:**
- After the owner applies the change to dev:
  - upload two images and a PDF, and check the button state;
  - remove one image;
  - try a 4th file;
  - press **Crea introduzione** and check it opens the client page.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | After removing File 1 and adding a file, the list shows it last instead of in position order | low | patch | `material-step.tsx` swaps the finished row into the pending slot and never sorts by `position`. |
| 2 | blind, edge-case | An image the browser can't measure gets the generic "non corrisponde" message when confirm refuses its pixels | medium | patch | `confirm-client-material-upload.ts` knows the reason but returns plain `UPLOAD_REJECTED`. |
| 3 | blind | Stored files lose their original name and show "File N · TYPE" | medium | patch | `client_asset` has no name column; Story 2.7 rows (the model) show the file name. Migration not applied yet. |
| 4 | blind, edge-case, verification-gap | The client page now fails if the file read fails, and signs thumbnails it never shows | medium | patch | `getClient` lists assets for every caller; the page only needs the info. |
| 5 | verification-gap | Presign-side `CLIENT_MATERIAL_LIMIT` → "Massimo 3 file." untested | low | patch | Only the confirm path is tested. |
| 6 | verification-gap | Browser check for a side over 8000 px untested | low | patch | One test case; cheap. |
| 7 | blind | `toClientAsset` hard-codes `position > 3`; `clientImageCount` exported but unused | low | patch | Direct correction: use the constants and the helper. |
| 8 | blind | Remove-failure log comment says "client id only" but logs actor too; `deleteAsset` log lacks `clientId` | low | patch | Direct correction. |
| 9 | blind, edge-case | Refused or abandoned uploads leave orphan objects under `clients/*/material/` | medium | defer | Same as client logos (2.15 finding 8); needs a cleanup decision. |
| 10 | blind | The split entry in deferred-work.md is shipped work | low | patch | Entry kept (workflow format), PR number added. |
| 11 | blind | Spec and sprint status disagree | false | reject | `in-review` spec with `in-progress` tracker is the workflow's normal state. |
| 12 | blind | SQL doesn't tie `path` to the client's prefix | low | reject | Only the service role inserts, through the adapter that builds the key; adds a check. |
| 13 | blind | `as number` casts on nullable width/height | low | reject | Generated types; null reaches the RPC correctly at runtime. |
| 14 | blind | Missing tests for unmount during pixel check, no-caseId throw, slot release, rollback | low | reject | Edge timings; the main paths are covered by the matrix tests. |
| 15 | blind | `listClientMaterial` takes no actor | low | reject | No per-actor rule exists for listing. |
| 16 | edge-case | `MaterialStep` with neither `caseId` nor `footerAction` builds a broken URL | false | reject | Both callers pass one; it's a misuse, not a reachable state. |
| 17 | edge-case | 4xx confirm codes other than rejections are retried once | low | reject | Rare races; one retry then a generic error. |
