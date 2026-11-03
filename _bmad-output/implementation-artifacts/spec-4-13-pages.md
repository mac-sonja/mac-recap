---
title: 'Story 4.13: Pages — add, delete, reorder'
type: 'feature'
created: '2026-11-03'
status: 'done'
baseline_commit: '8898bd7cf50695c734547f283213761cf559754f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A format's pages are fixed: **Elimina pagina** is an inactive "Arriva presto", there is no way to add a page, and the Pagine thumbnails can't be reordered. Grouping under Intro, Output and Risultati and the live thumbnails already exist (4.2a).

**Approach:** As the mockup (`addPage`, `deletePage`, `pg-del`, right panel drag): **+ Aggiungi pagina** at the end of the canvas adds "Nuova pagina" (white, one empty block) after the selected page in its section; the bin on a page's label and **Elimina pagina** delete it with "Pagina eliminata. ⌘Z per annullare."; dragging a Pagine thumbnail onto another moves the page. Format in view only, each change one undo step through the autosave.

**Decisions:** with nothing selected, a new page goes at the end of the Output section (after the last Output page, else after the last Intro page), so the section groups stay contiguous; a page can be dragged anywhere in its format's list and keeps its section, as in the mockup (owner, 2026-11-03: the canvas may then show a section label twice), dropping before a page above it or after a page below it; at 50 pages (`MAX_PAGES_PER_FORMAT`) Aggiungi pagina says the format is full; the last page can be deleted too (the canvas then shows only **+ Aggiungi pagina**). The C38 confirmation ("Eliminare la pagina?" for a page shared with the client's file) waits for 4.12, which builds the client's file: until then no page is shared.

## Boundaries & Constraints

**Always:** Mockup `configurator.html` and `mac-recap-ui`; copy in `it.ts`; new page key `p-{uuid}` (schema page-key rule), role `body`; deleting the selected page clears the selection; the new page is selected and scrolled into view (smooth unless reduced motion); controls only while `editable` and not in Anteprima (Anteprima hides the bin and Aggiungi pagina). Drags use their own data type so the Media drop and the canvas ignore them.

**Never:** No cross-format moves; no keyboard or menu alternative to dragging pages (owner, 2026-10-28); no client-file pages; no renderer or schema change; no migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | page in Intro selected | "Nuova pagina" after it, section Intro, white, one empty block, selected | 50 pages: message, nothing |
| Add, none selected | Intro, Output, Risultati pages | new Output page after the last Output page | no Output page: after the last Intro page, else at the start |
| Delete | bin on page 3, or Elimina pagina with it as the tools' page | page gone, message, ⌘Z brings it back at its place | N/A |
| Reorder | thumbnail dragged onto another thumbnail, any section | moved before it (dragged up) or after it (dragged down), its section kept | onto itself: nothing |

</frozen-after-approval>

## Code Map

