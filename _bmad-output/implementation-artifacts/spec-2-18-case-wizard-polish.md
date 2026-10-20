---
title: 'Story 2.18: Case wizard polish (live title, client search, no language, bigger pills, fixed footer)'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: 'b3752585208ee55bd79bfe119edd9c62ee04512d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-17-case-wizard-details-first-and-table-filters.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The owner reviewed the new case wizard (2026-10-20). She asked for six changes:
- the big title should follow the name;
- the client picker should be a search box;
- the language field should go (multilingual comes later, with both languages created together);
- the business line and industry pills are too small;
- the year should be visibly required;
- the footer with **Avanti** should stay put while the page scrolls.

**Approach:** UI changes only. No migration, and no change to what is stored. The case keeps `locale = "it"` until multilingual is designed.

## Boundaries & Constraints

**Always:**
- **Live title.** The big title (today "Nuova case history" until a case exists) shows the typed name as soon as the Nome field loses focus, or the trimmed name while typing pauses (≤ 300 ms). It updates the same way when the name of an existing draft is edited. An empty name brings back "Nuova case history". The browser tab title follows it too. Only the case wizard does this.
- **Client field.** It becomes a searchable combobox instead of a native `<select>`:
  - typing filters clients by name and code (case- and accent-insensitive, like the table search);
  - the list shows "{name} ({code})";
  - keyboard: arrows move, Enter picks, Esc closes;
  - it uses the ARIA combobox pattern (`role="combobox"`, `aria-expanded`, a listbox with options, `aria-activedescendant`);
  - a typed text that matches no client shows "Nessun cliente trovato" with the existing link to Clienti;
  - `?clientId=` still preselects;
  - on an existing case the field is read-only, as today;
  - with no clients at all, the existing note shows.
- **Language.** The Lingua field is removed from step 1. New cases are created with `locale: "it"`. An existing draft keeps its stored locale, and saving leaves it unchanged. A planning note records "multilingual: a case will be created in both languages at once (owner, 2026-10-20)".
- **Year.** It stays prefilled with the current year. The label is marked required (a visible marker, plus `aria-required` and `required`). Clearing it, or a value outside 1900–2100, makes **Avanti** inactive with the reason, as today.
- **Pills.** The shared pill style (`PILL` in `industry-pills.tsx`, used by business line and client industries) gets bigger: about `px-4 py-2`, `text-sm`, `min-h-10`, with ~8 px gaps. It must stay WCAG AA, with a target of at least 40 px tall.
- **Footer.** `WizardFooter` is shared by every wizard step (case and client). It stays fixed at the bottom of the viewport while the content scrolls:
  - it is aligned to the wizard column;
  - it has a solid background and a top border;
  - the content gets bottom padding so nothing hides behind it;
  - focus and keyboard order are unchanged;
  - below 1024 px it follows the read-only layout.

**Never:**
- Changing the client wizard's fields, the business line list, the case code rules or the stored data.
- Building multilingual.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Type a name | "Rebranding Lumen", then Tab | Title reads "Rebranding Lumen" | N/A |
| Clear the name | Empty name | Title back to "Nuova case history"; Avanti inactive | N/A |
| Edit a draft's name | Change, then blur | Title updates before Avanti | N/A |
| Search a client | "lum" | Lumen S.r.l. (LUM) listed; Enter picks it | N/A |
| No match | "zzz" | "Nessun cliente trovato" plus a link to Clienti | N/A |
| Preselected client | `?clientId=` | Combobox shows the client | N/A |
| Year cleared | Empty year | Avanti inactive; reason names Anno | N/A |
| Long page | Scroll to the bottom | Footer stays visible; the last textarea isn't covered | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(wizard)/_components/case-details-step.tsx`:
  - L25–31: the `Field` union and `FIELDS`, which include `locale`, plus the locale options;
  - L172: the `locale` state;
  - L209: the unsaved check uses `locale !== "it"`;
  - L262: `it.wizard.errors.locale`;
  - L491: the client `<select>`;
  - L551–556: the locale select.

  Remove the locale UI, keep sending `locale` (`"it"` or the stored value), and replace the client select with a combobox component.
- `src/app/(wizard)/_components/wizard-frame.tsx`:
  - L29–32: the `eyebrow` and `title` props, and L88 where the title renders server-side;
  - L120–123: the `WizardFooter` grid (`mt-8 … border-t pt-5`).

  The live title needs a small client-side title component, for example a context or store that the details step updates and the frame's title slot reads.
