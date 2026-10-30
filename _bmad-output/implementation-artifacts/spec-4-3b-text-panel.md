---
title: 'Story 4.3b: the text panel (Stile, Allinea, Colore, Colonne) and a Testi group''s alignment in its block'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: 'fd71f9adac97439af7cdf7f379a608bb68953baf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After 4.3a a text's words can be changed, but not how it looks. Story 4.3's text panel (C32) and a Testi group's "Allineamento nel blocco" (C30) are missing, though the document (v2) and the renderer already hold and draw every setting.

**Approach:** When a text is selected, the left panel shows "Testo · {format}" with Stile, Allinea, Colore and Colonne. When a Testi group is selected, it shows "Allineamento nel blocco". Each change writes the document of the format in view through 4.3a's `doc.change` (autosave, undo/redo). Split from Story 4.3 by the owner (2026-10-29); 4.3c and 4.3d stay in deferred-work.

**Decisions (owner, 2026-10-29):**
- Subagents only for the review step (and compiling the epic context).
- A text with no colour shows the block's `ink` first, then white on a photo, then `#012234`, as the renderer draws it (owner, 2026-10-30, on PR #128).

## Boundaries & Constraints

**Always:**
- The text panel (mockup `renderBlockProps`, the `txt` branch), in its own section under the selection's name:
  - Eyebrow "Testo · {format name}".
  - **Stile**: a native `<select>` of the seven styles, named from `textStyles(formatId, template)` (Etichetta, Titolo XL, Titolo, Sottotitolo, Testo, Numero, Citazione). Changing it sets `style` and drops `size`, so the text takes its new style's size; until then it keeps its template size.
  - **Allinea**: segmented Sinistra / Centro / Destra (`aria-pressed`). Sinistra removes `align`; the others set `centre` / `right`.
  - **Colore**: a field with a chip and the value (`#RRGGBB` upper case, or "Trasparente"), then six swatches: `#FFFFFF`, `#EDEDF0`, `#012234`, `#DEFE56`, `#2977FF`, Trasparente (checkerboard). The value shown when `colour` is unset is the one the text renders in: the block's `ink`, else white on a block with an image background, else `#012234`. Typing a colour applies on Enter or on leaving the field when it is `#rrggbb` or `#rrggbbaa` (with or without `#`, any case, stored lower case) or "trasparente"; anything else puts the current value back. The pressed swatch has `aria-pressed="true"`.
  - **Colonne**: segmented 1 / 2 (answer 14). 1 removes `columns`; 2 sets `columns: 2`.
- A Testi group selected: eyebrow "Allineamento nel blocco", four icon buttons with names and titles: In alto, Al centro, In basso, and "Distanziati: il primo testo in alto, il resto in basso" (or "i primi {n} testi" when `splitAt` > 1). Distanziati sets `split` and `splitAt` (kept if already split, else 1); the others set `top` / `centre` / `bottom` and remove `splitAt`.
- Every control is one undo step, applies only to the format in view, saves through `doc.change`, and is a no-op (no step, no save) when the value is already the one chosen.
- Styling applies to bound texts too (it is the document's, not the record's); `provenance` and the words never change.
- When editing is off (not `editable`: approved case, trial pages), the controls show the current values but are `aria-disabled` and say "arriva presto" through the existing `onSoon`, as 4.3a's double-click does.
- Strings in `it.ts`, pinned in `it.test.ts`. House rules from `mac-recap-ui`; light and dark checked.

