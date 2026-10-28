---
title: 'Story 4.1: Da approvare queue in the Case table; no client count in the sidebar'
type: 'feature'
created: '2026-10-28'
status: 'done'
route: 'dispatch'
baseline_commit: 'e494a9525550c5fb97b11bd63b669f521e8762a9'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cases waiting for approval have no queue: the Case table's Da approvare filter sorts them by last update, so the case waiting longest can sit anywhere. The sidebar also shows a client count the owner does not want.

**Approach:** When the Case table's status filter is Da approvare and no column header has been clicked, rows sort oldest first by when each case entered Da approvare; empty, it says "Niente da approvare.". `/case-studies?status=in_review` opens the page with that filter selected. The sidebar loses the client count.

## Boundaries & Constraints

**Always:**
- Owner decision 2026-10-28: the sidebar keeps the "{n} da approvare" note next to Case exactly as today; the number next to Clienti goes; no new sidebar item.
- "Entered Da approvare" = the `at` of the case's latest `transition` event whose `data.to` is `in_review`; a case with no such event, or when the event read fails (logged), falls back to its `updatedAt`. Ties keep incoming order.
- A header click sorts by that column as today, and keeps doing so when the filter changes. Every other filter's default stays Updated, newest first.
- Same policy and scope as today (`listScopeFor` + `authorize`); any owner/designer sees every waiting case; no assignment or claiming.
- Italian copy via `it.ts`; house UI rules from the mac-recap-ui skill.

**Never:**
- No migration, no new table, column or route, no new sidebar item.
- No Delete row action: owner decision 2026-10-22 keeps **Elimina bozza** inside the opened draft (already built, with `CASE_NOT_DELETABLE`).
- Do not touch configurator files (`src/app/(wizard)/_components/configurator/**`, `[caseId]/configurator/**`) nor the row `href` logic in the table: 4.2a/4.2b edit it.
- No change to the status filter counts or the Home dashboard.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Queue order | Da approvare filter; A entered Mon, B Tue, C no event (updated Wed) | rows A, B, C | N/A |
| Re-entered | A entered Mon, left, entered again Thu; B entered Tue | rows B, A | N/A |
| Header click | queue shown, user clicks Nome | sorted by name; stays so on switching filter | N/A |
| Other filter | Tutti / Bozza, no click | Updated newest first, as today | N/A |
| Empty queue | no case in Da approvare, no search | "Niente da approvare." | N/A |
| Deep link | `?status=in_review` (`?status=bogus` → Tutti) | filter preselected | invalid value ignored |
| Event read fails | case_event query errors | every row uses `updatedAt`; page renders | logged |

</frozen-after-approval>

## Code Map

- `src/app/(tool)/_components/sidebar.tsx` -- drop the `clientCount` prop and the Clienti `meta`; keep `NavLink.meta` and `toReviewCount`.
- `src/app/(tool)/layout.tsx` -- `sidebarCounts`: stop listing clients; keep the to-review count.
- `src/modules/case-study/{ports,adapters/supabase}/case-study-repository.ts` -- add `reviewSince(caseIds)` → `Map<caseId, at>` from `case_event` (`type = 'transition'`, `data->>to = 'in_review'`, newest per case; `CASE_EVENT_COLUMNS` has `at`).
- `src/modules/case-study/application/` + `index.ts` -- export `reviewSince(cases)`: for each `in_review` case, the event `at` or `updatedAt`; read failure → all fallback, logged, never an error result.
- `src/app/(tool)/case-studies/page.tsx` -- read `?status=` (one of `CASE_STATUSES`), call `reviewSince`, put `reviewSince` on each row, pass `initialStatus`.
- `src/app/(tool)/case-studies/_components/filter-sort.ts` -- optional `CaseStudyRow.reviewSince?: string`; a review-order sort (ascending, fallback `updatedAt`).
- `src/app/(tool)/case-studies/_components/case-studies-table.tsx` -- `sort` state becomes `SortState | null` (null = not clicked: review order on Da approvare, `DEFAULT_SORT` otherwise; header shows no arrow on review order); `initialStatus` prop; empty Da approvare message. Shared with `clients/[clientId]/page.tsx` (rows without `reviewSince` fall back).
- `src/shared/i18n/it.ts` -- add `caseStudies.noneToReview: "Niente da approvare."`.

