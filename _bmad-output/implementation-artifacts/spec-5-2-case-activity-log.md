---
title: 'Story 5.2 (part): activity log on the approved case page'
type: 'feature'
created: '2026-10-29'
status: 'done'
baseline_commit: 'beef910934a754f61808470bd80335191758b408'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/.claude/skills/mac-recap-ui/SKILL.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The approved case page (`/case-studies/{id}`) doesn't show what happened to the case. The owner asked for its activity log on 2026-10-28; it was split from spec-5-2-elimina-approved-case.

**Approach:** Add an **Attività** card to the page that reuses Home's *Attività*: the same `case_event` types, the same run grouping, sentences and icons, and the same relative time with the full date on hover. It is filtered to this case and newest first, and it sits between **Raccolte** and **Elimina**.

**Decisions (owner, 2026-10-28):** Same sentences and icons as Home. Split from the Elimina spec and built right after it.

## Boundaries & Constraints

**Always:** Every role that can open the page sees the card; the page has already authorized `view`, so no new permission is needed. Read only this case's events, and never a deleted case's. The Home page's look and behaviour stay exactly as they are. Copy comes only from `it.ts`. Follow the mac-recap-ui house rules.

**Never:** No new event types. No `case_deleted` or favourite events. No filters, paging or export. No migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal | Approved case with events | Lines newest first, grouped by run as on Home, none a link | N/A |
| Read fails | `CASE_ACTIVITY_LOOKUP_FAILED` or `CASE_ACTIVITY_INVALID` | The card shows Home's `failed` line; the rest of the page renders | No throw |
| No events | An empty list (seeded data) | The card shows "Ancora nessuna attività." | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/case-study/adapters/supabase/case-activity.ts` -- `listCaseActivity(scope, limit)`. Add `listActivityOfCase(caseId, limit)`, or an optional `caseId` filter, using the same columns, types, ordering and parsing plus `.eq("case_id", caseId)`. Keep `case.deleted_at is null`.
- `src/modules/case-study/index.ts:222` -- `listActivity(scope)`. Add `listCaseActivity(caseId)`, documented as "call only after the page authorized `view`". A malformed id is `INVALID_INPUT` (use `z.uuid()` via `parseInput`). The limit is `ACTIVITY_LIMIT`.
- `src/app/(tool)/home/page.tsx:128-215` -- `ACTIVITY_ICON`, `ActivitySentence` and `Activity`. Move them, unchanged, to `src/app/(tool)/_components/activity-card.tsx`. Add props for the heading id and the empty text, and allow `href` to be null for each line (the case page passes no link). Home keeps its exact markup and behaviour: three entries tall, scrolling inside the card, rows linking via `caseHref`.
- `src/app/(tool)/home/_lib/activity-lines.ts` -- `activityLines` and its test. Move them to `src/app/(tool)/_lib/activity-lines.ts`, unchanged, and update imports.
- `src/app/(tool)/case-studies/[caseId]/page.tsx` -- add `caseStudy.listCaseActivity(id)` to the `Promise.all`. Pass `activityLines(...)`, or `null` on failure, to `CaseView`.
- `src/app/(tool)/case-studies/_components/case-view.tsx` -- render the card between Raccolte and Elimina, with no `more` link and no row links.
- `src/shared/i18n/it.ts` -- add `caseView.activityEmpty`: "Ancora nessuna attività.".
- `test/db/case-study.db.test.ts:509` -- the `listActivity` suite to copy for one case.

## Tasks & Acceptance

**Execution:**
- [x] Adapter, index and use-case wiring, with a DB test: only this case's events, newest first, nothing from another case, nothing for a deleted case, and only `ACTIVITY_TYPES`.
- [x] Move `activityLines` and its test, and extract `ActivityCard` from the Home page. Home's tests keep passing unchanged.
- [x] Page and `CaseView`, with tests: the card renders lines, the failed line and the empty line; it sits after Raccolte and before Elimina; it has no links.
- [x] `it.ts`: `activityEmpty`.
- [x] Planning: the 5.2 note in `epics.md` says the activity log is built. Mark the deferred-work entry resolved.

**Acceptance Criteria:**
- Given an approved case that was created, given material, generated and approved, when its page loads, then **Attività** lists those steps as Home phrases them, newest first.
- Given Home, when it loads, then its *Attività* looks and links exactly as before.

## Implementation Notes

- `CaseView` and `ActivityCard` take a `now` (the server's time) so the page and the browser format "how long ago" alike; Home passes none and is unchanged. Times don't tick while the page stays open.
- `epic-5-context.md` was recompiled for this spec (it also picks up the Elimina changes merged in #121).
- Verified: typecheck, lint, `npm test`. The new DB suite runs in CI (no Supabase here). Not checked in a browser.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | No Home test checks the empty *Attività* line, now a caller prop (verification) | medium | `ActivityCard` takes `empty`; no Home assertion reads it | patch |
| 2 | Adapter `listCaseActivity(scope)` clashes with the module's `listCaseActivity(caseId)`, aliased to the helper's name (blind) | low | Two functions, one name, different arguments; a rename is direct | patch (`listScopeActivity`; `{ ...scope }` dropped) |
| 3 | `epics.md` 2026-10-29 note glued to the previous note's line (blind) | low | Direct correction | patch |
| 4 | `epic-5-context.md` still calls the activity log the next spec (blind, edge) | low | Direct correction | patch |
| 5 | `listCaseActivity(caseId)` trusts the caller to have authorized `view` (blind) | false | Same contract as `listActivity`, `list` and `get`: module reads take no actor; pages and actions authorize first | reject |
| 6 | `INVALID_INPUT` not in the matrix or page tests (blind) | low | Unreachable after `get(id)` succeeded; the page shows the failed line anyway | reject |
| 7 | No test at the 100-event limit; a run cut by it undercounts (blind) | low | Same limit and behaviour as Home; a case rarely reaches 100 shown events | reject |
| 8 | `ActivityCard` heading and failed text still under `it.home` (blind) | low | Same words on both pages; moving keys is churn | reject |
| 9 | Frozen `now` keeps relative times from ticking (blind) | low | Accepted for hydration; noted above | reject |
| 10 | Tests read `span > span`, count `svg`s and assume Europe/Rome (blind) | low | Brittle but correct; `format.ts` fixes the zone | reject |
| 11 | Bookkeeping: deferred-work resolved entry format, stale Code Map lines (blind) | low | Matches the file's existing resolved entries; Code Map is planning-time | reject |
| 12 | Unlinked rows lack `-mx-2 px-2`; list labelled twice (blind) | low | Carried over unchanged from Home | reject |
| 13 | Unparsable `now` would throw (edge) | false | Only the page passes it, always `toISOString()` | reject |
| 14 | Case deleted between `get` and the activity read shows an empty card (edge) | low | Needs a delete racing the load; the next navigation redirects | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass
- `npm run test:db` -- expected: the new suite passes (needs local Supabase; CI runs it)