**Never:**
- No font picker, font upload, text scale or per-word styling.
- No Rimuovi elemento, Elementi, blocks, layout, background or page tools (4.3c, 4.4, 4.13); they stay inactive.
- No change to `src/modules/generation`, `src/modules/rendering`, `src/worker`, or the database.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Style | Titolo with template `size`, pick Testo | `style: "text"`, no `size`, saved, one undo step | N/A |
| Same value | press the pressed Allinea | nothing changes, no save | N/A |
| Swatch | click `#DEFE56` | `colour: "#defe56"` in the format in view only | N/A |
| Typed colour | type `2977ff`, Enter | `colour: "#2977ff"` | N/A |
| Bad colour | type `blu`, leave | field shows the current value, nothing saved | N/A |
| Two columns | press 2 | `columns: 2`; 1 removes it | N/A |
| Group split | Distanziati on a top group | `align: "split"`, `splitAt: 1`; In alto removes `splitAt` | N/A |
| Bound text | restyle the client's name | style saved, binding and provenance unchanged | N/A |
| Not editable | approved case, press a control | "arriva presto", nothing changes | N/A |
| Undo | ⌘Z after a colour | previous colour back, saved | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/generation/domain/document.ts` -- read only: `textElementSchema` (`style`, `colour` incl. `"transparent"`, `align`, `columns`, `size`), `textGroupElementSchema` (`align`, `splitAt` only with `split`, ≤ items), `TEXT_STYLES`, `TEXT_GROUP_ALIGNS`.
- `src/modules/rendering` -- read only: `textStyles(formatId, template)[style].name`; the renderer already draws `mr-al-*`, `mr-cols-2`, `colour`, `mr-grp-*`, `mr-push`.
- `src/app/(wizard)/_components/configurator/text-editing.ts` -- add pure `withTextSettings(pages, pageKey, elementId, patch)` (style → drop `size`; `align: "left"` / `columns: 1` remove the key) and `withGroupAlign(pages, pageKey, elementId, align)`; both return the same array when nothing changes, like `withText`. Reuse `findElement` (finds inside groups and rows).
- `src/app/(wizard)/_components/configurator/text-panel.tsx` (new) -- `TextPanel` and `GroupPanel` sections; style with `SEG`, `SEG_BUTTON`, `EYEBROW`, `PANEL_SECTION` from `styles.ts`; swatch and checkerboard from the mockup (lines 136–140). Icons: lucide `AlignVerticalJustifyStart/Center/End`, `AlignVerticalSpaceBetween`.
- `src/app/(wizard)/_components/configurator/left-panel.tsx` -- render the new sections after the name section when `element` is a text or a group; new props `editable`, `onTextSettings`, `onGroupAlign`.
- `src/app/(wizard)/_components/configurator/configurator.tsx` -- callbacks calling `withTextSettings` / `withGroupAlign` on `formats[formatId]` then `doc.change(next, formatId)` (no group); pass the block to compute the shown default colour. The hex `<input>` is already ignored by the key handler (`typing`).
- `src/shared/i18n/it.ts` + `it.test.ts` -- `configurator.text.*` (heading, style, align options, colour, transparent, columns) and `configurator.group.*`.
- Tests: `text-editing.test.ts` (patches, no-ops, split/splitAt, size dropped, bound text), `configurator.test.tsx` (each matrix row through the panel; the sent document passes `validateNewDocument`, as 4.3a does).

## Tasks & Acceptance

**Execution:**
- [x] `it.ts` / `it.test.ts` -- panel strings.
- [x] `text-editing.ts` (+ tests) -- `withTextSettings`, `withGroupAlign`.
- [x] `text-panel.tsx`, `left-panel.tsx`, `configurator.tsx` (+ `configurator.test.tsx`) -- panel, wiring, matrix rows.
- [x] `sprint-status.yaml` -- note 4.3b in review on the 4.3 line.

**Acceptance Criteria:**
- Given Story 4.3's criteria for the text panel and "Allineamento nel blocco" in `epics.md`, when checked on the running page in each format, then each is met and the canvas redraws at once.
- Given `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, when they run, then they pass.

## Implementation Notes