## Tasks & Acceptance

**Execution:**
- [x] case-study module (repository port + Supabase adapter + application + index) with unit tests for the matrix's order, re-entry and read-failure rows -- the source of the queue order.
- [x] `filter-sort.ts` (+ `filter-sort.test.ts`) -- review-order sort.
- [x] `case-studies-table.tsx` (+ test) -- null sort, `initialStatus`, empty message.
- [x] `case-studies/page.tsx` (+ `page.test.tsx`) -- `?status=`, `reviewSince` on rows.
- [x] `sidebar.tsx`, `layout.tsx` (+ tests) -- no client count.
- [x] `src/shared/i18n/it.ts` -- copy.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.4, 3.5, 6.1, 6.2, 6.3 → done (merged).

**Acceptance Criteria:**
- Given any role, when the sidebar renders, then Clienti shows no number and Case still shows "{n} da approvare" when n > 0.
- Given an approved-only actor (Libreria), when nothing changes for them, then their pages behave as before.

## Design Notes

Ordering by event, not `updated_at`: configurator edits (4.3) will touch a case while it waits and would reshuffle the queue.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npx vitest run` -- expected: all pass.

## Implementation Notes

- Queue order comes from `case-study.reviewSince(cases)` (new `application/review-since.ts`, adapter queries `case_event` in chunks of 100). The page always calls it; it never fails.
- Table `sort` is `SortState | null`; null + Da approvare = `sortByReviewOrder`, no header arrow.
- Real-DB test added in `test/db/case-study.db.test.ts`; not run locally (no Docker), runs in CI (`npm run test:db`).
- Owner 2026-10-28 (after review): the "{n} da approvare" note is its own link to `/case-studies?status=in_review`, laid over the Case item (links can't nest).
- Lint, typecheck and `vitest run` pass under Node 22 (`package.json` asks for 24; installed with `--engine-strict=false`).

## Spec Change Log

- 2026-10-28, owner at approval: keep the "{n} da approvare" note next to Case; no Da approvare sidebar item. The `/to-review` page is dropped; the queue lives in the Case table's Da approvare filter, reachable by `?status=in_review`.

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence / route |
|---|-------|---------|---------|------------------|
| 1 | verification-gap | `reviewSince` query only checked against a stub | medium | No test under `test/` runs it; a wrong filter would silently fall back to `updatedAt`. patch: DB test. |
| 2 | blind | Nothing links to `?status=in_review`; the "{n} da approvare" note goes to plain `/case-studies` | medium | Sidebar `NavLink` href is `/case-studies`. intent_gap: owner asked to keep the note and add no item; where it links is the owner's call. Asked at hand-off rather than reverting working code. |
| 3 | blind | Filter not written back to the URL | low | Real, but needs router sync logic; rejected (low, adds complexity). |
| 4 | blind | Queue order not visible in any column | maybe-false | Whether owners find it confusing needs a look in the app; rejected (would be low). |
| 5 | blind | No way back to queue order after a header click | false | Frozen intent: a clicked sort holds across every filter; reload restores it. |
| 6 | blind | Empty queue shows "Azzera i filtri" | low | It switches to Tutti, a sensible next step; rejected (cosmetic). |
| 7 | blind | sprint-status task missing from diff | false | Diff was `src/` only; `sprint-status.yaml` already has 3.4, 3.5, 6.1–6.3 done. |
| 8 | blind, edge | One failed chunk discards the others; serial chunks | low | Needs over 100 waiting cases and a failure; rejected. |
| 9 | blind | Extra `case_event` read on every load | low | One query, only when a case is waiting; rejected. |
| 10 | blind, edge | `Date.parse` NaN breaks the sort | false | Both values are timestamptz strings from Postgres, validated ISO by the schemas. |
| 11 | blind | Test nits (dead `listClients` mocks, regex without `s`, tiebreak unchecked) | low | No user or developer harm; rejected. |
| 12 | edge | >1000 events per chunk truncated by max_rows | low | Would need ~10 re-entries per case on average; rejected. |
| 13 | edge | `data` null with no error throws | false | supabase-js returns `[]` for an empty select; types make `data` non-null when `error` is null (typecheck passes). |
