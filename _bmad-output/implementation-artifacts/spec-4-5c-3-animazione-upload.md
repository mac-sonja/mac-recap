---
title: 'Story 4.5c-3: upload in the Animazione dialog'
type: 'feature'
created: '2026-11-04'
status: 'in-review'
baseline_commit: '43ffb2c63274e89d081d68e459a3ad444a97241f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5c-animazione.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Animazione dialog only picks files already in the case's Media. To animate a new image or video, a person has to close the dialog, upload it in the Media tab, and open the dialog again.

**Approach:** Under the picker, the dialog gets the mockup's drop zone (`#anDrop`): **Trascina qui immagini e video**, "Finiscono nei Media di questa case. Oppure **scegli dai file**." Dropped or chosen files upload to the case's Media with exactly the Media tab's rules and messages, through one upload hook taken out of the Media tab, and each file that uploads is added to the animation's picks in the order dropped. The new files show in the Media tab too.

**Decision (owner, 2026-11-04):** when a drop would pass an animation's 30 media, the files are added up to 30 and the rest still upload to Media, with a line saying they weren't added.

## Boundaries & Constraints

**Always:**
- One upload path: the Media tab and the dialog use the same hook (validation per file before any server call: type via `normalizeContentType`, size via `rules.maxFileBytes`; presign → `uploadFile` → confirm; one retry; a late confirm counts when the relist finds the file; storage off; the 20-file case cap from the server). Media tab behaviour and its tests stay as they are.
- One list of case files: after an upload from either place, the Media tab, the dialog's picker and the render assets (`readMissing`) all have the new files. Thumbnail polling as in the Media tab.
- The hook returns the ids of the files that uploaded, in drop order; the dialog appends them to `picked` (no duplicates, up to `MAX_ANIMATION_MEDIA`).
- Messages through the existing status line (`useStatusMessage`), reusing the Media tab's and `wizard.material` strings; new copy in `it.ts` under `configurator.animationDialog`, house voice. The drop zone works by drag, click and keyboard (Enter/Space), and shows that it is uploading.
- **Annulla**/Esc after an upload: the files stay in Media; the animation is unchanged.
- Only while `editable` and not in Anteprima, as the rest of the dialog.

**Never:** Client-file uploads (owner, 4.5c-2); changes to the Material step's upload; renderer, schema or migration changes; a separate upload list in the dialog (the uploaded files appear in the picker, numbered).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drop two | A picked; drop `x.jpg`, `y.mp4` | both upload to Media; picks `[A, x, y]`; both in the Media tab | N/A |
| Choose from files | "scegli dai file", pick one | same as a drop | N/A |
| Wrong type | drop `notes.pdf` with `x.jpg` | only `x` uploads and is picked | the Media tab's type refusal line, no server call for the PDF |
| Too large | a 60 MB video | not uploaded, not picked | the size line, no server call |
| Case full | case has 20 files | nothing added | the limit line |
| One fails | one of two fails after retry | the other is picked | the failure line |
| Picks full | 29 picked, drop two | the first is picked; both stay in Media | a line that one wasn't added |
| Empty case | no media yet; drop one | the picker shows it, picked; **Inserisci** enabled | N/A |
| Cancel | upload, then Annulla | files in Media; animation unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/_components/configurator/media-tab.tsx` -- `upload`/`uploadOne`/`attempt`/`classify` (l.276–350), `relist`, the poll effect (l.237–255), the drop zone (l.431–478). Move the upload into the hook; `Attempt` `done` must keep the `assetId` (known after presign; `confirmAssetUpload` returns the `Asset`).
- `src/app/(wizard)/_components/configurator/use-media-upload.ts` (new) -- the hook: `upload(files) → Promise<string[]>` (ids in order), `uploading`, `storageOff`, messages via the caller's `say`.
- `src/app/(wizard)/_components/configurator/configurator.tsx` -- owns `files` (l.311) and `listed` (l.830–837, `readMissing`); `pickable = [...files, ...clientMedia]` (l.316); the dialog at l.1440–1450. Make it the one owner of the case list and polling, passed to the Media tab and the dialog.
- `src/app/(wizard)/_components/configurator/animation-dialog.tsx` -- `picked`, `toggle`, `MAX_ANIMATION_MEDIA` (`page-editing.ts` l.17); add the drop zone under the picker; reword `noMedia` (it points to the Media tab).
- `src/app/(wizard)/_lib/upload.ts` -- `uploadFile`, `normalizeContentType`, `acceptFor`; reuse as is.
- `src/app/(wizard)/case-studies/[caseId]/configurator/page.tsx` -- `MEDIA_RULES` (l.32–36) already reach Configurator as `mediaRules`.
- `src/shared/i18n/it.ts` -- `configurator.media.drop.*`, `configurator.media.errors.type`, `wizard.material.errors.*`, `configurator.animationDialog.*` (l.1228–1251).
- `src/app/(wizard)/_components/configurator/configurator.test.tsx` -- suites "Media tab (Story 4.5a)" (l.1925) and "Animazione (Story 4.5c)" (l.2635); the actions and `_lib/upload` mocks (l.44–49).

## Tasks & Acceptance

**Execution:**
- [x] `use-media-upload.ts` + `media-tab.tsx` -- extract the hook, keep the ids; the Media tab uses it with no visible change (its tests pass unchanged).
- [x] `configurator.tsx` -- one owner of the case list, relist and polling for both the tab and the dialog.
- [x] `animation-dialog.tsx` + `it.ts` -- drop zone, picks appended in order, the limit line, `noMedia` reworded.
- [x] `configurator.test.tsx` -- every matrix row through the dialog, and a dialog upload showing in the Media tab.

**Acceptance Criteria:**
- Given the dialog open on a case with images, when a person drops a video and presses **Inserisci**, then the animation holds the earlier picks followed by the video, and the video is in the Media tab.

## Implementation Notes

- `use-media-upload.ts`: `useCaseMedia` (the one list: relist, thumbnail polling, the favourite star) and `useMediaUpload` (validation, presign → PUT → confirm, one retry, late confirm, storage off; `upload(files, note?) → ids` in drop order; `note` lets the dialog add its limit line to the one message). Both are called once in `configurator.tsx`, which passes the list and the upload to the Media tab (via `RightPanel`) and to the dialog; `listed` (names + `readMissing`) is the list's `onListed`.
- `media-tab.tsx`: no state of its own any more; its drop zone is the exported `MediaDropZone`, reused by the dialog with its own copy.
- The status line moves inside the dialog while it is open (a modal makes the page inert), so it stays one `role="status"`.
- Tests: a new suite "Configurator Animazione upload (Story 4.5c-3)" covers every matrix row, keyboard/click, the uploading state, and a Media-tab upload reaching the picker.

## Spec Change Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green

**Manual checks:**
- On mac-recap-dev: drop an image and a video on the Animazione dialog; both appear picked in order, then in the Media tab; Inserisci shows them in the preview.