- Owner (2026-10-29): subagents only for the epic context and the review step, so the implementation was done in the main session.
- The palette lives in `text-editing.ts` (`TEXT_COLOURS`): `test/tokens.test.ts` forbids raw colours in any `.tsx` under `src/app`, tests included. The checkerboard uses theme tokens.
- The default colour shown follows the renderer: the block's `ink` (an inline style) wins over the photo's white (a class), so `shownColour` checks `ink` before the image background.
- A colour that differs only in case from the stored one (templates write `#DEFE56`) is no change.
- When editing is off, the buttons are `aria-disabled` and say "{tool} arriva presto."; the `<select>` is `disabled` and the colour field `readOnly`, both pointing to the "Arriva presto" line, since a native select can't take a click to say so.
- Not done: the browser check against the local stack. Docker started, but the registries refused the Supabase images (Docker Hub 429, ECR "Data limit exceeded", ghcr blobs 403). The panel is covered by `configurator.test.tsx` (happy-dom, the real renderer), one test per matrix row.
- Files: `text-editing.ts` (+ test), new `text-panel.tsx`, `left-panel.tsx`, `configurator.tsx` (+ test), `it.ts` / `it.test.ts`, `sprint-status.yaml`.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | Focusing and leaving the colour field, Escape in it, or the pressed swatch writes the inherited colour as an explicit `colour` (blind, edge, verify-gap other) | medium | `commitColour` and the swatch called `onChange` with the shown value; `withTextSettings` compared it with the unset stored colour, so it saved, added an undo step and pinned the colour | patch (`pick` skips the colour the text already shows; test fails without it) |
| 2 | Pressing the already-pressed Sinistra or 1 on a text with explicit `align: "left"` / `columns: 1` deletes the key: an invisible save and undo step (edge) | low | Fixture element 21 has `columns: 1`; direct fix | patch |
| 3 | Transparent chip in the colour field loses its size and shape (blind) | low | `{...chip()}` replaced the `className`; direct fix | patch |
| 4 | Hard-coded `id`s on the select and the colour field (blind) | low | One panel today; `useId` is a direct fix | patch |
| 5 | Group section and its buttons' group both named "Allineamento nel blocco" (blind) | low | Redundant inner `role="group"` label; deleted | patch |
| 6 | `settle` names both the configurator callback and a test helper (blind) | low | Renamed the callback `applyToSelection` | patch |
| 7 | A unit test mutated its fixture midway (blind) | low | The case-insensitive check moved to its own test and fixture | patch |
| 8 | Missing tests: group `splitMany` name and `aria-pressed`, group and swatch/Colonne/field when not editable, redo, group change kept to the format in view (verify-gap, blind) | medium | Pre-verified gaps; tests added | patch |
| 9 | No way back to an inherited colour once one is picked (blind) | low | The frozen intent sets the controls (palette, Trasparente, typed colour); only undo restores inheritance | reject |
| 10 | Spec's default-colour order (photo white before `ink`) differs from the code (blind, edge, verify-gap) | low | The code follows the renderer (inline `ink` beats `.mr-on-photo`); the fix would edit the frozen spec | reject; owner chose the renderer's order (2026-10-30) and the frozen wording was corrected |
| 11 | Browser check not done while tasks are ticked (blind) | false | Status is `in-review`, not done; the gap is in Implementation Notes and the summary | reject |
| 12 | Swatches named by hex (blind) | low | Mockup names swatches by hex; Italian colour names need copy decisions | reject |
| 13 | Distanziati offered on a one-text group (blind) | low | Same look as In alto, harmless; not covered by the intent | reject |
| 14 | Distanziati on an empty group sets `splitAt` past the items (edge) | low | No template or 4.3b path makes an empty group; 4.3c adds groups and owns that | reject |
| 15 | Panel shows white for a photo block whose asset no longer resolves (edge) | low | Deleted-media case; with #1 fixed nothing is pinned | reject |
| 16 | Locked select and colour field don't say "arriva presto" (edge) | low | A disabled select fires no click; both point to the "Arriva presto" line via `aria-describedby`, as noted | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In Chromium against the local stack: each control on a text and a group, in two formats, ⌘Z/⇧⌘Z, reload shows the saved values; light and dark.
