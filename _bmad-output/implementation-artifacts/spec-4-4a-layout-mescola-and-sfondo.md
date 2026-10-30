---
title: 'Story 4.4a: pick a layout, Mescola, and set a page or block background colour'
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

**Problem:** After 4.3c a page's blocks can be added and removed, but its grid only follows the block count: **Layout**, **Mescola** and **Sfondo** show in the left panel, inactive (Story 4.4, C29–C31).

**Approach:** Pure page edits added to `page-editing.ts` (`applyLayout`, `shuffleLayout`, `setBackground`), applied to the format in view through 4.3a's `doc.change` (one undo step each, autosaved), wired to clicks on the Layout thumbnails, **Mescola** and the Sfondo swatches and colour field.

**Decisions (owner):**
- 2026-10-30: Story 4.4 split in three. 4.4a: Layout pick, Mescola, Sfondo. 4.4b: border resize. 4.4c: Pagine di default. 4.4b and 4.4c are in deferred-work.
- 2026-10-30: Pagine di default (4.4c) fills a restored page with the case's generated texts (`generated_doc`), not texts rebuilt from the form.

**Decisions (drafting, to confirm with the owner):**
- Sfondo **Immagine** waits for Story 4.5. `saveRevisionDoc` refuses an asset the revision doesn't already use (`ASSET_NOT_ALLOWED`) until 4.5 brings the media guardrail, and the configurator doesn't load the client's media yet. In 4.4a the Immagine tab stays inactive ("arriva presto").
- Dragging a Layout thumbnail onto a page goes with the drag-and-drop of 4.3e. 4.4a is click only.

## Boundaries & Constraints

**Always:**
- **Layout** lists `layouts(formatId, template)` as thumbnails (as today), with the page's current `grid.layoutId` pressed. With the `column` fallback grid (4.3c), none is pressed. The tools act on the selected page, or the page in view (as Elementi).
- Clicking a thumbnail gives the page that layout, in this format only: `grid` becomes `{ layoutId, rows: [...layout.rows], cols: [...layout.cols] }` (its own track sizes reset). With `m` cells and `n` blocks:
  - `m > n` appends `m − n` empty blocks ("Blocco", background `#ededf0`, fresh uuids), as 4.3c's **Blocco**.
  - `m < n` removes empty blocks, last first, until `n = m`. A block is empty when it has no elements and no image background.
  - When fewer than `n − m` blocks are empty, nothing changes and the message is "La pagina ha {k} blocchi in più di questo layout: toglili prima." (`k` = blocks over), or "La pagina ha 1 blocco in più di questo layout: toglilo prima." for one.
  - The page is then selected. Clicking the pressed layout on a grid that already has its track sizes is a no-op (no undo step).
- **Mescola** shows under the thumbnails only when the format has two or more layouts with the page's block count. It moves the page to the next of those layouts in `layouts()` order, back to the first after the last. From a grid that isn't among them (`column`, or an id the format lacks), it goes to the first. Track sizes reset, the blocks and their order stay, and the selection doesn't change.
- **Sfondo** reads "Sfondo · blocco" with a block or one of its elements selected, otherwise "Sfondo · pagina", and edits that background.
  - **Tinta unita** shows six swatches (white `#ffffff`, `#ededf0`, `#012234`, `#defe56`, `#2977ff`, Trasparente) with the current one pressed, and the colour field.
  - A swatch sets `{ kind: "colour", value }`, or `{ kind: "transparent" }` for Trasparente. It replaces an image background too.
  - The field takes a typed `#rrggbb` (with or without `#`, any case) on Enter or blur. Anything else puts the current value back and says "Scrivi un colore come #2977FF.".
  - Setting the colour a background already has is a no-op.
- A page starts white and a block `#ededf0` (the template and 4.3c defaults; nothing to migrate).
- Only the format in view changes. When not `editable`, Layout, Mescola and Sfondo say "arriva presto" (as in 4.3c), and nothing changes.
- With reduced motion set, a layout change switches without a transition. 4.4a adds no animated transition.
- Strings go in `it.ts`, pinned in `it.test.ts`. Follow the house rules from `mac-recap-ui`, and check light and dark.

