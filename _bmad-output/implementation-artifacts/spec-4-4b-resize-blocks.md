---
title: 'Story 4.4b: resize blocks by dragging the border between them'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '36e60b5975f45b2265712ab6b0a80bccceb47bae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After 4.4a a page takes a layout's grid, but its rows and columns keep the layout's sizes: the border between two blocks can't be dragged (Story 4.4, C31).

**Approach:** Border handles drawn over each page's grid in the editor, placed from the page's layout areas and track sizes. A drag moves one track line live on the rendered grid, checks overflow and the 12% minimum as it goes, and on release saves the page's new `grid.rows` / `grid.cols` through 4.3a's `doc.change` (one undo step), in the format in view.

**Decisions (owner):**
- 2026-10-30: split from Story 4.4 (4.4a Layout, Mescola, Sfondo; 4.4b resize; 4.4c Pagine di default).

**Decisions (drafting, to confirm with the owner):**
- No handles when the case can't be edited, in Anteprima, or on a page whose grid isn't one of the format's layouts (the `column` fallback, which the renderer draws as even rows). There is no "arriva presto" for resize: there is nothing to press.
- No keyboard alternative for now (epic context: "no keyboard alternative to dragging … for now").

## Boundaries & Constraints

**Always:**
- A border is a line between two adjacent tracks (a column line or a row line) of the page's layout. It gets one handle per stretch where no block spans across it (mockup `placeHandles`), so a tall block that crosses a row line splits that line's handle in two, or removes it.
- The handle covers the gap between the blocks (at least 10 px wide to grab), with a `col-resize` or `row-resize` cursor. It shows a thin accent line on hover and while dragging.
- Dragging moves the line. The two tracks on either side give or take the space, and the other tracks stay as they are. The canvas follows the pointer live; the document changes only on release.
- A track can't go below 12% of the grid's size on that axis: the line stops there.
- A move that would make a text overflow a block that didn't overflow when the drag started is refused: the line stays at the last good position. While a move is refused, or held at 12%, the handle turns orange (`warning`).
- On release, if the line moved, the page's `grid.rows` or `grid.cols` is saved with the same total as before, each track rounded to 3 decimals, keeping `layoutId`. The whole drag is one undo step. A release without a move changes nothing.
- Pressing a handle doesn't change the selection. Only the format in view changes.
- With reduced motion set, the grid follows the pointer with no transition (4.4b adds none).
- Follow the house rules from `mac-recap-ui`, and check light and dark.