- `page-editing.ts` -- pure `addPage(pages, after: pageKey | undefined, newId, formatId, template)` → `PageEdit` (`pageFull` reason reused/extended for 50 pages, here reason `formatFull`), `deletePage(pages, pageKey)` → pages, `movePage(pages, from: pageKey, to: pageKey)` → pages (section kept; pages itself when from = to). Reuse `emptyBlock`, `restartGrid`, `MAX_PAGES_PER_FORMAT` mirrored as `MAX_PAGES_PER_FORMAT` with a schema test like `MAX_ANIMATION_MEDIA`.
- `canvas.tsx` -- page label gets a bin button (`aria-label` "Elimina la pagina {n}", editable and not preview), `onDeletePage`; after the last page a **+ Aggiungi pagina** button (`onAddPage`), also when there are no pages.
- `right-panel.tsx` -- thumbnails `draggable` when `onMovePage` is given, own drag type `application/x-mac-page`, drop marker (accent line) on targets, `onMovePage(from, to)`.
- `left-panel.tsx` -- **Elimina pagina** active when editable: `onDeletePage()` for the tools' page.
- `configurator.tsx` -- handlers: add (selection's page or none; select and scroll the new page after render), delete (message; selection cleared when it was on that page), move; all `doc.change` / `applyPageEdit`.
- `it.ts` -- `configurator.pages`: addPage "+ Aggiungi pagina", newPage "Nuova pagina", deleted "Pagina eliminata. ⌘Z per annullare.", deleteLabel "Elimina la pagina {n}", formatFull "Questo formato ha già 50 pagine.".

## Tasks & Acceptance

**Execution:**
- [x] `page-editing.ts` + test -- `addPage`, `deletePage`, `movePage`; the matrix.
- [x] `canvas.tsx`, `right-panel.tsx`, `left-panel.tsx`, `it.ts` -- controls.
- [x] `configurator.tsx` -- wiring.
- [x] `configurator.test.tsx` -- add (selected / none / full), delete by bin and by Elimina pagina with ⌘Z, reorder within and across sections (section kept), controls absent in Anteprima and inactive when not editable; update the test that expects Elimina pagina "arriva presto".

**Acceptance Criteria:**
- Given any page change, when it's made, then it applies to the format in view only, is one undo step and saves through the autosave.

## Implementation Notes

- Implemented directly in the session. `addPage`/`deletePage`/`movePage` in `page-editing.ts` (`MAX_PAGES_PER_FORMAT` mirrored there; reason `formatFull`); bin and **+ Aggiungi pagina** in `canvas.tsx`; thumbnail drag in `right-panel.tsx` (type `application/x-mac-page`, `data-drop` before/after marker); **Elimina pagina** active in `left-panel.tsx`; handlers in `configurator.tsx` (the new page is scrolled into view after render).
- Cross-section moves keep the page's section (owner, 2026-11-03), so the canvas may show a section label twice.
- After review: Pagine shows runs of one section in list order (as the canvas), so a moved page shows where it now is; a new page with nothing selected goes after the last Output page first; focus follows a deleted page's bin.
- The 4.2a test that expected Elimina pagina to say "arriva presto" now uses a non-editable case.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Route / evidence |
|---|---------|---------|------------------|
| 1 | Pagine still grouped by section: a page moved across sections jumps back under its label; the drop marker's side follows list order, not what's shown | medium | patch: Pagine shows the pages in list order in runs of one section, as the canvas (follows the owner's cross-section choice); test added |
| 2 | Add with nothing selected used the later of last Output / last Intro, not Output first | medium | patch: after the last Output page, else the last Intro page; tests added (no Output, Intro moved below) |
| 3 | `MAX_PAGES_PER_FORMAT` mirror not held to the schema | low | patch: `formatPagesSchema` test at the limit and one over |
| 4 | "Questo formato ha già 50 pagine." hardcodes 50 | low | patch: `{n}` from the constant |
| 5 | Focus lost when the bin deletes its own page | medium | patch: focus moves to the next page's bin, else the previous one's, else Aggiungi pagina |
| 6 | Tests missing: add with none / full, Elimina pagina message and ⌘Z, drag up, bin in Anteprima, scroll into view | medium | patch: tests added |
| 7 | Code Map's `addPage` argument order differs | low | rejected: fix edits this spec |
| 8 | Elimina pagina active with no pages | false | the page tools render only when there is a page |
| 9 | Elimina pagina acts on the page in view with nothing selected | low | rejected: the panel's page heading above names the page the tools act on (4.4a's rule) |
| 10 | Drag dead zones (empty section, past the last thumbnail, search hiding targets) | low | rejected: every position is reachable by dropping before or after a thumbnail |
| 11 | Editing or the Animazione dialog still pointing at a deleted page | low | rejected: the bin click ends a text session (blur), and the modal dialog blocks the canvas |
| 12 | Drag state stuck if the source thumbnail unmounts | low | rejected: the next drag start resets it; the marker needs a hover to show |

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm test` -- all pass, including the new tests
