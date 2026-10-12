---
title: 'Story 2.5 (backend, part 2): Case status changes only through transition()'
type: 'feature'
created: '2026-10-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '24a954bae2143074752fc3d9ed8c651a2261d852'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-create-a-case-study-backend.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `case_study.status` can be written by any service-role update, so Epics 3–4 could set statuses from several places (AD-3 forbids this) and no lifecycle step is logged.

**Approach:** One `case-study.transition(caseId, event, actor)` use case. The AD-3 transition table lives in the domain; a Postgres function does the compare-and-set on status and writes a `transition` event in one transaction; a trigger rejects any other status change; a static test proves no other code writes status.

## Boundaries & Constraints

**Always:** Transition table (domain, the single definition): `generate` draft→generating · `generation_succeeded` generating→in_review · `generation_failed` generating→draft (job failure or discarded result) · `approve` in_review→approved. Any other (status, event) pair is `INVALID_TRANSITION`; `approved` has no outgoing transition. The function takes the expected `from` and the `to` the domain computed, updates only a non-deleted row whose status still equals `from`, and in the same transaction appends a `case_event` of type `transition` with `data {event, from, to}` and the actor. A trigger rejects any status change not made inside that function (errcode `P0001`). Codes: `INVALID_TRANSITION`, `STALE_STATUS` (status moved since read), `NOT_FOUND` (unknown or soft-deleted case). The module function takes an already-authorized actor, like `create`; `authorize` stays in callers (AR11).

