---
title: 'Story 4.5b-3: Adattamento, Ritaglia drag and Zoom'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '41dca53a99416a965c0633d2da6be4431ab51e47'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A placed image or video always shows with the fit it was given (`fill` for a new one): the person can't switch it to Adatta, or choose which part shows. The document and the renderer already support `fit` and `crop` (x, y, zoom), but no control sets them.

**Approach:** Under the selected image's or video's file in the left panel (4.5b's `MediaPanel`), **Adattamento** offers Riempi, Adatta and Ritaglia (mockup `#fit`). With Ritaglia, the person drags the image inside its block on the canvas to choose the visible part, and sets the zoom with a **Zoom** slider (owner, 2026-10-28, SCP answer 8). Split from Story 4.5b at the owner's choice (2026-10-30).

## Boundaries & Constraints

**Always:** Mockup `configurator.html` (`renderBlockProps` image branch, `#fit`, `.seg`) and `mac-recap-ui` tokens and voice; copy in `it.ts`. Each fit press is one undo step; a whole crop drag and a whole slider drag are one undo step each (grouped `doc.change` key, flushed at release), saved through `useDocument`, in the format in view only. Leaving Ritaglia removes `crop`; entering it keeps none until a drag or zoom sets one (the renderer centres it). Crop values stay in the schema's range (x, y 0–1; zoom 1–4). Controls only while `editable` and not in Anteprima; otherwise they show inactive with the "Arriva presto" hint, as the text panel.

**Never:** No recolour, filter, rotation or free-transform controls. No fit or crop for Animazione (4.5c). No change to the renderer. No migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fit | Riempi / Adatta / Ritaglia pressed on a selected image or video | `fit` set, button `aria-pressed`; the canvas redraws | same fit again: nothing changes, no undo step |
| Leave crop | Riempi or Adatta pressed while `fit: crop` with a `crop` | `crop` removed with the fit change (one step) | N/A |
| Drag | pointer down on the selected cropped element, moved by (dx, dy), released | `crop.x = clamp(x0 − dx / width)`, same for y (start: `crop` or centre, zoom 1); live while moving; one undo step | pointer released without moving: nothing changes |
| Zoom | slider moved (100–400 %, step 5) | `crop.zoom` = value / 100, x/y kept (centre when none); live; one undo step per drag | N/A |
| Not editable | approved case, trial pages, or Anteprima | fit buttons and slider inactive; no drag | pressing says "Arriva presto" |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/_components/configurator/page-editing.ts` -- add pure `withFit(pages, pageKey, elementId, fit)` and `withCrop(pages, pageKey, elementId, crop)` (media elements are top-level only; `pages` itself when nothing changes; `withFit` drops `crop` unless `fit` is `crop`; `withCrop` clamps to the schema range). Reuse `withPage`.
- `media-panel.tsx` -- after the file row: **Adattamento** eyebrow and a full-width `SEG` of three `SEG_BUTTON`s (`aria-pressed`); with Ritaglia, a **Zoom** row: `<input type="range" min=100 max=400 step=5>` labelled, value shown as "{n} %", and the hint "Trascina l’immagine nel blocco per scegliere cosa si vede." Props `onFit(fit)`, `onZoom(zoom, done)`. Inactive props as `lockedProps` in `text-panel.tsx`.
- `left-panel.tsx` -- pass `onFit`, `onZoom` through to `MediaPanel`.
- `canvas.tsx` `CanvasPage` -- when the selected element is an image/video with `fit: crop`, editable and not preview: an interactive overlay over `frames.element` (`data-frame="crop"`, `cursor-grab`, `active:cursor-grabbing`, `touch-action: none`) taking pointer down/move/up with pointer capture; reports `onCrop(pageKey, elementId, crop, done)`; its click and double-click stop propagation (the host would select the page). The element's current crop comes from `page`.
- `configurator.tsx` -- `fit`, `crop`, `zoom` handlers: `doc.change` with a key per gesture (`crop-${n}`, `zoom-${n}`), `doc.flush()` on `done`; pass to panel and canvas.
- `src/shared/i18n/it.ts` (+ `it.test.ts` if it lists them) -- `configurator.tools.fit`: heading, fill, fit, crop, zoom, zoomValue, cropHint.
- Renderer: `render/elements.tsx:16` `cropStyle` — object-position at x/y, scale(zoom) from the same origin; untouched.

## Tasks & Acceptance

**Execution:**
- [x] `page-editing.ts` + test -- `withFit`, `withCrop`; the pure matrix rows.
- [x] `media-panel.tsx`, `left-panel.tsx`, `it.ts` -- Adattamento and Zoom.
- [x] `canvas.tsx` -- crop drag overlay.
- [x] `configurator.tsx` -- handlers and wiring.
- [x] `configurator.test.tsx` -- fit buttons (saved, one undo step, crop dropped), Zoom slider (saved, one step for several changes), crop drag via pointer events (saved x/y, one step, no change without movement), inactive when not editable, no drag overlay when fit isn't crop.

**Acceptance Criteria:**
- Given a selected image or video, when I look at the left panel, then **Adattamento** shows Riempi, Adatta and Ritaglia with its fit pressed.
- Given Ritaglia, when I drag the image or move Zoom, then the canvas shows the change at once and one ⌘Z undoes the whole gesture.

## Implementation Notes

- Implemented directly in the session (no subagent), as 4.5a and 4.5b.
- `withFit`/`withCrop` share a private `withMedia` that edits a top-level image or video; `withCrop` does nothing unless the fit is Ritaglia.
- One gesture is one undo step: the configurator keys `doc.change` by `media-{n}-{elementId}` and bumps `n` (and flushes) when a drag is let go after moving, or when the Zoom slider is let go (pointer up, key up or blur).
- The crop overlay sits under the element frame (`data-frame="crop"`), stops click and double-click so the page doesn't take the selection, and uses pointer capture and `touch-action: none`.
- Zoom uses the `accent` token for the native range (`accent-accent`).
- After review: arrow keys on the focused Ritaglia frame (`role="slider"`), a 3 px dead zone, `pointerId` tracking, `lostpointercapture`, and drops on the frame replace the selected file.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route / evidence |
|---|---------|---------|------------------|
| 1 | "Same fit again" assertion checked before the debounced save could run | low | patch: `settle()` before the check |
| 2 | A drag cut off (frame unmounted, pointer capture lost) never closes its undo step, so the next gesture merges into it | medium | patch: `lostpointercapture` ends it; the frame going away ends it (layout-effect cleanup keyed by the cropped element) |
| 3 | No dead zone: a 1 px wobble on a click saves a crop | low | patch: 3 px before a drag starts; test added |
| 4 | Drag maps by element size, not the renderer's overflow; comment said "the image follows the pointer" | low | rejected: the mapping is the frozen matrix's (`x0 − dx / width`); comment corrected to "focal point … opposite the pointer" |
| 5 | No keyboard way to choose the visible part (WCAG 2.1.1) | medium | patch: the Ritaglia frame is a focusable slider; arrow keys move the focal point 5 % per press, one undo step each; test added |
| 6 | Locked Zoom slider still moves and repeats "Arriva presto" | low | patch: `disabled` with the soon hint described; test asserts it |
| 7 | `lockedProps` not reused | low | rejected: three-line object; moving it adds a shared export for one caller |
| 8 | Code Map names `onZoom(zoom, done)`, `crop-`/`zoom-` keys | low | rejected: fix edits this spec (Implementation Notes record the change) |
| 9 | Untested: video, two gestures as two undo steps, Zoom ended by key | medium | patch: tests added (configurator and `page-editing`) |
| 10 | Untested: Anteprima has no crop frame | low | rejected: one guard (`!preview`) shared with the drop target, already covered |
| 11 | Zoom's end handlers fire without a change | low | rejected: a flush with nothing new is a no-op; each arrow press as its own step is intended |
| 12 | A second pointer mixes into the drag | low | patch: the drag keeps its `pointerId` |
| 13 | A 0-sized element makes the crop NaN | low | patch: no move when the box has no size |
| 14 | A Media tile dropped on a selected Ritaglia image hits the frame and says "outside a block" | medium | patch: the frame stands for the selected element on drop; test added |
| 15 | Zoom released outside the slider keeps the gesture open | low | rejected: blur ends it; the next slide on the same element at worst merges |
| 16 | ⌘Z during a drag | low | rejected: rare; the drag keeps working from its start |

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm test` -- all pass, including the new tests
