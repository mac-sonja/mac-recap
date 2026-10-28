---
title: 'Story 4.1: To review queue, no counts in the sidebar'
type: 'feature'
created: '2026-10-28'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cases waiting for approval have no place of their own: the only signal is a "{n} da approvare" note next to Case in the sidebar, and the sidebar also shows a client count the owner does not want. Nothing lists the waiting cases oldest first.

**Approach:** A **Da approvare** sidebar item (no number) opens `/to-review`: the Case table showing only cases in Da approvare, oldest first by when each entered Da approvare, with "Niente da approvare." when empty. Every number goes from the sidebar.

## Boundaries & Constraints

**Always:**
- Owner decision 2026-10-28: no number next to any sidebar item, now or later (Case, Clienti, Da approvare, all).
- Same policy as the Case page: the item shows and the page opens only with `list cases` on every status (`listScopeFor` + `authorize`); an actor scoped to approved only (Libreria) gets neither, and `/to-review` sends them to their landing.
- "Entered Da approvare" = the `at` of the case's latest `transition` event whose `data.to` is `in_review`; a case with no such event falls back to `updatedAt`. Ties keep `id` order.
- Any owner/designer sees every waiting case; no assignment or claiming.
- Italian copy via `it.ts`; house UI rules from the mac-recap-ui skill.

**Never:**
- No migration and no new table or column.
- No Delete row action in the table: owner decision 2026-10-22 keeps **Elimina bozza** inside the opened draft (already built, with `CASE_NOT_DELETABLE` in `case-study.deleteCase`).
- Do not touch configurator files (`src/app/(wizard)/_components/configurator/**`, `[caseId]/configurator/**`): 4.2a/4.2b are in flight. Rows on `/to-review` are not links yet; 4.2's `canEdit` will make them open the configurator once it merges.
- No change to the Case table's status filter counts (they stay) or to the Home dashboard.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Queue order | A entered Da approvare Mon, B Tue, C (no event) updated Wed | `/to-review` rows A, B, C | N/A |
| Re-entered | A went in_review → (later back) → in_review again Thu | A sorts by Thu | N/A |
| Empty | no case in Da approvare | "Niente da approvare." card, no table | N/A |
| Approved-only actor | account/sales/social | no sidebar item; `/to-review` redirects to landing | N/A |
| Event read fails | case_event query errors | every row falls back to `updatedAt`; page still renders | logged |

</frozen-after-approval>

## Code Map

- `src/app/(tool)/_components/sidebar.tsx` -- `NavLink.meta`, `toReviewCount`, `clientCount` props: remove all three; add a Da approvare item (icon `Inbox`) right after Case, active on `/to-review`, shown with `showCaseStudies`.
- `src/app/(tool)/layout.tsx` -- `sidebarCounts` exists only for those numbers: delete it and the two props.
- `src/app/(tool)/case-studies/page.tsx` -- pattern to copy for the new page (requireSurface, listScopeFor, row mapping).
- `src/app/(tool)/case-studies/_components/case-studies-table.tsx` -- reuse with two new optional props: `showStatusFilter` (default true) and `initialSort: SortState | null` (null = keep incoming order until a header click). 4.2a edits the `href` line here; keep changes away from it.
- `src/app/(tool)/case-studies/_components/filter-sort.ts` -- `sortRows`, `DEFAULT_SORT`; no change expected beyond typing `null`.
- `src/modules/case-study/adapters/supabase/case-study-repository.ts` + `ports/case-study-repository.ts` -- add `reviewSince(caseIds)` → `Map<caseId, at>` from `case_event` (`type = 'transition'`, `data->>to = 'in_review'`, newest per case).
- `src/modules/case-study/index.ts` -- export `listToReview(scope)`: `list(scope)` filtered to `in_review`, each with `reviewSince`, sorted oldest first.
- `src/shared/i18n/it.ts` -- `shell.nav.toReview` becomes the item label "Da approvare"; add `toReview.heading/lead/empty`.
- `src/app/(tool)/_components/sidebar.test.tsx`, `layout.test.tsx` -- update for no counts.

## Tasks & Acceptance

**Execution:**
- [ ] `src/modules/case-study/{ports,adapters/supabase}/case-study-repository.ts`, `application/list-to-review.ts`, `index.ts` -- `listToReview` with unit tests for order, re-entry, fallback and event-read failure -- the queue's order lives in the module, not the page.
- [ ] `src/app/(tool)/to-review/page.tsx` (+ `page.test.tsx`) -- server page: policy as Case page, `PageHeader`, `CaseStudiesTable` with `showStatusFilter={false}`, `initialSort={null}`, `showCreate={false}`, `emptyMessage` from `it` -- the queue view.
- [ ] `case-studies-table.tsx` (+ test) -- the two props -- reuse without forking the table.
- [ ] `sidebar.tsx`, `layout.tsx` (+ tests) -- remove counts, add the item -- owner ask.
- [ ] `src/shared/i18n/it.ts` -- copy.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.4, 3.5, 6.1, 6.2, 6.3 → done (merged); 4.1 tracked by the build flow.

**Acceptance Criteria:**
- Given any role, when the sidebar renders, then no item shows a number.
- Given an owner/designer, when they open **Da approvare**, then they see only Da approvare cases, oldest first, and the item is marked current.
- Given the queue, when a header is clicked, then the table sorts by that column like the Case page.

## Design Notes

Ordering by event, not `updated_at`: edits in the configurator (4.3) will touch the case while it waits, which would reshuffle the queue.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npx vitest run` -- expected: all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log
