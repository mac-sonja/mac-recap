---
title: 'Story 4.4a: pick a layout, Mescola, and set a page or block background colour'
type: 'feature'
created: '2026-10-30'
status: 'done'
baseline_commit: '8efc5acd4095e9ff6a95581774f8e326767b581b'
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
- [x] `it.ts` / `it.test.ts` -- strings.
- [x] `page-editing.ts` (+ tests) -- layout, Mescola, background edits.
- [x] `left-panel.tsx`, `configurator.tsx` (+ `configurator.test.tsx`) -- wiring.
- [x] `sprint-status.yaml` -- on the 4.4 line: 4.4a in review, 4.4b and 4.4c in deferred-work.

**Acceptance Criteria:**
- Given Story 4.4's criteria for Layout (click), Mescola and Sfondo · Tinta unita in `epics.md`, when checked on the running page in each format, then each is met, the canvas redraws at once, and ⌘Z/⇧⌘Z undo and redo each one.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Owner (2026-10-29, 4.3): subagents only for the review step, so the implementation was done in the main session.
- Layout and Mescola act on the tools' page (selected, else in view); Sfondo on the selected block, else that page. Layout goes through `applyPageEdit` (page selected); Mescola and Sfondo call `doc.change` directly and keep the selection.
- `BACKGROUND_SWATCHES` is `TEXT_COLOURS` (one palette), and `parseBackground` reuses `parseColour`, refusing `#rrggbbaa`.
- Sfondo's swatches are named in `it.ts` (`tools.swatches`); the test file names colours through `BACKGROUND_SWATCHES` (`test/tokens.test.ts` forbids raw colours in `.tsx`).
- `CHECKERBOARD` moved from `text-panel.tsx` to `styles.ts`, shared by both colour pickers.
- Review: Tinta unita on an image background goes back to the default colour (page white, block `#ededf0`), as the mockup's colour tab does. The colour field is no longer re-keyed on a new value, so Enter keeps the focus.
- Not done: the browser check against the local stack (as in 4.3b/c, the configurator needs Supabase). Covered by `configurator.test.tsx` (happy-dom, the real renderer) and `page-editing.test.ts`.
- Files: `page-editing.ts` (+ test), `left-panel.tsx`, `configurator.tsx`, `configurator.test.tsx`, `styles.ts`, `text-panel.tsx`, `it.ts` / `it.test.ts`, `sprint-status.yaml`.

## Spec Change Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In Chromium, in each format: pick every layout from a page with fewer and with more blocks; Mescola through a full cycle; each swatch and a typed colour on a page and on a block; ⌘Z/⇧⌘Z; reload keeps the result; light and dark.


## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Undo/redo and save untested for Mescola and Sfondo (blind, verify-gap) | medium | Only the Layout test pressed ⌘Z; Mescola and Sfondo call `doc.change` on their own path | patch (tests: Mescola save, kept selection, ⌘Z/⇧⌘Z; Sfondo ⌘Z/⇧⌘Z) |
| 2 | Enter in the colour field drops the focus (blind, edge) | medium | `key={colour}` remounted the input on a new colour | patch (no key; an effect updates the value when the field isn't focused; test) |
| 3 | Tinta unita does nothing on an image background (blind, edge, verify-gap) | low | `onClick` was undefined when editable; image backgrounds exist in templates and fixtures | patch (back to the default colour, as the mockup; test) |
| 4 | `parseBackground` copies `parseColour` (blind) | low | Same trim/hex logic in two files | patch (reuse, refuse 8 digits) |
| 5 | Swatch palette duplicated (blind) | low | `BACKGROUND_SWATCHES` equalled `TEXT_COLOURS` | patch (alias); the names map stays: the text panel labels swatches by hex |
| 6 | `shownColour` name clash (blind) | low | `text-editing.ts` exports a different `shownColour` | patch (renamed `fieldValue`) |
| 7 | `refused` restates the reason union (blind) | low | Literal list beside `PageEdit` | patch (derived with `Exclude`) |
| 8 | Escape in the Sfondo field untested (verify-gap) | low | Mirrors the tested text-panel handler | patch (test) |
| 9 | `applyPageEdit` has no default for silent reasons (blind) | false | `nothing` is meant to be silent (pressed layout, frozen intent); `blockFull` silent per 4.3c's frozen intent | reject |
| 10 | The read-only colour field gives no message (blind) | low | Same as the text panel's field (4.3b); swatches and thumbnails do say it | reject |
| 11 | A layout drops the block selection (blind) | false | Frozen intent: "The page is then selected" | reject |
| 12 | Removing middle empty blocks reflows filled ones (blind) | false | Frozen intent: "removes empty blocks, last first"; block order is kept | reject |
| 13 | Mescola isn't announced (blind) | low | The pressed thumbnail updates; adding a message is new behaviour | reject |
| 14 | Scrolling while typing retargets the colour (edge) | low | Needs a scroll-wheel move with focus in the field and no selection; fix adds target state | reject |
| 15 | Typing then clicking a swatch commits twice or says bad colour (edge) | low | Blur commits first; rare, the fix adds a `relatedTarget` guard | reject |
| 16 | Same Enter re-key focus loss in the text panel's colour field | low | Pre-existing in 4.3b (`text-panel.tsx` `key={colour}`), not caused here | defer |
