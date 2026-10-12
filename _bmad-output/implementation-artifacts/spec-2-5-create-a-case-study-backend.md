---
title: 'Story 2.5 (backend, part 1): Create a case study with a permanent ID'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '52475a2475e2f77bc7a0527918e365ab1a8c04b5'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ci-supabase-harness.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nothing can store a case study yet: no table, no permanent ID, no event log.

**Approach:** A forward-only migration for `case_study` and append-only `case_event`, the `case-study` module's domain (input schema), use cases (create, get, record event), a Supabase adapter, and a `createCaseStudy` server action. Backend only.

## Boundaries & Constraints

**Always:** Columns per the Story 2.5 AC: `case_study(id uuid default gen_random_uuid(), name, client, year, locale it|en default it, status default draft, project_order_ref null, head_revision_id null, approved_revision_id null, head_version int default 0, created_by → profile, created_at, updated_at, deleted_at)`; `case_event(id, case_id → case_study, revision_id null, actor_id → profile, type, at default now(), data jsonb)`. Status check uses the AD-3 set (`draft, generating, in_review, approved`). RLS on both, no policies, all revoked from `anon`/`authenticated`. Use cases return `Result`; codes `INVALID_INPUT`, `NOT_FOUND`. Server action: `getActor()` then `authorize(actor, 'create case')` first. **Decision (atomicity):** create writes the case and its `case_created` event in one Postgres function called by the adapter. **Decision (DB guards):** triggers reject changing `case_study.id`, any `DELETE` on `case_study` (soft delete only), and any `UPDATE`/`DELETE`/`TRUNCATE` on `case_event`. **Decision (revision ids):** plain nullable uuids, no FK until the revision table exists (Epic 3). **Decision (types bootstrap):** hand-write `db.types.ts` additions, then commit the CI `db-types` artifact. **Decision (scope split):** `transition()`, the status-write trigger and the static status-write test are Story 2.5 backend part 2; part 1 has no code path that writes `status`.

**Never:** No pages, wizard or UI copy. No revision table, transitions, generation, approval or delete use case. No `project_order_ref` writes. No writes to `case_study.status`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | owner/designer, name, client, year, locale omitted | `ok(case)` status `draft`, locale `it`, `created_by` actor, exactly one `case_created` event with the actor id | N/A |
| Missing field | name or client empty/whitespace | `err INVALID_INPUT` naming each missing field; nothing written | N/A |
| Bad year/locale | non-integer or year outside 1900–2100, locale not it/en | `err INVALID_INPUT`; nothing written | N/A |
| Forbidden | actor whose role can't `create case` | 403 `FORBIDDEN`, use case never called | N/A |
| Get | existing id / unknown or soft-deleted id | `ok(case)` / `err NOT_FOUND` | N/A |
| Record event | case id, type, actor, data | one `case_event` row | unknown case → `err NOT_FOUND` |
| Direct writes | update `id`, delete case, update/delete/truncate an event | DB error | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/` -- forward-only; new `<UTC ts>_case_study.sql` after `20261009120000_access_profile.sql`. `profile(id)` is the FK target.
- `src/modules/case-study/{index.ts,domain/,application/}` -- empty today; add `ports/` + `adapters/supabase/` (vendor seam). Mirror `src/modules/access` (ports, `make*` factories, wired exports in `index.ts`).
- `src/modules/access` -- `authorize`, `Actor`, `CaseStatus`/`CASE_STATUSES` (reuse, don't redefine). Its service-role client is internal; `case-study` gets its own admin client in its adapters (adapters may not import another module's internals).
- `src/shared/db.types.ts` -- generated, unformatted; add the two tables and the create function in the same shape.
- `test/authorize-guard.test.ts` -- covers the new `"use server"` file automatically.
- `test/db/profile.db.test.ts`, `scripts/test-db.sh` -- pattern for DB tests (`pg` pool, `set local role`, real adapters via lazy import).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<ts>_case_study.sql` -- tables, checks, RLS/revokes, `updated_at` trigger, guard triggers, `create_case_study` function (service role only)
- [x] `src/modules/case-study/domain/*.ts` + tests -- `CaseStudy` schema, `createCaseStudyInput` zod (trimmed, year integer 1900–2100, locale default it)
- [x] `src/modules/case-study/application/*.ts` + tests (fake repository) -- `create`, `get`, `recordEvent`
- [x] `src/modules/case-study/ports/`, `adapters/supabase/*.ts`, `index.ts` -- repository and public surface
- [x] `src/app/(tool)/case-studies/actions.ts` + test -- `createCaseStudy` server action
- [x] `src/shared/db.types.ts` -- hand-written additions
- [x] `test/db/case-study.db.test.ts` -- every matrix row from Create to Direct writes against the real stack, plus RLS lockout on both tables

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.
- Given the PR, when the CI `db` job runs, then the migration applies and every DB test passes; the types step passes or uploads the generated file.

