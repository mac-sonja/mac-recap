---
title: 'Story 4.3e: drag-and-drop on the canvas'
type: 'feature'
created: '2026-11-04'
status: 'in-progress'
baseline_commit: '4663e1891762527112efe9a99dc95d88b04bed38'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the configurator, elements and blocks can only be added, removed, copied and pasted by click and keyboard (4.3c). The mockup and the epic also expect dragging: Elementi into a block, an element to another place, and a block onto another block to swap them. Today the "⠿ Sposta" grip on a selected block shows but does nothing.

**Approach:** Add drag-and-drop on the canvas in the format in view, using the same browser drag-and-drop as the Media tiles (4.5b) and the Pagine thumbnails (4.13). Each drop is one document edit: one undo step, saved by the existing autosave.

## Boundaries & Constraints

**Always:**
- Drags exist only in an editable case's editor, never in Anteprima or on an approved case.
- A text being typed in can't be dragged.
- A drop goes **before the top-level element under the pointer**, or at the block's end. As in the mockup, an element can't be dropped inside a Testi group or a row.
- Limits come from the document: at most `MAX_ELEMENTS_PER_BLOCK` elements and `MAX_BLOCKS_PER_PAGE` blocks. A refused drop changes nothing and says why at the top of the canvas.
- A refused or no-op drop writes no undo step.
- The edited document still passes `validateNewDocument`, with ids unique per format.

**Never:**
- A keyboard alternative (the epic: "no keyboard alternative to dragging for now").
- Dragging between formats.
- Dropping into Anteprima's slideshow.
- Changing an asset.
- Dragging pages on the canvas (the Pagine thumbnails already do this, 4.13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Elementi into a block | Drag the Testo button onto a block, over its 2nd element | A new text before that element. It's selected. | Block at the element limit → refused, the existing "full" message |
| Elementi off a block | Drop on the page outside any block | Nothing changes | "Trascina l’elemento dentro un blocco." |
| Blocco from Elementi | Drag Blocco onto a page | A block added to that page, as the Blocco button does | Page at 6 blocks → the existing "page full" message |
| Move an element | Drag an element to another block, on the same page or another page | Removed where it was, inserted at the drop place, selected | Target block full → refused |
| Element out of a group | Drag a text out of a Testi group or a row | It leaves the group. A group or row left empty is removed, and the group's `splitAt` stays within its items. | N/A |
| Same place | Drop an element where it already is | No change, no undo step | N/A |
| Swap blocks | Drag "⠿ Sposta" (or a block's only element) onto another block, on the same page or another page | The two blocks change places. Each takes the other's grid cell and keeps its own contents and background. | N/A |
| Block to another page's end | Drag "⠿ Sposta" onto another page outside its blocks | The block moves to the end of that page. Both pages' grids restart, as when a block is added or removed. | Target page at 6 blocks → refused |
| Not editable | Approved case, or Anteprima | Nothing can be dragged, and no drop targets show | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/generation/domain/document.ts` -- read only: `MAX_ELEMENTS_PER_BLOCK` (30), `MAX_BLOCKS_PER_PAGE` (6); a row's `items.min(1)`; a group's `splitAt` ≤ items; `validateNewDocument` for tests.
- `src/app/(wizard)/_components/configurator/page-editing.ts` -- extend the pure edits next to `addElement`, `addBlock`, `restartGrid` and `removeSelection`. Each returns `{ pages, selection }` or a refusal (`PageEdit`), and the same array on a no-op. `newElement(kind)` builds the element for an Elementi drop. Don't change the existing functions' behaviour.
- `src/app/(wizard)/_components/configurator/canvas.tsx` -- the Media drop handlers (`onDragOver`/`onDrop`, `dropTarget`, `dropFrame`, `MEDIA_DRAG_TYPE`) are the pattern to follow. Rendered elements carry `data-element-id`, blocks `data-block-id`. The "⠿ Sposta" grip is already drawn on the selected block (around line 467).
- `src/app/(wizard)/_components/configurator/right-panel.tsx` -- `PAGE_DRAG_TYPE` shows how a drag type stays separate from the others. Use new types for an element, a block and an Elementi button, so Media and Pagine drops ignore them.
- `src/app/(wizard)/_components/configurator/left-panel.tsx` -- the Elementi buttons (`onAddElement`, around line 518) become draggable as well as clickable.
- `src/app/(wizard)/_components/configurator/configurator.tsx` -- apply edits with `doc.change({...formats, [formatId]: next}, formatId)` then `setSelection`, and report refusals with `say(...)`, as 4.3c's callbacks do. The `editing` state tells whether a text is being typed in.
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.edit.dropOffBlock: "Trascina l’elemento dentro un blocco."`, plus a drop-hint label for the grip if needed. `canvas.move` and `emptyBlock` already exist.

## Tasks & Acceptance

**Execution:**
- [ ] `page-editing.ts` (+ `page-editing.test.ts`) -- pure edits:
  - `insertNewElement(pages, target, kind, newId)`;
  - `moveElement(pages, from, target)`, which leaves a group or row cleanly and is a no-op in place;
  - `swapBlocks(pages, a, b)`, across pages too, keeping each page's grid;
  - `moveBlockToPage(pages, from, toPageKey, formatId, template)`, with `restartGrid` on both pages.

  A `target` is `{ pageKey, blockId, beforeElementId? }`. Test each matrix row, check ids stay unique and the result passes `validateNewDocument`, and check the limits.
- [ ] `canvas.tsx` -- in the editor of an editable case:
  - top-level elements are draggable, except the text being typed in;
  - the grip drags its block, and so does a block's only element;
  - blocks and pages take drops, with a drop frame on the block and a line before the element under the pointer;
  - nothing in Anteprima.
- [ ] `left-panel.tsx` -- the Elementi buttons are draggable, carrying their element kind. Blocco is dropped on a page.
- [ ] `configurator.tsx` -- callbacks run the edits, one undo step each, select the result and `say` refusals. Clear the drag state on drag end.
- [ ] `src/shared/i18n/it.ts` + `it.test.ts` -- the new copy.
- [ ] `configurator.test.tsx` -- drag events for each matrix row (fire `dragStart`/`dragOver`/`drop` with the drag types): undo restores the document, nothing can be dragged in Anteprima or on an approved case, and a refused drop leaves no undo step.

**Acceptance Criteria:**
- Given an editable case, when the person drags an element to another page and presses ⌘Z, then both pages are as before and the next autosave sends that document.
- Given a Media tile or a Pagine thumbnail dragged over the canvas, when it's dropped, then 4.5b's and 4.13's behaviour is unchanged.

## Design Notes

Drop index when moving inside the same block: remove first, then insert at the target's index. A target after the source shifts by one, as in the mockup: `if (sameList && i < pos) pos--`. The drop places are only a block's top-level elements. A drag from inside a group or a row becomes a top-level element of the target block.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` (Node 24) -- expected: all green

**Manual checks:**
- In a browser, on a case Da approvare: drag Testo into a block, an image to another page, swap two blocks with ⠿ Sposta, move a block to another page's end, then undo each step.
