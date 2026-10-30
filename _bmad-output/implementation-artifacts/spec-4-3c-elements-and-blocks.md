---
title: 'Story 4.3c: add and remove elements and blocks, and copy, cut and paste blocks'
type: 'feature'
created: '2026-10-30'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After 4.3a/b a page's texts can be typed and styled, but its arrangement is fixed: the Elementi list is inactive, and elements and blocks can't be added, copied or removed (Story 4.3, C30).

**Approach:** Pure page edits in a new `page-editing.ts`, applied to the format in view through 4.3a's `doc.change` (one undo step each, autosaved). They are wired to clicks on Elementi, to ⌘C/⌘X/⌘V and Backspace/Delete, and to **Rimuovi elemento** / **Rimuovi blocco**.

**Decisions (owner):**
- 2026-10-29: split from Story 4.3. Subagents only for the review step (and compiling the epic context).
- 2026-10-30: drag-and-drop (Elementi dragged in, moving elements, Sposta swap, block onto another page) is Story 4.3e, in deferred-work.
- 2026-10-30: a block count with no grid in the format stacks the blocks in one even column (the renderer's fallback); no template change.
- 2026-10-30: Animazione stays "arriva presto" until its dialog (4.5).

## Boundaries & Constraints

**Always:**
- **Elementi** click, with a block or an element selected, appends to that block (mockup `addElement`). New texts are `provenance: "human_added"`: Titolo `title` "Nuovo titolo", Testo `text` "Scrivi qui il testo.", Numero `num` "+00%", Citazione `quote` "«La citazione del cliente.»", Etichetta `lab` "Etichetta". Testi is a group, `split` with `splitAt: 1`, holding Etichetta, Titolo ("Titolo") and Testo. Immagine and Video are empty (`assetId: null`, `fit: "fill"`). Ids are fresh uuids. The new element is selected. With no block selected it says "Seleziona un blocco, oppure trascina l’elemento dentro un blocco.". A block at 30 elements adds nothing.
- **Blocco** adds an empty block ("Blocco", background `#EDEDF0`) after the selected block, else at the end of the page the tools act on, and selects it. A 7th block says "Questa pagina ha già 6 blocchi.".
- When a page's block count changes, its grid restarts from the format's first layout with that many areas (`layouts(formatId, template)`). If there is none, it is `{ layoutId: "column", rows: [1 × n], cols: [1] }`, an id no template uses, so the renderer stacks the blocks. At 0 blocks the grid is unchanged.
- With a block itself selected, ⌘C copies it ("Blocco copiato.") and ⌘X cuts it ("Blocco tagliato."). ⌘V pastes after the selected block, else at the end of the selected page, within the 6-block limit, with fresh ids. The pasted block is selected. The clipboard lasts for the session and works across pages and formats.
- Backspace/Delete, or **Rimuovi elemento** / **Rimuovi blocco** under the selection's name, removes the selection: "Elemento eliminato. ⌘Z per annullare." / "Blocco eliminato. ⌘Z per annullare.". Its block, or its page, is then selected. An item of a Testi group or row is removed from it. A group or row left empty is removed too, and a split group's `splitAt` is clamped to its items. Services, logos and the divider can be removed.
- An empty block shows "Trascina qui un elemento" in the editor only (not in Anteprima, thumbnails or export).
- Only the format in view changes. Keys are ignored while typing in a field or text, and in Anteprima. When not `editable`, Elementi and the remove buttons say "arriva presto" (as in 4.3b), and the keys do nothing.
- Strings go in `it.ts`, pinned in `it.test.ts`. Follow the house rules from `mac-recap-ui`, and check light and dark.

**Never:**
- No drag-and-drop (4.3e), no adding services, logos or the divider, and no Layout, Mescola, Sfondo, Media or page tools (4.4, 4.5, 4.13).
- No change to `src/modules/generation`, `src/modules/rendering`, `src/worker` or the database.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Click Titolo | element of block B selected | title appended to B, selected, one undo step | N/A |
| No block | page only selected, click Testo | nothing | "Seleziona un blocco…" |
| Blocco | Carosello page with 2 blocks, 1st selected | new block at index 1, grid `three_a` | N/A |
| No grid | Presentazione 2 → 3 blocks | grid `column`, rows `[1,1,1]` | N/A |
| Full | 6 blocks, Blocco or ⌘V | nothing | "…già 6 blocchi." |
| Copy/paste | ⌘C on A, select B, ⌘V | copy after B, new ids, selected | message on copy |
| Cut | ⌘X on block | removed, layout restarts, page selected | "Blocco tagliato." |
| Last row item | Backspace on a row's only text | text and row gone, block selected | message |
| Group split | split 2, remove one of 2 texts | `splitAt: 1` | N/A |
| Not editable | approved case, click Titolo | nothing | "Elementi arriva presto." |

</frozen-after-approval>

## Code Map

- `src/modules/generation/domain/document.ts` -- read only: element schemas, `MAX_BLOCKS_PER_PAGE`, `MAX_ELEMENTS_PER_BLOCK`, a row's `items.min(1)`, a group's `splitAt` ≤ items, ids unique per format; `validateNewDocument` for tests.
- `src/modules/rendering` -- read only: `layouts(formatId, template)` (block count = `areas.length`); `templates/mac-case/v1/render/page.tsx` stacks blocks when the layout is unknown.
- `configurator/page-editing.ts` (new, + test) -- pure edits with an injectable `newId`, each returning `{ pages, selection }` or a refusal (`noBlock`, `full`), and the same array on a no-op: `addElement(kind)`, `addBlock`, `removeSelection`, `pasteBlock`, `restartGrid`, `withFreshIds`. Reuse `findElement`/`resolveSelection` from `selection.ts`; keep the factory of new elements here.
- `configurator/configurator.tsx` -- clipboard ref; callbacks `doc.change({...formats, [formatId]: next}, formatId)` then `setSelection`, `say` for messages; key handler adds Backspace/Delete and ⌘C/X/V beside ⌘Z (same `typing`/Anteprima guards).
- `configurator/left-panel.tsx` -- Elementi buttons active when editable (Animazione stays inactive), `onAddElement`; **Rimuovi elemento** / **Rimuovi blocco** (`SECONDARY_ACTION`, as Elimina pagina) under the name section, `onRemove`; drop "Arriva presto" from the Elementi heading.
- `configurator/canvas.tsx` -- empty-block hint: measure `[data-block-id]` blocks with no elements (as the overflow boxes) and overlay the hint, editor only.
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.edit.*` messages, new texts, remove buttons, empty hint.
- Tests: `page-editing.test.ts` (each matrix row; ids unique; the result passes `validateNewDocument`), `configurator.test.tsx` (clicks, keys, buttons, messages, undo, not editable).

## Tasks & Acceptance

**Execution:**
- [ ] `it.ts` / `it.test.ts` -- strings.
- [ ] `page-editing.ts` (+ tests) -- edits, grid restart, fresh ids.
- [ ] `left-panel.tsx`, `configurator.tsx`, `canvas.tsx` (+ `configurator.test.tsx`) -- wiring, keys, clipboard, hint.
- [ ] `sprint-status.yaml` -- on the 4.3 line: 4.3b done, 4.3c in review, 4.3e drag-and-drop in deferred-work.

**Acceptance Criteria:**
- Given Story 4.3's criteria for Elementi (click), Blocco (click), ⌘C/⌘X/⌘V and removing in `epics.md`, when checked on the running page in each format, then each is met, the canvas redraws at once, and ⌘Z/⇧⌘Z undo and redo each one.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In Chromium: each Elementi item, Blocco, ⌘C/X/V across pages, Backspace and Rimuovi; ⌘Z/⇧⌘Z; reload keeps the result; light and dark.
