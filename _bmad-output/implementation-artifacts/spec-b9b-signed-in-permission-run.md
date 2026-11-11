---
title: 'B9 part 2: permission matrix against the database with a signed-in user per role (rest of Story 6.4)'
type: 'chore'
created: '2026-11-11'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-b9a-guardrail-and-permission-suite.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The permission suite (`test/permissions.test.ts`) checks every server action for every role, but with the modules stubbed and the actor faked. Nothing proves end to end, against a real database and real sign-in, that each role gets exactly what the matrix allows (Story 6.4: "every AD-11 matrix cell is checked end to end through the real actor resolver").

**Approach:** The DB test run signs in one real test user per role (owner/designer, admin, account/sales/social) and runs the permission matrix through the real `getActor`, `authorize` and modules against the local Supabase stack: every denied action returns `FORBIDDEN` and writes nothing, and representative allowed actions succeed on seeded data.

## Boundaries & Constraints

**Owner decisions (2026-11-11):** this is part 2 of B9; part 1 (#168) built the guardrail suite, the complete action list and the checklist.

**Always:**
- **Test users:** three Auth users with profiles, one per role, created idempotently and signed in once each in the DB run's global setup (Auth rate limit), extending `test/helpers/db-actor.ts`. The existing owner/designer user and its tests stay as they are.
- **Matrix, end to end** (new `test/db/permissions.db.test.ts`), for each role:
  - every server action EXPECTED denies to that role returns `FORBIDDEN`, and a database snapshot taken before and after shows no row changed;
  - the allowed actions run for real on seeded data (a client, an approved case, a draft case, a collection): owner/designer and admin can create, edit and approve; account/sales/social reach approved cases only, can export, download a client pack, list clients with an approved case and edit a collection's text, but cannot create, edit, approve or delete cases, clients or intros;
  - the admin has every owner/designer permission plus Organizzazione (owner 2026-10-28) and no action changes a guardrail or permission;
  - a disabled profile and no session are refused (401).
- **Same list as part 1:** the expected outcome per action and role comes from the EXPECTED map of `test/permissions.test.ts` (shared, not copied), so the two can't drift.
- **Tagged:** the run is tagged so `docs/guardrail-check.md` can name it as the signed-in proof of NFR3; the doc's "not built" entry for it is removed.
- Runs in CI's existing `db` job (`npm run test:db`).

**Never:**
- Production code changes, policy changes, or seeding real (non-local) projects.
- Calling external services (no AI, no export rendering beyond enqueueing).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| Denied | Account user calls `updateClient` | Refused, no row changed | `FORBIDDEN` |
| Allowed | Account user exports an approved case | Job enqueued | — |
| Approved only | Account user reads a draft case | Not found / refused | `NOT_FOUND` or `FORBIDDEN` |
| Collection text | Account user edits a collection text | Saved; no revision, client or intro row changed | — |
| Admin | Admin approves a case, opens Organizzazione | Allowed | — |
| Guardrail | Any role | No action changes a guardrail or permission | `FORBIDDEN` |
| Disabled | Profile disabled | Refused | 401 |
| No session | No cookies | Refused | 401 |

</frozen-after-approval>

## Code Map

- `test/helpers/db-actor.ts:75-125`: `ensureTestActor` (one user `db-test-owner@…`, profile upsert as `owner_designer`) and `signInTestActor` (returns cookies). Generalise to a role-keyed set of users; keep the owner one's id/email so existing tests don't change.
- `test/db/global-setup.ts`: signs in once and `provide("dbActorCookies", …)`. Add per-role cookies (e.g. `dbRoleCookies`) signed in once each.
- `test/db/setup.ts:10-11`: mocks `next/headers` `cookies()` with `TestCookieStore(inject("dbActorCookies"))`. The new test needs to switch the store per role (e.g. a mutable current-role cookie store exported for tests).
- Existing role-flip pattern: `test/db/case-study.db.test.ts:266,362` updates `profile.role` with SQL; prefer real per-role users here.
- `test/permissions.test.ts`: EXPECTED map (file → action → allowed roles) and discovery from part 1; export it (or move it to a shared `test/helpers/permission-matrix.ts`) so the DB run reads the same expectations.
- Snapshot helpers: `test/db/collection.db.test.ts` `originals()` is the pattern for "no row changed".
- `vitest.db.config.mts:16`, `scripts/test-db.sh`, `.github/workflows/ci.yml` `db` job.
- `docs/guardrail-check.md`: NFR3 section and "not built" list.

## Tasks & Acceptance

**Execution:**
- [ ] `test/helpers/db-actor.ts`, `test/db/global-setup.ts`, `test/db/setup.ts` -- one signed-in user per role, switchable cookie store.
- [ ] Shared EXPECTED (`test/helpers/permission-matrix.ts` or export) -- one source for both suites.
- [ ] `test/db/permissions.db.test.ts` -- the end-to-end matrix with seeded data and before/after snapshots.
- [ ] `docs/guardrail-check.md` -- name the signed-in run; remove it from "not built".
- [ ] `sprint-status.yaml` -- 6.4 to `done`.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:guardrails`, `test:db` and `build`, when they run, then they pass.
- Given the existing DB tests, when they run, then they pass unchanged.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:guardrails` -- expected: pass.
- `npm run test:db` -- expected: pass, including the new per-role run.
- `npm run build` -- expected: pass.
