---
title: 'Story 2.6: Find and reopen case studies in the table'
type: 'feature'
created: '2026-10-12'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/case-studies` is a placeholder, so an owner/designer can't see, find or reopen the cases they created, and nothing lists cases within an authorized scope.

**Approach:** A scoped `list` in the case-study module, and an owner/designer table on `/case-studies` that searches and sorts in the browser over that list, with empty, no-results, loading and narrow-screen states.

## Boundaries & Constraints

**Always:** Columns: ID (mono), Name, Client, Year, Status (`StatusBadge`), Updated, Links (blank). Default sort Updated newest first; clicking a header sorts by it, again reverses (`aria-sort` on the header). Search over name, client and ID, case- and accent-insensitive (Unicode NFD, diacritics stripped, lower-cased), ~250 ms debounce; `/` focuses it unless focus is already in a text field. Soft-deleted cases never listed. The list returns exactly the authorized scope: the page derives it from the policy (all statuses, or approved only) and passes the same scope to `case-study.list`, which filters by it; no scope the policy denies is ever queried. Updated shown in Europe/Rome, Italian format, date and time. All copy from the dictionary; `t()` stays key-only, and a small `fill(template, params)` helper inserts `{query}`. **Decision (search in the browser):** the page loads the scoped list once; search and sort run client-side (MVP volume is tens of cases); no migration or `unaccent`. **Decision (Bozza row):** the row links to `/case-studies/new?caseId={id}` (the placeholder until the 2.5 wizard); other statuses are not links yet (Story 4.x). **Decision (narrow screen):** below 1024 px the table stays usable; `/case-studies/new` shows the larger-screen message instead of its content, which covers both the sidebar action and Bozza rows. **Decision (strings, Claude draft — confirm at approval):** headers "ID", "Nome", "Cliente", "Anno", "Stato", "Aggiornato", "Link"; search label and placeholder "Cerca nome, cliente o ID"; no results "Nessun risultato per '{query}'." with "Cancella ricerca e filtri"; empty "Ancora nessun case study. Inizia dal materiale di un progetto chiuso." with the existing "Nuovo case study"; narrow screen "Questa pagina richiede uno schermo più grande."; table caption (screen readers) "Elenco dei case study".

**Never:** No status filter, row actions, delete or To review queue (Story 4.1). No library view (Story 5.1). No server-side search or pagination. No wizard (Story 2.5 UI part). No new permissions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List | owner/designer; cases incl. one soft-deleted | all non-deleted cases, newest Updated first | N/A |
| Scope | account/sales/social scope (approved only) | `list` returns approved cases only | denied scope never queried |
| Sort | click Name, then Name again | A→Z, then Z→A; `aria-sort` follows | N/A |
| Search | "citta" with a client "Città"; an ID fragment | matching rows only | N/A |
| No results | query with no match | message with the query and the clear action; clearing restores all rows | N/A |
| Empty | no cases | empty message and "Nuovo case study" (only if the actor can create) | N/A |
| Slash | `/` outside a text field; `/` while typing in a field | focuses search; types normally | N/A |
| Bozza row | click a draft row | navigates to `/case-studies/new?caseId={id}` | N/A |
| Load fails | list returns an error | the page fails into Next's error boundary; no partial table | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/case-study/{ports/case-study-repository.ts,adapters/supabase/case-study-repository.ts,application/,index.ts}` -- add `list(scope: { status?: CaseStatus })`: port method, adapter query (`.from("case_study").select(CASE_STUDY_COLUMNS).is("deleted_at", null)`, `.eq("status", …)` when scoped, ordered `updated_at desc`, rows through `toCaseStudy`), `makeListCaseStudies`, index export. Extend `fakeRepository()` in `application/use-cases.test.ts`.
- `src/modules/access` -- `can(actor, "list cases", resource)`; policy `list cases`: owner_designer any, account_sales_social only `{ status: "approved" }`. Resolve the scope as: all if `can(…, {})`, else approved if `can(…, { status: "approved" })`, else none.
- `src/app/(tool)/case-studies/page.tsx` -- server component; keep `requireSurface("list cases")`, resolve the scope, call `list`, render a client `CaseStudiesTable` (in `_components/`). Add `loading.tsx` with skeleton rows (tokens only).
- `src/app/(tool)/case-studies/new/page.tsx` -- add the narrow-screen message (Tailwind `lg:` breakpoint: content hidden below, message shown below).
- `src/app/_components/status-badge.tsx`, `src/shared/i18n/it.ts` (+ `fill`), `src/shared/utils` -- reuse; new keys under `caseStudies.*`.
- `eslint.config.mjs` UI_STRINGS -- no literal UI text in `src/app/**/*.tsx` (tests exempt).
- `test/db/case-study.db.test.ts` -- `createCase`, `inRolledBackTx`; soft-delete via `update … set deleted_at`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/modules/case-study/**` + tests -- scoped `list` end to end (fake-repo tests for scope and soft-delete)
- [ ] `src/shared/i18n/it.ts` + test -- table strings, `fill()`
- [ ] `src/app/(tool)/case-studies/page.tsx`, `loading.tsx`, `_components/case-studies-table.tsx` (+ a pure `filter-sort` helper) -- table per Boundaries
- [ ] `src/app/(tool)/case-studies/new/page.tsx` -- narrow-screen message
- [ ] `src/app/(tool)/case-studies/_components/*.test.tsx` (happy-dom) and helper tests -- every UI matrix row
- [ ] `test/db/case-study.db.test.ts` -- `list` excludes soft-deleted; the approved-only scope returns approved rows only (set status in a rolled-back transaction through `transition_case_study`)
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 2.4 `done`, 2.5 back to `in-progress` (its UI part is open)

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then the new DB tests pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
</content>
