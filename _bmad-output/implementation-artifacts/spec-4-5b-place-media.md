---
title: 'Story 4.5b: place and replace media on a page'
type: 'feature'
created: '2026-10-30'
status: 'in-review'
baseline_commit: 'f1c1236549c8ae97d955f90cfea2a9e2a20a98e6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Media tab (4.5a) lists the case's files, but nothing puts one on a page: an image can't be replaced and an empty image or video can't be filled. A freshly uploaded file has no render asset until reload, and a save refused for a deleted file shows only the generic banner.

**Approach:** Drag a Media tile onto the canvas (onto an image or video: replaces it; elsewhere in a block: a new one there) or click it (fills the selected image or video, else adds to the selected block). A selected image or video shows its file in the left panel with **Sostituisci dai Media** / **Scegli dai Media**, which opens the Media tab. Uploads bring back their render assets; an `ASSET_NOT_ALLOWED` save names the file and offers to take it off the page. Split from Story 4.5 (owner, 2026-10-30); Sfondo · Immagine, the client-file soft delete and Adattamento/Ritaglia/Zoom were split off (deferred-work).

## Boundaries & Constraints

**Always:** Mockup `configurator.html` (`wireBlock` media drop, `renderBlockProps` image branch, `mediaPicker`, tile `onclick`) is the UX source; tokens and voice per `mac-recap-ui`; copy in `it.ts`. Each placement is one undo step in the format in view, saved through `useDocument`. Only the case's own media; the server guardrail stays as 4.5a left it. The element takes the file's kind; replacing a file keeps `fit` and drops `crop`. Gestures only while `editable` and not in Anteprima. `ActionResult` gains `assetIds` for `ASSET_NOT_ALLOWED` only.

**Never:** No Adattamento, Ritaglia or zoom controls; no Sfondo · Immagine; no client media; no Animazione (4.5c); no moving elements or blocks by drag (4.3e). No migration. No `router.refresh()` for new assets (it remounts the configurator and drops undo history).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drop on media | tile dropped on an image or video element | its `assetId` is the file, type its kind, crop dropped; selected | N/A |
| Drop in block | tile dropped elsewhere in a block | new element (file's kind, `fill`) before the top-level element under the pointer, else at the end; selected | block full: `blockFull` message, nothing changes |
| Drop off a block | tile dropped on the page outside any block | nothing changes | message "Trascina il file dentro un blocco." |
| Click tile | selection: image/video element / other element or block / page or nothing | fills it / appended to that block / nothing | no block: `needBlock` message |
| New upload | file confirmed, rendition not ready | placeable at once (empty cell); its render asset is fetched after each re-list until it arrives | fetch fails: retried at the next re-list |
| Deleted file | save refused `ASSET_NOT_ALLOWED` with `assetIds` | banner names the file(s) (name from the tab's list, else "un file") with **Togli dalla pagina**: those media elements get `assetId: null`, one undo step, saved | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/_components/configurator/page-editing.ts` -- add pure `placeMedia(pages, target {pageKey, blockId?, elementId?}, file {id, kind}, newId)` → `PageEdit` (reuse `withPage`, `findElement`, `MAX_ELEMENTS_PER_BLOCK`; new refusal `offBlock`; `blockFull` already exists) and `clearAssets(pages, ids)` (inside Testi groups and rows too).
- `configurator.tsx` -- owns `assets` state (from props, merged), the right panel's `tab` (lifted from `right-panel.tsx:88`) and its open state, `placeFile`/`pickFile` handlers via `applyPageEdit` (add `blockFull`/`offBlock` messages), fetch of render assets for listed media ids missing from `assets` (one request in flight), the missing-file banner.
- `canvas.tsx` `CanvasPage` -- `onDragOver`/`onDrop` for `MEDIA_DRAG_TYPE` (`application/x-mac-media`, id as data; `selectionAt` gives the target); while over, the target block framed (`data-frame="drop"`). New prop `onPlaceMedia(target, assetId)`.
- `media-tab.tsx` -- tiles `draggable` (set `MEDIA_DRAG_TYPE`), click or Enter/Space calls `onPick(file)` (the star stays its own button, stopPropagation); the tab-level drop uploads only when `dataTransfer.files` is non-empty; after each re-list calls `onListed(files)`.
- `right-panel.tsx` -- `tab`/`onTab` props, `mediaTabRef`; passes `onPick`, `onListed`.
- `left-panel.tsx` -- for `element.type` image/video: eyebrow Immagine/Video, 44 px thumbnail + file name (or "Nessun file"), **Sostituisci dai Media**/**Scegli dai Media** → `onOpenMedia` (shows the right panel, Media tab, focuses the tab button). Thumbnail/name from the media list. Inactive (`SOON_ID`) when not editable, like `TextPanel`.
- `src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts` (+ test) -- `getRenderAssets({ caseId, assetIds })`: actor, `authorize(edit)`, `material.listAssets`, keep requested media ids, `renderAssetsOf(…, material.getRendition)`.
- `src/app/_lib/action-result.ts` (+ test) -- `failure` passes `details.assetIds` (strings) for `ASSET_NOT_ALLOWED`.
- `use-document.ts` (+ test) -- expose `refused: readonly string[] | null` from the last `ASSET_NOT_ALLOWED`, cleared by a successful save.
- `src/shared/i18n/it.ts` -- `configurator.media` (pick/replace labels, no file, dropOffBlock, missing banner, remove action).
- Reuse: `resolveSelection`, `findElement`, `say`, `styles.ts` classes. The renderer already draws media; don't touch it.

## Tasks & Acceptance

**Execution:**
- [x] `page-editing.ts` + test -- `placeMedia`, `clearAssets`; every pure matrix row.
- [x] `action-result.ts`, `use-document.ts` (+ tests) -- refused asset ids reach the configurator.
- [x] `actions.ts` (+ test) -- `getRenderAssets`, forbidden and foreign-id cases.
- [x] `media-tab.tsx`, `right-panel.tsx` -- drag, pick, `onListed`, lifted tab.
- [x] `canvas.tsx` -- media drop target.
- [x] `left-panel.tsx` -- image/video section.
- [x] `configurator.tsx`, `it.ts` -- wiring, assets state, banner.
- [x] `configurator.test.tsx` -- drop on image / in block / off block, tile click per selection, Sostituisci opens Media, new upload's asset fetched, refused-save banner and its action, inert when not editable.

**Acceptance Criteria:**
- Given a selected image or video, when I look at the left panel, then it shows the file and **Sostituisci dai Media** (**Scegli dai Media** when empty), which shows the Media tab.
- Given any placement, when it is made, then ⌘Z undoes it, autosave saves it and the Media tab marks the file as on the page.

## Implementation Notes

- Implemented directly in the session (no subagent), as 4.5a.
- Media elements sit only at a block's top level (a row's items can't be media, per the schema), so `placeMedia` replaces only a top-level image or video and otherwise inserts before the top-level element holding the target.
- The left panel's section is `media-panel.tsx` (as `text-panel.tsx`); the tile's thumbnail and name are one button (named by the file name), the star stays its own button.
- `getRenderAssets` also returns files whose rendition was not ready at page load (e.g. a video still being processed), since the configurator asks for every listed file missing from `assets`.
- `listed` reads the current assets through a ref: the Media tab's polling effect keeps an older `onListed`.
- A `blockFull` message was added (`configurator.edit.blockFull`); `addElement` could already refuse with it silently.
- `ActionResult.error.assetIds` is passed only for `ASSET_NOT_ALLOWED`.
- No visual check in a browser: the configurator page needs Supabase.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm test` -- all pass, including the new tests