**Never:**
- No border resize (4.4b), no Pagine di default (4.4c), no Sfondo Immagine picker (4.5), no dragging thumbnails (4.3e), no Media or page tools (4.5, 4.13).
- No change to `src/modules/generation`, `src/modules/rendering`, `src/modules/case-study`, `src/worker` or the database.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| More cells | Carosello, 2 blocks, click `four` | 2 empty blocks appended, grid `four`, page selected | N/A |
| Fewer cells, empties | 4 blocks (last 2 empty), click `two` | the 2 empty blocks removed, grid `two` | N/A |
| Fewer cells, filled | 4 filled blocks, click `two` | nothing | "…2 blocchi in più… toglili prima." |
| One over | 3 filled + 0 empty, click `two` | nothing | "…1 blocco in più… toglilo prima." |
| Image block | empty elements, image background | counts as filled | as above |
| Same layout | pressed layout, sizes unchanged | nothing, no undo step | N/A |
| Mescola | Carosello, 3 blocks on `three_a` | `three_b`; again → `three_a` | N/A |
| Mescola hidden | Video, 3 blocks (only `results`) | no Mescola button | N/A |
| Mescola, Presentazione | 5 blocks on `intro` | `only_layout`; again → `intro` | N/A |
| Mescola, two blocks | Carosello, 2 blocks on `two` | `stack` | N/A |
| Block colour | element of block B selected, click `#2977ff` | B's background `#2977ff` | N/A |
| Page transparent | page selected, click Trasparente | page `{ kind: "transparent" }` | N/A |
| Typed colour | type `defe56`, Enter | `#defe56` | N/A |
| Bad colour | type `blu`, blur | unchanged, field reset | "Scrivi un colore come #2977FF." |
| Not editable | approved case, click a layout | nothing | "Layout arriva presto." |

</frozen-after-approval>

## Code Map

- `src/modules/rendering` -- read only: `layouts(formatId, template)` (cells = `areas.length`, order = Mescola's order).
- `configurator/page-editing.ts` (+ test) -- `applyLayout(pages, pageKey, layout, newId)` → `PageEdit` or refusal `over` with `k`; `shuffleLayout(pages, pageKey, formatId, template)`; `nextLayout` / `shuffleChoices` (what Mescola cycles through, also for hiding it); `setBackground(pages, target, background)` with `target` a page key or a block id. Reuse `withPage`, `NEW_BLOCK_COLOUR` and the empty-block factory from 4.3c. The same array is returned on a no-op.
- `configurator/configurator.tsx` -- callbacks `onLayout`, `onShuffle`, `onBackground`: `doc.change({...formats, [formatId]: next}, formatId)`, then `setSelection` and `say` as in 4.3c.
- `configurator/left-panel.tsx` -- Layout thumbnails active when editable (`onLayout`), **Mescola** (`SECONDARY_ACTION`, full width) under them, Sfondo swatches and an editable colour field (`onBackground`), the Immagine tab inactive; `SoonHeading` → plain eyebrow for Layout and Sfondo when editable (Pagine di default keeps "Arriva presto").
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.tools.shuffle`, swatch names ("Bianco", "Grigio", "Blu notte", "Lime", "Blu", "Trasparente"), `edit.layoutOver` / `layoutOverOne`, `edit.badColour`.
- Tests: `page-editing.test.ts` (each matrix row; the result passes `validateNewDocument`; ids unique), `configurator.test.tsx` (clicks, Mescola shown and hidden, swatches, typed colour, messages, undo/redo, not editable).

## Tasks & Acceptance

**Execution:**
- [ ] `it.ts` / `it.test.ts` -- strings.
- [ ] `page-editing.ts` (+ tests) -- layout, Mescola, background edits.
- [ ] `left-panel.tsx`, `configurator.tsx` (+ `configurator.test.tsx`) -- wiring.
- [ ] `sprint-status.yaml` -- on the 4.4 line: 4.4a in review, 4.4b and 4.4c in deferred-work.

**Acceptance Criteria:**
- Given Story 4.4's criteria for Layout (click), Mescola and Sfondo · Tinta unita in `epics.md`, when checked on the running page in each format, then each is met, the canvas redraws at once, and ⌘Z/⇧⌘Z undo and redo each one.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Spec Change Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In Chromium, in each format: pick every layout from a page with fewer and with more blocks; Mescola through a full cycle; each swatch and a typed colour on a page and on a block; ⌘Z/⇧⌘Z; reload keeps the result; light and dark.
