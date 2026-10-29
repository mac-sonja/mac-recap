---
title: 'Story 5.2 (part): activity log on the approved case page'
type: 'feature'
created: '2026-10-29'
status: 'draft'
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
- [ ] Adapter, index and use-case wiring, with a DB test: only this case's events, newest first, nothing from another case, nothing for a deleted case, and only `ACTIVITY_TYPES`.
- [ ] Move `activityLines` and its test, and extract `ActivityCard` from the Home page. Home's tests keep passing unchanged.
- [ ] Page and `CaseView`, with tests: the card renders lines, the failed line and the empty line; it sits after Raccolte and before Elimina; it has no links.
- [ ] `it.ts`: `activityEmpty`.
- [ ] Planning: the 5.2 note in `epics.md` says the activity log is built. Mark the deferred-work entry resolved.

**Acceptance Criteria:**
- Given an approved case that was created, given material, generated and approved, when its page loads, then **Attività** lists those steps as Home phrases them, newest first.
- Given Home, when it loads, then its *Attività* looks and links exactly as before.

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: all pass
- `npm run test:db` -- expected: the new suite passes (needs local Supabase; CI runs it)