**Never:** No server action, UI, job or caller of `transition` (Epics 3–4 add them). No transitions for fork, update approved version or discard (they don't change status). No delete use case. No `head_version` or revision-pointer changes. No status table or event list in the database other than the existing status check.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Each allowed edge | case in `from`, matching event | `ok(case)` with status `to`; one `transition` event `{event, from, to}` with the actor | N/A |
| Invalid pair | e.g. `approve` on draft, any event on approved, unknown event | `err INVALID_TRANSITION`; nothing written | N/A |
| Stale | status changed between read and write | `err STALE_STATUS`; nothing written | N/A |
| Missing | unknown, malformed or soft-deleted id | `err NOT_FOUND`; nothing written | N/A |
| Direct write | `update case_study set status = …` outside the function | DB error; row unchanged | N/A |
| Other updates | soft delete, `updated_at` touch | still allowed | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261009140000_case_study.sql` -- part 1, applied; never edit. Copy its style (plpgsql, `set search_path = ''`, errcode `P0001`, revokes, `service_role`-only grants as on `create_case_study`). BEFORE UPDATE triggers fire alphabetically.
- `src/modules/case-study/domain/` -- add the transition table + `nextStatus(from, event)` returning `Result`; reuse `CASE_STATUSES` from `src/shared/case-status.ts`; export a `TRANSITION` event-type constant beside `CASE_CREATED` in `case-event.ts`.
- `src/modules/case-study/ports/case-study-repository.ts`, `adapters/supabase/case-study-repository.ts` -- add a `transition` repository method calling the new rpc. It must tell stale and missing apart from a write failure (today every rpc error becomes `*_WRITE_FAILED`).
- `src/modules/case-study/application/` -- `makeTransition(repo)` following `create-case-study.ts`; tests extend the `fakeRepository()` in `use-cases.test.ts`.
- `src/modules/case-study/index.ts` -- export `transition`, the event names and their type.
- `src/modules/access/index.ts` `STATUS_BY_CODE` -- map `INVALID_TRANSITION` and `STALE_STATUS` to 409 (+ the table test in `index.test.ts`).
- `src/shared/db.types.ts` -- add the function by hand in the generator's shape, as part 1 did; CI's `db-types` diff check is the arbiter.
- `test/secret-key.test.ts` -- pattern for a static file-scanning test.
- `test/db/case-study.db.test.ts` -- `inRolledBackTx`, `createCase()`, `counts()`; DB tests go here.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<UTC ts>_case_study_transition.sql` -- transition function + status-guard trigger (+ revokes/grants)
- [x] `src/modules/case-study/domain/*` + tests -- transition table, `nextStatus`, event names
- [x] `src/modules/case-study/{ports,adapters/supabase,application,index.ts}` + use-case tests -- `transition` end to end
- [x] `src/modules/access/index.ts` + test -- 409 mappings
- [x] `src/shared/db.types.ts` -- function entry
- [x] `test/case-status-writes.test.ts` -- static test: outside the new migration's function, no file in `src/` or `supabase/migrations/` writes `case_study.status` (no `.from("case_study")` insert/update/upsert in TS; no SQL `update … case_study … set … status`); include a planted-violation fixture or in-test string to prove the scanner catches one
- [x] `test/db/case-study.db.test.ts` -- every matrix row against the real stack, plus: anon/authenticated can't execute the function; an event row exists only when the status changed

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then both migrations apply and every DB test passes.

## Implementation Notes

- The function also raises `INVALID_TRANSITION` when `p_from` equals `p_to` (backstop; the domain never produces it), and resets the flag right after its update so it never stays on for the rest of the transaction.
- The adapter maps P0001 refusals by exact message (`NOT_FOUND`, `STALE_STATUS`, `INVALID_TRANSITION`); anything else is `CASE_STUDY_WRITE_FAILED`.
- The static test bans every TS insert/update/upsert on `case_study`; Story 4.1's soft delete will need a function or a narrower rule there.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | verification-gap, blind | Adapter `NOT_FOUND` mapping never exercised (soft delete racing a transition) | medium | `findById` filters unknown and deleted ids before the rpc; only `STALE_STATUS` is called through the adapter; a broken key would surface as 500s | patch |
| 2 | blind, edge | `nextStatus` `String(event)` can throw on a null-prototype or throwing-`toString` object | low | `String(Object.create(null))` throws TypeError; one-expression fix | patch |
| 3 | blind, edge | Status guard covers UPDATE only; a raw INSERT can start a row in any status | low | No code path inserts a status (`create_case_study` uses the default; TS inserts are banned by the static test); intent covers status changes; fix adds a trigger branch | reject |
| 4 | blind, edge | DB doesn't check that (event, from, to) is an AD-3 edge | false | Frozen intent: "No status table or event list in the database"; the domain table is the single definition | reject |
| 5 | blind, edge | Any session can set the GUC and bypass the trigger | low | Needs a deliberate `set_config`; Design Notes record it as an accident guard; a non-spoofable marker is a redesign | reject |
| 6 | blind, edge | Static scanner blind spots (SQL inserts, subquery FROM in SET, non-literal table names, seed/scripts) | low | No such writers exist; widening the regexes adds complexity and false positives | reject |
| 7 | blind | `create or replace` of the sanctioned function would be flagged | false | Failing loudly is intended: a redefinition must update the test's sanctioned path | reject |
| 8 | blind | No concurrent-transition DB test | low | A single `UPDATE … where status = p_from` re-checks under the row lock (READ COMMITTED), so the loser gets STALE_STATUS; a race test would be flaky | reject |
| 9 | blind | Event parsed twice; the second `parse` could throw | false | `nextStatus` succeeded with the same schema, so `parse` cannot fail | reject |
| 10 | blind | Inconsistent `details` keys in adapter errors | false | `details` never reach logs or clients; no consumer reads them | reject |
| 11 | blind | Bad actor id reported as a generic 500 | false | The actor comes from `getActor()`, which reads it from `profile` | reject |
| 12 | blind | Spec file absent from the reviewed diff | false | By design: the spec goes only to the edge-case layer | reject |
| 13 | verification-gap (other) | Adapter `INVALID_TRANSITION` mapping and SQL from=to guard unreachable via `transition()` | false | Backstop only; `nextStatus` never yields from = to | reject |
| 14 | verification-gap (other) | The static test is text-based | false | The runtime trigger is exercised by the DB suite's direct-write tests | reject |
| 15 | edge (claim) | "A trigger rejects any other status change" overstates (INSERT, GUC) | low | Same root causes as #3 and #5 | reject |
| 16 | edge (claim) | "Static test proves no other writer" overstates | low | Same root cause as #6 | reject |
| 17 | blind | Unexpected P0001 message falling through to `CASE_STUDY_WRITE_FAILED` untested | low | Fall-through is the default branch; covered in effect by #1's added test | reject |

## Design Notes

Sanctioned writer: the function sets a transaction-local flag (`set_config('mac_recap.status_transition', 'on', true)`) before its update; the trigger allows `new.status is distinct from old.status` only when `current_setting('mac_recap.status_transition', true) = 'on'`.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0

**Manual checks (if no CLI):**
- No local Docker: DB tests are proven by the CI `db` job.
</content>