**Never:**
- No handles in Anteprima, thumbnails or the export, and none when not `editable`.
- No change to `src/modules/generation`, `src/modules/rendering`, `src/worker` or the database.
- No Pagine di default (4.4c), drag-and-drop of blocks or elements (4.3e), or page tools (4.13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Borders, two | Carosello `two` (1 row, 2 cols) | one column handle, full height | N/A |
| Borders, spanning | Carosello `three_a` (left two stacked, right tall) | one column handle; row handle on the left column only | N/A |
| Borders, four | Carosello `four` | one column handle, one row handle, each full length | N/A |
| Drag | column line of `two` dragged 100 px right on a 1000 px grid | `cols` ≈ `[1.2, 0.8]` (sum kept), saved on release | N/A |
| 12% | dragged far left | left track held at 12% of the grid | handle orange |
| Overflow | a move would overflow a text | line stays at the last good position | handle orange |
| No move | press and release | nothing saved, no undo step | N/A |
| Undo | after a drag, ⌘Z then ⇧⌘Z | sizes back, then again | N/A |
| Column fallback | Presentazione page with 2 blocks on `column` | no handles | N/A |
| Not editable / Anteprima | approved case, or Anteprima | no handles | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/rendering` -- read only: `layouts(formatId, template)` for a page's areas (`[rowStart, colStart, rowEnd, colEnd]`, 1-based lines); the renderer draws `.mr-bento` with `gridTemplate: minmax(0,{v}fr)…` from `page.grid.rows/cols` and the gap `var(--gut)` (`render/page.tsx`, `render/css.ts`); `measureOverflow`'s rule (scroll size > client size + 1).
- `configurator/grid-resize.ts` (new, + test) -- pure: `borders(areas, rows, cols)` → `{ axis: "col" | "row", index, span: [from, to] }[]` (`index` = the track before the line, `span` = cross tracks covered, inclusive); `trackPixels(sizes, length, gap)`; `resizeTracks(sizes, index, deltaPx, length, gap)` → `{ sizes, held }` (each track ≥ 12% of `length`, sum kept); `setTracks(pages, pageKey, axis, sizes)` → pages, the same array when unchanged; the renderer's track string, as `render/page.tsx` writes it.
- `configurator/resize-handles.tsx` (new) -- inside `CanvasPage`, editor and `editable` only, for a page whose `grid.layoutId` is one of `layouts()` with as many areas as blocks. Measures `.mr-bento` (rect, computed `column-gap`/`row-gap`) and places the handles. Pointer capture on `pointerdown` (stops propagation, so the page's click selects nothing); on move, writes `gridTemplate` on the bento directly, then checks the blocks that didn't overflow at the start; on `pointerup`/`pointercancel`, puts the original `gridTemplate` back and calls `onResize` if the line moved.
- `configurator/canvas.tsx` -- renders `ResizeHandles` per page with `editable`, `onResize(pageKey, axis, sizes)`; new `CanvasProps.onResize`.
- `configurator/configurator.tsx` -- `onResize`: `setTracks` on the format in view, then `doc.change` (one undo step), selection kept.
- Tests: `grid-resize.test.ts` (borders for every layout shape in the matrix, pixel ↔ fraction round trip, 12% hold, sum kept, rounding, `setTracks` no-op); `configurator.test.tsx` (handles shown per page and layout, none when not editable, in Anteprima, or on `column`; a drag with mocked geometry saves new sizes as one undo step; no move saves nothing; an overflow refusal turns the handle orange and saves the last good position).

## Tasks & Acceptance

**Execution:**
- [x] `grid-resize.ts` (+ tests) -- borders, track maths, `setTracks`.
- [x] `resize-handles.tsx`, `canvas.tsx`, `configurator.tsx` (+ `configurator.test.tsx`) -- handles, drag, commit.
- [x] `sprint-status.yaml` -- on the 4.4 line: 4.4b in review.

**Acceptance Criteria:**
- Given Story 4.4's resize criteria in `epics.md`, when checked on the running page in each format, then each is met: neighbours give or take space, the page keeps its sizes while its grid stays, a move that overflows a text or goes under 12% is refused with an orange border, and the drag is one undo step.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Owner (2026-10-29, 4.3): subagents only for the review step, so the implementation was done in the main session.
- The drag writes `gridTemplate` on the rendered `.mr-bento` directly (no React render per move) and puts the renderer's value back on release; the saved sizes then redraw it. On a page change mid-drag (⌘Z, Mescola, Anteprima, another format) the drag is dropped, and the style is put back only if the renderer hasn't already drawn over it.
- A cancel or lost pointer capture drops the drag; only the pointer that started it moves or ends it.
- Handles only when the layout's areas and track counts match the page's blocks and `grid.rows/cols`.
- The 12% minimum is of the grid's whole size on that axis, gaps included (as the mockup).
- Not done: the browser check against the local stack (the configurator needs Supabase). The tests mock the grid's geometry (1000 × 1000 px) and overflow in happy-dom; the real gap and fonts are only exercised in `grid-resize.test.ts`'s maths.
- Files: new `grid-resize.ts` (+ test) and `resize-handles.tsx`; `canvas.tsx`, `configurator.tsx`, `configurator.test.tsx`; `sprint-status.yaml`.

## Spec Change Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In Chromium, in each format: drag every border of a few layouts; push past 12% and into a text overflow (orange, held); release; ⌘Z/⇧⌘Z; reload keeps the sizes; Layout and Mescola reset them; light and dark.

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | A cancelled pointer saves the drag (blind, verify-gap other) | medium | `onPointerCancel` went through the save path | patch (cancel and lost capture drop it; test) |
| 2 | Handles unmounting or the page changing mid-drag leave the drag's style or commit from a stale base (blind, edge) | medium | No cleanup; ⌘Z mid-drag then release saved over the undo | patch (cleanup on page change; restores only its own style; test found and fixed the ordering) |
| 3 | A second pointer overwrites or ends the drag (edge) | low | No pointer id check; direct guard | patch (test) |
| 4 | `setTracks` accepts NaN, zero or negative sizes (blind, edge) | low | Only length and equality checked; one-line guard | patch (test) |
| 5 | Track counts not checked against the layout (edge) | low | Areas from the layout, counts from the page | patch (handles only when they match) |
| 6 | Bento resize without the host resizing not observed (blind, edge) | low | Observer on the host only | patch (also observes the bento) |
| 7 | Row drag, gaps, already-overflowing text untested (verify-gap, blind) | medium | All drags were `col-0-0`, gap 0, no overflow at start | patch (tests) |
| 8 | Intro border test circular (blind) | low | Recomputed the same expression | patch (explicit expected borders, checked by hand) |
| 9 | No keyboard, 10 px target, invisible until hover (blind) | low | Owner-approved spec: no keyboard alternative for now; desktop tool (≥1024 px) | reject |
| 10 | Frames don't follow the drag (blind) | false | `canvas.tsx` frames observe the block and element with `ResizeObserver`, which fires as the grid moves | reject |
| 11 | Already-overflowing blocks can get worse unwarned; reuse `measureOverflow` (blind) | false | Frozen intent: refuse only overflow of "a block that didn't overflow when the drag started"; same rule as `measureOverflow` | reject |
| 12 | No Escape to abort (blind) | low | Not in the intent; cancel by moving back | reject |
| 13 | Layout per move (blind) | low | One grid write and a few reads per event; fine at six blocks | reject |
| 14 | Sizes kept or reset by Mescola/Layout untested (blind) | false | Reset covered by 4.4a's `applyLayout` / `shuffleLayout` tests | reject |
| 15 | Overflow mock keyed on printed numbers (blind) | low | Test-only; `tracksCss` pinned by its own test | reject |
| 16 | 12% base includes gaps (blind) | false | Spec: "12% of the grid's size"; noted above | reject |
| 17 | `layoutId` changed but same track count on release (edge) | false | Covered by #2: a page change drops the drag before release | reject |
| 18 | Sprint status wording (blind) | low | 4.4c named as left on the 4.4 line | reject |
| 19 | Fewer blocks than cells renders a layout with no handles (verify-gap other) | low | Not reachable: 4.3c/4.4a keep blocks equal to cells or use `column` | reject |