## Implementation Notes

- The repository port lives in `src/modules/case-study/ports/case-study-repository.ts` (the Code Map's `ports/`), not `application/ports.ts` as in `access`.
- `createCaseStudy` returns `{ ok: false, status, error: { code, message } }` using `access.httpStatusFor`; `details` stay server-side, except `INVALID_INPUT` adds `fields` (names only) for the coming wizard.
- The DB "Forbidden" test flips the dev profile's role to `account_sales_social` and restores it in `finally` (and in `beforeAll`), because `getActor()` reads via PostgREST on its own connection.
- Case rows can never be deleted, so DB tests assert on their own rows or before/after counts.

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | verification-gap | "truncating case_study" regex also accepts the cascaded `case_event` trigger message | low | `cascade` fires `case_event_reject_truncate` ("append-only"), so a missing `case_study` truncate trigger still passes | patch |
| 2 | verification-gap | No test stores a non-null `revisionId` via `recordEvent` | low | Every test passes or asserts `null`; dropping the adapter's `revision_id` mapping goes unnoticed | patch |
| 3 | verification-gap, blind | Locale and year checks not pinned to `LOCALES` / `YEAR_MIN` / `YEAR_MAX` | medium | Only status has a drift test; a drift makes a valid create a 500 instead of `INVALID_INPUT` | patch |
| 4 | blind, verification-gap (other) | Fake writes `case_created` with `{}`; DB test asserts only `expect.any(Object)` | low | `create_case_study` writes `{name, client, year, locale}`; neither suite pins it; fix is a direct correction | patch |
| 5 | blind, edge | `recordEvent` accepts reserved types (e.g. `case_created`) | low | Real, but callers are trusted server code and the fix adds a reserved-type guard; part 2 can reserve `transition` with `transition()` | reject |
| 6 | blind, edge | Events can be appended to a soft-deleted case | false | Story 4.1 must record a delete event on a soft-deleted case; the matrix's "unknown case" means no row, which the FK check catches | reject |
| 7 | blind | `get` has no authorization path | false | AR11 puts `authorize` in actions and routes, not in module functions (as with `create`); no caller of `get` exists yet | reject |
| 8 | blind, edge | `created_by` / `created_at` rewritable, `deleted_at` clearable | low | No code path writes them; the fix adds trigger branches beyond the spec's id/delete guards | reject |
| 9 | blind | Action returns field names but not field messages | false | The Italian UI maps field names to dictionary copy; English schema messages must not reach the UI (UX-DR29) | reject |
| 10 | blind, edge | `name`, `client`, event `type` and `data` have no size limits | low | Internal tool, owner/designer input only; fix adds max lengths and check constraints | reject |
| 11 | blind | `case_event.data` not checked as a JSON object | low | Only a raw SQL insert can write a non-object; the adapter validates with zod; fix adds a constraint | reject |
| 12 | blind, edge | Create is not idempotent (double submit) | low | No UI caller yet; duplicates are Bozza drafts, deletable in Story 4.1; fix adds a request-id parameter | reject |
| 13 | edge | Post-commit `toCaseStudy` failure returns 500 after the case was committed | false | DB checks match the domain schema, so a committed row always parses | reject |
| 14 | blind | DB suite flakes under parallel files (role flip, table counts) | false | `vitest.db.config.mts` sets `fileParallelism: false` | reject |
| 15 | blind | `failure()` and the adapter's FK-name branch untested in unit tests | low | The DB suite covers unknown case → `NOT_FOUND`; the Postgres FK message always names the constraint | reject |
| 16 | edge | `fields` not a string array could leak details | false | `parseInput` always builds `fields` as a string array; no other path sets `INVALID_INPUT` | reject |
| 17 | edge | Action throws an unshaped error if `getActor` or env throws | low | `getActor` returns `Result`; Next masks thrown action errors in production; fix adds a try/catch | reject |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0

**Manual checks (if no CLI):**
- No local Docker: DB rows are proven only by the CI `db` job.