- `src/app/(tool)/clients/_components/industry-pills.tsx` L6–10: `PILL`, `PILL_PRESSED` and `PILL_CHECKED`, shared with `business-line-pills.tsx`.
- `src/app/(tool)/case-studies/_components/filter-sort.ts`: `normalizeForSearch`, to reuse in the client filter.
- `src/shared/i18n/it.ts`: wizard copy (fields, the no-match line, the required marker). Remove the `locales` and `errors.locale` keys if they're no longer used.
- `_bmad-output/planning-artifacts/epics.md`: add a 2.18 entry and the multilingual note. `sprint-status.yaml`: add `2-18-case-wizard-polish`.

## Tasks & Acceptance

**Execution:**
- [x] The live title (client title slot, updates on blur and after a debounce, plus `document.title`), with component tests.
- [x] The client combobox, with keyboard and ARIA tests and the matrix rows.
- [x] The language field removed (create sends `"it"`; existing drafts keep theirs), with tests updated.
- [x] The year marked required, with a test.
- [x] The pill sizes, with snapshot or class tests for both pill groups.
- [x] The fixed footer, with layout classes, content padding and a test that the footer has the fixed classes. Check the case and client wizards in the preview.
- [x] Copy, docs notes and the sprint-status entry.

**Acceptance Criteria:**
- Given the client wizard, when its steps render, then they use the fixed footer and the bigger pills, and their behaviour is unchanged.
- Given CI, when `check`, `db` and `image` run, then they pass.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.

**Manual checks:**
- In the dev preview: type a name and watch the title change, search for a client, scroll a long step 1 and check the footer stays visible.

## Spec Change Log

- **2026-10-20, implementation decision (does not change the owner's intent).** The footer uses `position: sticky` at the bottom of the wizard column instead of `fixed`. It stays in view while the page scrolls ("non deve scrollare"), aligns with the column without scrollbar offsets, and never covers the last field, so no extra bottom padding is needed. KEEP: sticky, with scroll padding so focused fields aren't hidden behind it.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | Typing over a picked client and leaving keeps text that looks like a pick; editing the picked label searches "(CODE)" too | medium | patch | `onChange` keeps the label text; the blur test locks it in. |
| 2 | blind, edge-case | Enter in the client field with the list closed or no match submits Avanti | low | patch | The combobox lets Enter through to the form. |
| 3 | edge-case | Mouse-down on the list's scrollbar blurs and closes it | low | patch | No `preventDefault` on the listbox mousedown. |
| 4 | edge-case | Tab can land on a field hidden under the sticky footer | medium | patch | No scroll padding (WCAG 2.4.11). |
| 5 | blind | Only Anno has the required marker | low | patch | Nome, Cliente and Business line are required too; there's no legend. |
| 6 | blind | The top-bar case name doesn't follow the live title | low | patch | Only the `<h1>` reads the live title. |
| 7 | blind | Docs still mention language saving on drafts | low | patch | UX-DR7, FR1 and the EXPERIENCE "Existing draft" bullet. |
| 8 | blind | Screen readers don't hear the search result count or "no match" | low | patch | Only `aria-describedby`; the step already has a status region. |
| 9 | blind | Matches aren't ranked (code or name prefix first) | low | patch | Direct sort tweak. |
| 10 | blind | The bigger pill style also inflates the read-only industry list on client pages | low | patch | `PILL` is shared with the read-only `<li>`. |
| 11 | blind | Sticky versus fixed isn't recorded | low | patch | Recorded in the Spec Change Log. |
| 12 | blind | The footer's shadow trick is only checked by classes | low | reject | Checked in the preview at 1280×800 (footer in view, last textarea above it). |
| 13 | blind | A server `INVALID_INPUT` on `locale` falls back to the generic error | low | reject | The client never sends a different locale; only legacy data could. |
| 14 | blind | Spec and tracker statuses differ | false | reject | Normal workflow states. |
| 15 | blind, edge-case | Restoring the tab title can clash with Next metadata on navigation | low | reject | The wizard pages set no metadata title; step changes remount the page. |
| 16 | blind | No Home/End or Alt+ArrowDown | low | reject | Optional in the APG pattern. |
| 17 | edge-case | An external `value` change after mount desyncs the text | low | reject | The parent never resets `clientId` after mount. |
