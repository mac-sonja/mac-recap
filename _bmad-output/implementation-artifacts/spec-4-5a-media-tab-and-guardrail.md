---
title: 'Story 4.5a: the Media tab and the media guardrail'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '9bb76e728611e2bc3a441a76478a11e9624ce4f8'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The configurator's **Media** tab is a "soon" placeholder, so the owner can't see, star or add the case's images and videos without leaving it, and `saveRevisionDoc` only accepts assets the revision already uses, which blocks every later media edit (4.5b, 4.5c, Sfondo Immagine).

**Approach:** Build the Media tab (list, search, grid/list, on-page marker, video length, favourite star, drop zone uploading with Story 2.7's rules) and replace `saveRevisionDoc`'s asset rule with the media guardrail: a newly referenced asset must be a non-deleted file of this case or a file of its client. Split from Story 4.5 at the owner's choice (2026-10-30); placing media is 4.5b, Animazione is 4.5c.

## Boundaries & Constraints

**Always:** Mockup `configurator.html` (`renderRight` media branch, `.mtile`, `.star`, `.vid`, `.drop`, `#dropFoot`) is the UX source; tokens and voice per the `mac-recap-ui` skill; Italian copy from `it.ts`. Favourite and upload go through the existing server actions (`setAssetFavourite`, `presignAssetUpload`, `confirmAssetUpload`, `listAssets`), which authorize and record events; status never changes. The drop zone takes only images and videos; anything else is refused on that file with a message, without a server call. Star toggles at once and rolls back with a message on failure. Messages use the canvas status line (`useStatusMessage`). The guardrail is server-side, in the case-study use case.

**Never:** No placing, replacing, fit, crop or Animazione (4.5b/4.5c). No click or drag behaviour on tiles yet. No remove-from-material in the tab. No migration. No recolour, filter or effect controls. No client media in the case's Media tab (client mode is 4.11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save, text edit | doc references only assets the stored doc already references | saved, no asset lookup | N/A |
| Save, new case asset | new ref to a live asset of this case | saved | N/A |
| Save, new client asset | new ref to a `client_asset` of the case's client | saved | N/A |
| Save, foreign asset | new ref to another case's, a deleted, or an unknown asset | nothing written | `ASSET_NOT_ALLOWED` with `assetIds` |
| Save, kept deleted ref | stored doc already references an asset since soft-deleted | saved (approval reports it later) | N/A |
| Drop mixed files | 2 images, 1 PDF | images upload and appear; PDF refused by name | per-file message |
| Upload rejected | server says `FILE_LIMIT_REACHED` / `FILE_TOO_LARGE` / `FILE_TYPE_NOT_ALLOWED` / `UPLOAD_REJECTED` | that file named with the Story 2.7 message | no retry |
| Star fails | `setAssetFavourite` not ok | star returns to its previous state | message |

</frozen-after-approval>

## Code Map

- `src/modules/case-study/application/revisions.ts` -- `makeSaveRevisionDoc` (~l.133): today `allowed` = refs of stored `doc` ∪ `generatedDoc`. Replace with: `added` = refs(new) − refs(stored `doc`); if empty, save; else allowed = `caseAssetIds(caseId)` ∪ ids of `clients.listAssets(case.clientId)`. Refresh its doc comment.
- `src/modules/case-study/index.ts` -- `saveRevisionDoc(actor, input)` (~l.533), `revisionDeps()`; add a third parameter `caseAssetIds: (caseId: string) => Promise<Result<readonly string[]>>` (case-study can't import material: material imports it) and the client repository to the deps.
- `src/modules/case-study/ports/client-repository.ts:124` -- `listAssets(clientId)` reused for client ids (no signed URLs).
- `src/modules/material/index.ts` -- add `liveAssetIds(caseId)`: non-deleted asset ids, storageless (reuse the asset repository's list behind `listGenerationAssets`).
- `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` -- pass `material.liveAssetIds` into `caseStudy.saveRevisionDoc`.
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` -- pass `media` (listed images and videos) to `Configurator`.
- `src/app/(wizard)/_components/configurator/right-panel.tsx` -- tabs Pagine/Media (today Media calls `onSoon`); search and view are shared; search label/placeholder per tab.
- `src/app/(wizard)/_components/configurator/configurator.tsx` -- owns `media` state, passes in-use ids (refs of the current format's pages via `referencedAssetIds`-like walk, client-safe) and `showMessage`.
- `src/app/(wizard)/_lib/upload.ts` -- `uploadFile`, `normalizeContentType`, `acceptFor` reused; `src/app/(wizard)/_components/material-step.tsx` -- upload attempt/retry pattern, `REJECTION_CODES`, `toListed`, `THUMBNAIL_POLL_MS`/`_MAX_MS` to mirror (do not refactor the step).
- `src/app/(tool)/case-studies/actions.ts` -- existing actions above; unchanged.
- `src/shared/i18n/it.ts` -- `configurator.tabs` (~l.959), `configurator.search`; reuse `wizard.material.errors` for upload rejections.

## Tasks & Acceptance

**Execution:**
- [x] `src/modules/material/index.ts` (+ application if needed) -- add `liveAssetIds` -- the guardrail's case side without signing URLs.
- [x] `src/modules/case-study/application/revisions.ts`, `src/modules/case-study/index.ts` -- the guardrail per the matrix -- unblocks 4.5b/4.5c.
- [x] `src/modules/case-study/application/revisions.test.ts` -- cover every matrix save row, and that no lookup runs when nothing is added.
- [x] `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` (+ test) -- wire `material.liveAssetIds`.
- [x] `src/app/(wizard)/_components/configurator/media-tab.tsx` (new) -- tiles (thumbnail or type placeholder, name, "▶ m:ss" for videos read from the `video.display` URL's metadata in the browser, on-page dot, star with `aria-pressed` and "Aggiungi ai preferiti"/"Togli dai preferiti"), grid/list, empty and no-match lines, foot drop zone ("Trascina qui immagini e video", "Finiscono nei Media di questa case.", keyboard-openable file input); upload presign → PUT → confirm with one retry, then re-list (and poll while thumbnails are pending, as the Material step).
- [x] `right-panel.tsx`, `configurator.tsx`, `page.tsx`, `it.ts` -- wire the tab and data; drop the Media "soon".
- [x] `src/app/(wizard)/_components/configurator/configurator.test.tsx` (or `media-tab.test.tsx`) -- tab switch, search, in-use marker, star success and rollback, drop with a refused type, upload rejection message, no recolour/filter controls.

**Acceptance Criteria:**
- Given the configurator, when I open **Media**, then the case's images and videos list oldest first, filtered by **Cerca** on file name, in grid or list view, each file on a page of the format in view marked.
- Given a file's star, when I press it, then its favourite flag and event are recorded and the case's status is unchanged.
- Given the Media tab, when I drop or choose images and videos at its foot, then they upload with Story 2.7's limits and appear in the list.
- Given the Pagine tab, when I switch back, then pages, search and view behave as before.

## Implementation Notes

- Implemented directly in the session (no subagent).
- The plain helpers (`isMedia`, `MediaUploadRules`, `pageAssetIds`, `formatLength`) live in `configurator/media-files.ts` without "use client", because the server page uses `isMedia` and a server component can't call a function exported from a client module. Tests: `media-files.test.ts`.
- `test/db/revision.db.test.ts` passes a stub `caseAssetIds` (no asset is added there); it isn't run here (needs local Supabase).
- `imagePoolOf`'s comment no longer says the guardrail is pending; Pagine di default still places only images the revision already uses (4.4c's behaviour, unchanged).
- Dependencies installed with `--engine-strict=false` (container has Node 22, the repo pins 24). No visual check in a browser: the configurator page needs Supabase.

## Spec Change Log

- Loop 1 (review, Blind Hunter + Edge Case Hunter): the guardrail counted only the stored `doc`'s refs as kept, so Pagine di default (generated images and text source refs, `imagePoolOf`) or an undo could bring back a generated ref whose file was deleted, and autosave stayed blocked for good. Amended Design Notes: `kept` = refs of stored `doc` ∪ `generatedDoc`. Known-bad state avoided: a revision that can never be saved again. KEEP: everything else in the implementation (injected `caseAssetIds`, lookups only when something is added, client files from the client repository, the Media tab); applied as a one-line change plus tests rather than a full revert.

## Review Triage Log

| # | Finding | Verdict | Route / evidence |
|---|---------|---------|------------------|
| 1 | Generated refs no longer kept: default pages / undo of a deleted generated asset blocks autosave | high | bad_spec → fixed (loop 1); `default-pages.ts` copies `sourceRefs`, `imagePoolOf` includes `generatedDoc` images, `ASSET_NOT_ALLOWED` is permanent in `use-document.ts` |
| 2 | Re-list during an in-flight star flips it back | medium | patch: `relist` keeps the shown star for ids in `favouriteBusy` |
| 3 | Files dropped outside the foot zone make the browser open them, leaving the configurator | medium | patch: the whole tab handles dragover/drop and uploads |
| 4 | Drop after storage is off is silent | low | patch: says the storage message |
| 5 | Drop zone's accessible name lacks its visible text (WCAG 2.5.3) | low | patch: name is "{lead}, {choose}" |
| 6 | Untested: size refusal, storage off, late-confirmed upload, thumbnail polling, keyboard picker | medium | patch: tests added in `configurator.test.tsx` |
| 7 | Untested: one save adding an allowed and a foreign asset | low | patch: test added |
| 8 | Newly uploaded files have no render asset (no video length now, not placeable in 4.5b) | medium | defer to 4.5b (deferred-work) |
| 9 | Client files are hard-deleted though a revision may reference them | medium | defer to 4.5b (deferred-work); not reachable until client media can be placed |
| 10 | A ref the user placed, removed and then restored by undo after its file was deleted blocks autosave | medium | defer (deferred-work); same behaviour before this change, reachable once 4.5b places media |
| 11 | Video length untested (needs HTMLMediaElement stubbing) | low | defer with 4.5b |
| 12 | Sprint-status 4.4 comment still says Sfondo Immagine "with 4.5 (drafting)" | low | patch: comment now names 4.5b |
| 13 | Retry presigns again when the re-list after a failed confirm fails, possible duplicate | low | rejected: rare (two failures in a row), same as the Material step's `storedAfterAll`; fix adds a branch |
| 14 | Overlapping re-lists resolving out of order | low | rejected: unlikely, fix adds a sequence guard |
| 15 | `initialFiles` read once | false | the configurator is keyed by head id:version and remounts on `router.refresh()` after a stale save |
| 16 | Video length only shown in grid view | false | mockup `.media.list .vid{display:none}` |
| 17 | Placeholder not per tab; query shared across tabs | false | mockup uses one "Cerca" and one `q` for both tabs |
| 18 | Live document/text asset id accepted as a media ref | low | rejected: the AC asks for "a file of this case"; no UI offers non-media, a crafted request only breaks its own render |
| 19 | Check-then-write race with a deletion | low | rejected: approval checks `MATERIAL_MISSING` |
| 20 | `saveRevisionDoc` signature pushes `caseAssetIds` onto callers | false | no harm named: one caller; documented in the index; material can't be imported by case-study |
| 21 | "Reorder" and "remove" not covered by any sub-story | false | remove from a page is 4.3c, block/element moves 4.3e; 4.5b covers replacing |
| 22 | DB suite uses a stub `caseAssetIds` | low | rejected: unit and action tests cover the wiring; the DB suite needs local Supabase |
| 23 | New deferred entries say `source_spec: none` | low | rejected: they were split from Story 4.5 in step 1, before this spec existed (the format asks for `none` then) |

## Design Notes

Keeping refs the revision already has (stored `doc` or `generatedDoc`) avoids a dead end: once a placed asset is soft-deleted, every later save would otherwise be refused (`ASSET_NOT_ALLOWED` is a permanent code in `use-document.ts`); Story 4.8's `MATERIAL_MISSING` reports it instead. Pagine di default and undo bring generated refs back, so those stay allowed. Client files are hard-deleted today; making them soft-deletable when a revision references them belongs to 4.5b, when they can first be placed.

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm test` -- all pass, including the new tests

**Manual checks (if no CLI):**
- Run the app, open an In revisione case's configurator, switch to Media, star a file, drop an image and a PDF.
