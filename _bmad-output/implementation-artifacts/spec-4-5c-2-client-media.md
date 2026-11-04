---
title: 'Story 4.5c-2: client media in the case configurator, with renditions and soft delete'
type: 'feature'
created: '2026-11-04'
status: 'in-review'
baseline_commit: '674b373a6c01427a1d1fb3d12ab77a05c4b4a835'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A client's photos and videos (up to three files per client, uploaded on the client page) can't be used on a case's pages. The configurator lists only the case's own files. Client files also have no display-sized renditions, so the canvas has nothing light to draw. And deleting a client file erases it for good, so a page that used it couldn't report it as missing at approval.

**Approach:** Give client images and videos renditions, made by the same worker pipeline as case files. Show them in the case configurator's Media tab as a second group, "Del cliente", usable everywhere a case file is. Make deleting a client file a soft delete.

**Decisions (owner, 2026-11-04):**
- 4.5c-2 is client media and the soft delete. The Animazione dialog's own upload is a separate story, 4.5c-3, in deferred-work.
- In a case's configurator, the Media tab shows the client's images and videos as a second group, "Del cliente", below the case's files. They work like case files for placing on a page, Sostituisci/Scegli dai Media, Sfondo · Immagine and the Animazione dialog.
- Client images and videos get renditions like case files, so pages and later exports stay light and videos get a poster.

## Boundaries & Constraints

**Always:**
- Client renditions use the same specs (`image.display`, `video.display`, `video.poster`) and the same processors as case renditions.
- Only the server signs URLs.
- The media guardrail stays as it is: it accepts non-deleted files of the case or of its client.
- A soft-deleted client file disappears from every list and frees its 1–3 slot, but a revision that references it reports `MATERIAL_MISSING` at approval, as case files already do.
- Upload, favourite and removal never change case status.

