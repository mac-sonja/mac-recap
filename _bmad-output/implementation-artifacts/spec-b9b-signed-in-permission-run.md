---
title: 'B9 part 2: permission matrix against the database with a signed-in user per role (rest of Story 6.4)'
type: 'chore'
created: '2026-11-11'
status: 'in-review'
baseline_commit: 'd6bcd125611b6cafa6aa23939c9108449e20f0e5'
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
- [x] `test/helpers/db-actor.ts`, `test/db/global-setup.ts`, `test/db/setup.ts` -- one signed-in user per role, switchable cookie store.
- [x] Shared EXPECTED (`test/helpers/permission-matrix.ts` or export) -- one source for both suites.
- [x] `test/db/permissions.db.test.ts` -- the end-to-end matrix with seeded data and before/after snapshots.
- [x] `docs/guardrail-check.md` -- name the signed-in run; remove it from "not built".
- [x] `sprint-status.yaml` -- 6.4 to `done`.

**Acceptance Criteria:**
- Given `npm run typecheck`, `lint`, `test`, `test:guardrails`, `test:db` and `build`, when they run, then they pass.
- Given the existing DB tests, when they run, then they pass unchanged.

## Implementation Notes

- **Users and sessions.** `test/helpers/db-actor.ts` has `TEST_USERS` (owner/designer unchanged: same id, email, password; plus `db-test-admin@…` `…d2` and `db-test-account@…` `…d3`), `ensureTestUsers()` (idempotent, also resets role, disable and designer request) and `signInTestUser(role)`. `global-setup.ts` signs each in once and provides `dbActorCookies` (owner, unchanged) and `dbRoleCookies`. `setup.ts` mocks `cookies()` with a switchable store (`currentCookieStore` / `switchSession`), the owner's by default, so existing DB tests are untouched.
- **Shared EXPECTED.** Moved verbatim to `test/helpers/permission-matrix.ts` (with the role lists and `SIGN_IN_ACTIONS`); `test/permissions.test.ts` imports it.
- **The run** (`test/db/permissions.db.test.ts`, describe tagged `NFR3 guardrail`): per role, every denied action with real ids → 403 `FORBIDDEN`, then a snapshot (row count + md5 of every `public` table and `storage.objects`) equal to the one taken before that role's denied batch (one snapshot pair per role, not per action: a full snapshot costs ~250 ms); every allowed action called with `{}` gets past the policy; `change permissions or guardrails` denied to each signed-in actor. Real allowed runs on seeded data (client with an approved case and a draft, a draft-only client, a collection; the reference v2 document with its files made live client files so Approva finds them): owners create/edit a client, create a case, save a case in review and approve it (event actor checked); admin renders Organizzazione and changes a job title, others are redirected; account/sales/social exports the approved case and the client pack (export jobs enqueued, deleted in `afterAll`), is refused the draft (FORBIDDEN reads, `NOT_APPROVED` export, case page redirects, approved-only list scope, no row changed), sees only the client with an approved case on Clienti, edits a collection text with originals unchanged. No session and a disabled profile → 401 for every action.
- **Disabled profile:** the account/sales/social user, not the admin: the test admin is the stack's only enabled admin and `LAST_ADMIN` refuses disabling it.
- **Checked once (not committed):** allowing `delete case` to account/sales/social in the policy fails the denied cell, the snapshot (case_study, case_event changed) and the draft check.

## Spec Change Log

## Review Triage Log

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | "No row changed" snapshot leaves out `auth.users`/`auth.identities`, where Organizzazione actions write (blind) | medium | `snapshot()` reads `public.*` and `storage.objects` only | patch |
| 2 | Matrix coverage only one way: stale EXPECTED files or renamed actions pass silently (blind) | medium | `ACTIONS` drops names that don't resolve | patch |
| 3 | Draft refusal is proved only through owner-only actions, not through actions account users are allowed (blind) | medium | `listAssets`/`getDetailsForm`/`getRenderAssets` are 403 by role | patch |
| 4 | Profile upsert doesn't reset `job_title` despite its comment (blind, edge, verification-gap) | low | Direct correction | patch |
| 5 | Redirect assertions accept any path (blind) | low | `/^REDIRECT \//` | patch |
| 6 | "Gets past the policy" accepts 404/500 (blind) | low | Only 401/403 excluded | patch |
| 7 | `TEST_ROLES` not checked against `ROLES` (blind) | low | A new role would be skipped silently | patch |
| 8 | `requestOrigin` mock comment wrong (blind) | low | Direct correction | patch |
| 9 | Seeded data left on the local stack (blind) | low | Same convention as the other DB tests; local only | reject |
| 10 | Refresh tokens may rotate across files after an hour (blind) | low | The DB run takes about a minute | reject |
| 11 | User management and a disabled owner not run signed in (blind) | low | Covered by the stubbed suite; spec asks for representative allowed actions | reject |
| 12 | A profile already holding a test email under another id aborts the run (edge) | low | Only on a hand-edited local stack | reject |

## Verification

**Commands:**
- `npm run typecheck && npm run lint && npm test` -- expected: pass.
- `npm run test:guardrails` -- expected: pass.
- `npm run test:db` -- expected: pass, including the new per-role run.
- `npm run build` -- expected: pass.
