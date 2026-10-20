---
title: 'Story 2.17: Case wizard details first, business line, and table filters'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_commit: 'c01e230032e6f0ebdb0d6150320f669275e7891f'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-15-client-wizard-and-details-step.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The case history wizard starts with a name-only step 0 and asks for material before the details. The owner (2026-10-20) wants it to work like the client wizard: details first, including a business line. She also wants the Case history table to have a status filter, a Business line column, and search that covers the business line.

**Approach:** Merge step 0 and the Details step into one first step, **Dettagli**:
- Nome, Cliente, Anno and Lingua (as today);
- **Business line**: single-select pills from a fixed list;
- Contesto, Soluzione and Risultati.

**Avanti** creates the case. The steps become 1 Dettagli · 2 Materiale · 3 Genera. The table gets a top-right toolbar with the search "Cerca progetto o cliente…" and a status filter, plus a Business line column.

## Boundaries & Constraints

**Always:**
- **Business lines** are one constant, in this display order: `branding` "Branding", `social_media` "Social media", `video` "Video", `web_design` "Web design", `advertising` "Advertising", `eventi` "Eventi". They are stored as `case_study.business_line`. The database checks the value is in the list, added `NOT VALID`, so existing cases with null stay.
- **Step 1 Dettagli shows, in order:**
  - Nome;
  - Cliente (today's picker, with `?clientId=` preselecting it);
  - Anno;
  - Lingua;
  - Business line, as single-select pills (a radiogroup with arrow-key navigation, reusing the client industry pill styles);
  - Contesto, Soluzione and Risultati (today's textareas, still optional).
- **Saving step 1:**
  - **Avanti** is inactive until Nome, Cliente, Anno and Business line are set, with the reason linked via `aria-describedby`.
  - On a new case, **Avanti** creates it (code, number and the other rules unchanged), then saves the three texts, then opens step 2.
  - On an existing draft, the three texts autosave as today, and Nome, Anno, Lingua and Business line save on **Avanti**. The client is fixed once the case exists, because the code depends on it. Changing the year of a draft (owner, 2026-10-20) gives the case the next number for its client in the new year and a new code (e.g. LUM-2026-03 → LUM-2025-02); the old number is never reused. Only `update_case_study_details` may change a draft's year, number and code.
- **Steps:** 1 Dettagli · 2 Materiale · 3 Genera (still a placeholder).
  - Materiale's **Avanti** goes to 3.
  - Genera needs at least one file.
  - A Bozza row opens the first incomplete step: Dettagli if the business line is missing, otherwise Materiale if there is no file, otherwise Genera.
- **The table toolbar**, at the top right:
  - the search "Cerca progetto o cliente…", which matches name, client name, client code, case code and business line label (accent- and case-insensitive, as today);
  - a segmented status filter: **Tutti** · **Bozza** · **In elaborazione** · **Da approvare** · **Approvato**, single choice, default Tutti, combined with the search (AND), styled like the reference (a pill track with the selected segment filled).
- **New column:** Business line, sortable, empty for cases created before this change.
- **Planning docs** get the owner change of 2026-10-20 in:
  - epics.md: FR1, FR2, UX-DR4, UX-DR7–UX-DR10, Stories 2.5, 2.6, 2.7, 2.10, 2.12 and 2.13 (step numbers), and 4.1 (the status filter now ships here);
  - EXPERIENCE.md: the wizard and table rows;
  - prd.md: FR1 and FR2.

  These notes and Story 2.17 itself are added to epics.md and sprint-status.yaml.

**Never:**
- Changing the client wizard, the material upload rules or generation.
- Editing an applied migration, or running `supabase db push`.
- Counts on the filter segments (Story 4.1 may add them).
- Filtering by business line (search only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New case | All required fields set, Avanti | Case created with business line; texts saved; step 2 opens | N/A |
| Missing BL | No pill selected | Avanti inactive with reason | Direct call → `INVALID_INPUT`, nothing written |
| Unknown BL | `"moda"` via action | Refused | `INVALID_INPUT` (TS) / check (DB) |
| Text save fails after create | Brief save error | Case exists; stays on step 1 with the error; retry saves only texts | Existing save errors |
| Legacy draft | Case without business line | Row opens Dettagli prefilled; Avanti needs a BL | N/A |
| Filter + search | "lum" + Da approvare | Only in-review cases matching "lum" | N/A |
| Search BL | "social" | Cases with Social media | N/A |
| Year change | Draft LUM-2026-03 moved to 2025 (LUM-2025-01 exists) | Case becomes LUM-2025-02; counter for 2025 advanced; 2026's 03 not reused | N/A |
| Year change on non-draft | Approved case | Refused | `STALE_STATUS`, nothing written |

</frozen-after-approval>

## Spec Change Log

- **2026-10-20, owner decision (renegotiates the frozen intent).** Review found that editing a draft's year left its code on the old year and could collide on (client, year, number). The owner chose to keep the year editable: a year change renumbers the draft in the new year and gives it a new code. This reverses "codes never change" for drafts only (AD-21 note to add). KEEP: everything else built so far.

## Code Map

- `src/app/(wizard)/case-studies/new/page.tsx`: step routing.
  - The no-`caseId` branch renders `NameStep` (step 0); the default step is Materiale; `requested` is 1/2/3; the gates are material → details/generate.
  - Re-map it to 1 Dettagli · 2 Materiale · 3 Genera, with the new first-incomplete rule.
- `src/app/(wizard)/_components/name-step.tsx`: fields, client picker, year and locale, and the `createCaseStudy` call (L134). It becomes part of a new `case-details-step.tsx`.
- `details-step.tsx` (`DetailsStep`, footer `current={2}`, L152–158) and `use-autosave-fields.ts` (`active` option): follow the client pattern in `clients/new/_components/client-details-step.tsx` L132–292 (create → `replaceState` → flush the texts → push step 2).
- `src/app/(wizard)/_components/stepper.tsx` L8 `WIZARD_STEPS` and L41 link rule; `src/app/_lib/routes.ts` `wizardHref`. Update the material step's footer default (`wizardHref(caseId, 2)` → 3, `step` 1 → 2).
- `src/app/(tool)/clients/_components/industry-pills.tsx` (`PILL`, `PILL_PRESSED`): reuse the styles for a new single-select `BusinessLinePills` (radiogroup).
- `src/modules/case-study/domain/case-study.ts`:
  - `createCaseStudyInputSchema` (~L326) and `caseStudySchema` (~L298): add `businessLine`;
  - add the `BUSINESS_LINES` constant (pattern: `CLIENT_INDUSTRIES` L26);
  - add an update-details use case and RPC for name, year, locale and business line on a draft.
- `src/modules/case-study/adapters/supabase/case-study-repository.ts` L19 `CASE_STUDY_COLUMNS`, L100 create. The latest `create_case_study` is in `20261019180000_case_study_client_delete.sql` L329–338. Recreate it in a new migration `supabase/migrations/20261020140000_case_study_business_line.sql`, after the 3.2 one, with `p_business_line`, plus `update_case_study_details`.
- Table:
  - `src/app/(tool)/case-studies/page.tsx` (row mapping);
  - `_components/filter-sort.ts` (`CaseStudyRow`, `filterRows` L47–51, `SORT_KEYS`);
  - `_components/case-studies-table.tsx` (`COLUMNS` L36–41, search L128–140);
  - `it.ts` L24–48 (search copy, column labels) and L337–341 (status labels).
- Segmented control: DESIGN.md frontmatter L102–109, prose L209. The `Stepper` track is the only existing example.
- Tests to update: `name-step.test.tsx` (replaced), `details-step.test.tsx`, `stepper.test.tsx`, `case-studies/new/page.test.tsx`, `material-step.test.tsx` (footer), `case-studies-table.test.tsx`, `filter-sort.test.ts`, `case-study` domain, use-case and repository tests, `test/db/case-study.db.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] The migration (column, `NOT VALID` check, `create_case_study` recreated, `update_case_study_details`), the domain constant and schemas, the repository, the use cases and actions, with tests including DB tests.
- [x] The new `case-details-step.tsx` and `BusinessLinePills`; `NameStep` removed; routing, stepper, routes and the material and details footers renumbered. Component and page tests for every matrix row.
- [x] The table toolbar (search plus status segmented filter), the Business line column, and search over the business line label, with table and filter-sort tests.
- [x] Copy in `it.ts`, with `it.test.ts` pins updated.
- [x] The doc notes listed in the Always section, Story 2.17 in epics.md, and sprint-status.yaml.

**Acceptance Criteria:**
- Given a client page, when **Nuova case history** is pressed, then step 1 opens with that client preselected.
- Given CI, when `check`, `db` and `image` run, then they pass and `db.types.ts` matches.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all pass.
- `npm run test:db` -- runs in CI only.

**Manual checks:**
- After the owner applies the change to dev:
  - create a case through the new step 1;
  - reopen a legacy draft;
  - filter the table by Da approvare;
  - search "social".

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | edge-case | Editing a draft's year keeps the old code and can collide on (client, year, number), giving an endless "riprova" | high | intent_gap → resolved | Owner chose renumbering (Spec Change Log 2026-10-20); built as a patch. |
| 2 | blind, edge-case | A new case loses everything typed when leaving before Avanti, with no warning | medium | patch | Autosave is inactive until the case exists; the step now holds long texts. |
| 3 | blind, edge-case, verification-gap | A legacy draft with edited info and no business line can't be left by a link | medium | patch | The link save sends `businessLine: null`, which is refused, so the link is blocked. |
| 4 | blind | Every check violation is reported as a bad business line | low | patch | `23514` maps to `businessLineRefused` without checking the constraint name. |
| 5 | blind, edge-case | The no-results message ignores the status filter when a search is active | low | patch | `noResults` names only the query. |
| 6 | blind | The business line pills don't expose disabled state | low | patch | No `aria-disabled` while saving. |
| 7 | blind | EXPERIENCE.md keeps the old step sections and placeholder; UX-DR4 still says counts | low | patch | Only a note was appended. |
| 8 | verification-gap | The Materiale footer dot isn't pinned to step 2 | low | patch | No test checks `data-dot` on the case step. |
| 9 | verification-gap | A link click whose details save fails is untested | low | patch | Only the success path is tested. |
| 10 | blind | The client page's case table gets the toolbar too | low | reject | A status filter is useful there too; the search still works. |
| 11 | blind | The header stays "new case" after a partial create failure | low | reject | Same as the client wizard; resolved on reload. |
| 12 | blind | `case_details_updated` stores only new values | low | reject | The event log is ordered; previous values come from the prior event. |
| 13 | blind | The status filter resets on leaving the table | low | reject | Not in the spec; Story 4.1 can add URL state. |
| 14 | blind | Business line key `eventi` is Italian next to English keys | low | reject | The frozen spec lists `eventi`; labels are separate. |
| 15 | blind | Old `&step=` URLs now open a different step | low | reject | Only drafts on dev; no external links exist. |
| 16 | edge-case | FORBIDDEN or write failures show "riprova" | low | reject | Only owner/designers reach the wizard. |
| 17 | edge-case | Unmount during an in-flight create loses the texts | low | reject | Sub-second window. |