**Never:**
- Upload client files from the configurator. They're added on the client page, as today.
- Favourites on client files.
- Client PDFs or text files on pages.
- The client-mode Media tab ("Del cliente" / "Dalle sue case" in 4.11).
- The Animazione dialog's drop zone (4.5c-3).
- Hard-deleting a client file's object on removal: the object stays, as a soft-deleted case file's does.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Client image uploaded | Image confirmed on the client page | A `rendition` job for it. Once done, it appears under "Del cliente" with its display copy. | Failed job → the tile shows no preview; the page still works, as for case files |
| Client video | Video confirmed | Display copy and poster. The tile shows its length, as case videos do. | As above |
| Client PDF/text | Non-media file | No job, and not shown under "Del cliente" | N/A |
| Place a client file | Drag or click a "Del cliente" tile onto a page, into Sfondo · Immagine, or into the Animazione dialog | Same as a case file. It saves and draws from its rendition. | N/A |
| Remove a client file | Removed on the client page | The row gets `deleted_at` and its slot frees, so a new upload can take position 1–3. The object stays. | Unknown or other client's file → `NOT_FOUND`, as today |
| Approve with a removed client file | A page uses a client file that has since been soft-deleted | Approva refuses with `MATERIAL_MISSING`, naming the file | N/A |
| Existing client files | Uploaded before this story | The renditions backfill also makes theirs | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261019140000_case_study_client_material.sql` -- `client_asset`: positions 1–3, `client_asset_client_position_key unique (client_id, position)`, `insert_client_asset` picks the lowest free slot, `delete_client_asset` hard-deletes.
- `supabase/migrations/20261020120000_material_rendition.sql` -- `rendition` (PK `(asset_id, spec_hash)`, FK to `asset`) and `upsert_rendition`, which checks the path. Mirror both for client files rather than loosening the FK.
- `src/modules/material/worker.ts` (`renditionHandler`) + `application/make-renditions.ts` -- the handler is built from an asset repository, a rendition repository, storage and key functions. Build a client variant from client-side adapters. Don't fork the processing code.
- `src/modules/material/application/confirm-upload.ts` (`enqueueRenditions`, around line 72) -- the pattern for enqueueing after a confirmed upload. Client uploads confirm in `src/modules/case-study/application/confirm-client-material-upload.ts`.
- `src/modules/jobs/domain/job.ts` (`JOB_KINDS`) and `src/worker/run.ts` (`workerHandlers`) -- either reuse `rendition` with an owner in the payload, or add a `client_rendition` kind. Pick the one with less migration and DB-check churn, and note why.
- `src/modules/material/application/backfill-renditions.ts` + `dev:renditions-backfill` -- extend it to client files.
- `src/modules/case-study/application/remove-client-material.ts`, `adapters/supabase/client-repository.ts` (`listAssets`, `deleteAsset`) -- move to a soft delete. Lists filter `deleted_at is null`.
- `src/modules/case-study/application/revisions.ts` (`allowedAssetIds`, around line 147) and the approval material check (4.8) -- they must see soft-deleted client files as deleted.
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` -- already loads `listClientMaterial` for `clientFiles` (names only). Add the client files' render assets (as `renderAssetsOf` does for case files) and pass the listed client media.
- `src/app/(wizard)/_components/configurator/media-tab.tsx`, `right-panel.tsx`, `configurator.tsx`, `animation-dialog.tsx`, the Sfondo image grid -- add the "Del cliente" group and include client files wherever a case file can be picked. There's no favourite star and no remove button on client tiles.
- `src/shared/i18n/it.ts` -- `configurator.media.clientGroup: "Del cliente"`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261105120000_case_study_client_media.sql` -- the client file changes:
  - add `client_asset.deleted_at`;
  - replace the unique `(client_id, position)` with a partial unique index `where deleted_at is null`;
  - make `insert_client_asset` ignore deleted rows when picking a slot;
  - make `delete_client_asset` set `deleted_at` instead of deleting;
  - add `client_rendition` with `upsert_client_rendition`, mirroring `rendition` with keys under the client's prefix;
  - all service role only.

  Then regenerate `db.types.ts`.
- [x] `src/modules/case-study` -- soft delete in the use case and the adapter. Lists ignore deleted rows. The client-file lookup the guardrail and approval use reports deleted ones as missing. Add tests.
- [x] `src/modules/material` (+ `jobs`, `worker/run.ts`) -- a client rendition repository, a key function, the handler variant, the job wiring, the enqueue on client confirm, the backfill, and `getClientRendition`. Add tests mirroring the case ones.
- [x] `configurator/page.tsx` + `_lib/configurator-data.ts` -- client render assets and the client media list (images and videos only).
- [x] Configurator UI (`media-tab.tsx`, `right-panel.tsx`, `configurator.tsx`, `animation-dialog.tsx`, the Sfondo grid) -- the "Del cliente" group and the pickers. Tests: a client tile placed, used as a background and used in an animation; no star or remove on client tiles; the group is hidden when the client has no media.
- [x] `src/shared/i18n/it.ts` + `it.test.ts` -- the copy.
- [x] `test/db/*.db.test.ts` -- a soft delete frees the slot, so a fourth upload after a removal succeeds; `client_rendition` writes and its RLS lockout; approval with a soft-deleted client file → `MATERIAL_MISSING`.

**Acceptance Criteria:**
- Given a client with an image, when a person opens one of that client's cases in the configurator, then the image is under "Del cliente" and can be placed on a page, and the saved document passes the guardrail.
- Given a client file removed on the client page, when a person opens the client page, then it's gone from the list, and its slot takes a new upload.

## Implementation Notes

- **Job kind: reused `rendition`**, with `payload: { owner: "client", clientId }` for a client file. `routeRenditionJobs` (material) sends a client job to the client handler and any other to the case handler. A new `client_rendition` kind would have meant dropping and recreating the `job.kind` check (jobs module), touching `JOB_KINDS` and its migration test, and registering a second handler, for no gain: the subject id (a UUID) and the input hash already keep the two apart. A client job has no case, so a permanent failure is only logged.
- **One handler, generic source.** `makeRenditionHandler` / `makeBackfillRenditions` take any source with `{ id, kind, deletedAt }` (defaults keep the case shape); the client variant is built in `material/worker.ts` from `case-study.getClientAsset`, `createSupabaseClientRenditionRepository` and `clientAssetKey` / `clientRenditionKey`. No processing code is forked.
- **Ownership.** `client_asset` stays case-study's: material reads client files only through `case-study.getClientAsset` and `listLiveClientMediaPage` (module-only). `client_rendition` is material's, like `rendition`. The original's key is duplicated in `material/adapters/asset-key.ts` (`clientAssetKey`); `test/client-material-types.test.ts` keeps it equal to case-study's `clientMaterialKey`.
- **Enqueue on confirm** happens in the clients server action (`material.enqueueClientRenditions` after `case-study.confirmClientMaterialUpload`): case-study cannot import jobs or material (jobs and material already import case-study). It never fails the confirm.
- **Object storage**: the rendition-only write guard now also allows `clients/{clientId}/material/{assetId}/renditions/{hash}.{webp|mp4}`.
- **Guardrail and approval** need no code change: both read `clients.listAssets`, which now ignores soft-deleted rows.
- **Configurator**: client media reach the UI shaped as `ListedAsset` (`clientMediaOf`: never a favourite, never pending; thumbnail = image display copy, else the signed original; video poster). A failed client rendition read leaves the file undrawn and never fails the page. A client file whose rendition isn't ready at load stays undrawn until the page is reloaded (case files are polled; client files are not uploaded from here).

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | gap, edge | The approved case page never reads client renditions, so a placed client image is an empty cell once approved | high | `(tool)/case-studies/[caseId]/page.tsx` builds `assets` from `material.listAssets` only | patch |
| 2 | blind, edge | One failing client rendition read drops every client file's assets | medium | One `renderAssetsOf(clientListed).catch(() => ({}))` for the batch | patch |
| 3 | blind, edge | Client files aren't refreshed by `getRenderAssets`: a pending rendition never draws, and signed URLs break after the 15-minute TTL | medium | `getRenderAssets` keeps only `material.listAssets` ids; case files refresh, client files don't | patch |
| 4 | blind | Exports and `resolveRefs` resolve case assets only | medium | No export exists yet (5.3); the configurator and case page are the renderers today | defer (5.3 must include client files) |
| 5 | blind | Removing a client file no longer records the actor | low | Previously only a failure log; no event existed for removal | rejected |
| 6 | blind, edge | Removed client files and renditions are never purged; `remove()` port unused | low | Soft delete keeps objects by design (spec Never) | defer |
| 7 | blind | `client_rendition` FK has no `on delete cascade` | low | Client files are never hard-deleted after this story | rejected |
| 8 | blind | Only the clients action enqueues renditions | low | One caller today; backfill covers misses | rejected |
| 9 | blind | Backfill's default `payloadOf` double cast | low | Type hygiene, no runtime path reaches it | rejected |
| 10 | blind, gap | Media tab empty-state ternary; case "empty" copy above a full client group | low | Cosmetic | defer (with #19) |
| 11 | blind | `getClientAsset` has its own UUID regex | low | Same result; style | rejected |
| 12 | blind | Upload failure logs lose the client id | low | Log detail only | rejected |
| 13 | blind, gap | No test: refused-save banner names a client file | gap | `missingMessage` falls back to `clientNames`, untested | patch (test) |
| 14 | blind | "Del cliente" announced twice (section + list label) | low | Direct correction | patch |
| 15 | edge | Malformed client job id retries | low | Ids are written by code | rejected |
| 16 | edge | Job router drops `onPermanentFailure` | false | Neither handler defines it | rejected |
| 17 | edge | Client backfill skipped when the case half errors | low | Dev tooling | rejected |
| 18 | gap | Backfill's deleted-client/removed-file filters only stub-tested | gap | Dev tooling; handler skips such files | defer |
| 19 | gap | No test for a case with only client media | gap | Cosmetic layout | defer |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green
- `npm run test:db` (CI) -- expected: green, including the new migration

**Manual checks:**
- On mac-recap-dev, once the migration is applied (only after green CI and the owner's agreement): upload a client image, run `npm run dev:renditions-backfill`, open a case of that client and place the image; remove a client file and approve a case that used it.
