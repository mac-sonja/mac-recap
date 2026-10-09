---
title: 'Story 2.3: Actor and policy seam with a dev owner/designer'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'aa7e772bda2c5d1d0c82c2a0814a45d0213e65a5'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No server action may run a use case without a resolved actor and a policy decision, and Epic 6 must be able to add login by swapping only how the actor is resolved.

**Approach:** Add the `profile` table (seeded `system` + dev `owner_designer`), the full AD-11 matrix as code in `access/domain/policy.ts`, and `access.getActor()` / `access.authorize()` exposed from `access/index.ts`, plus a test-enforced rule that every server action and route handler authorizes first.

## Boundaries & Constraints

**Always:** Matrix lives only in `policy.ts` (no table, env var or API changes it). `getActor()` reads `profile` on every call (no caching). Data access only server-side via the secret key, read only in `env.ts` and `adapters/`. RLS enabled on `profile`, no policy for `anon`/`authenticated`. Migration is forward-only SQL in `supabase/migrations/`. Interim rules: IR-PERM (any sharer turns off any link), IR-C4 (`manage templates` in matrix, no surface). **Decision (db.types):** `src/shared/db.types.ts` is committed. It is hand-written now to match this migration in `supabase gen types` output shape; whoever has Docker regenerates and commits it after each migration; CI typechecks without Docker.

**Never:** No login, sessions or Supabase Auth (Epic 6). No user-management UI or use cases (6.3). No `case_study` table (2.5). No permissions table. No caching of actor or role. Don't change frozen 2.1 lint rules except to add what this story needs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev actor | any request, dev profile enabled | `getActor()` → `ok(dev owner_designer)` read from `profile` | N/A |
| Dev profile missing or disabled | row absent or `disabled_at` set | `err({ code: 'UNAUTHENTICATED' })` | handler returns 401 `{ error }` |
| Allowed | owner_designer, `delete case`, case status `draft` | `ok` | N/A |
| Resource condition fails | owner_designer, `delete case`, status `approved` | `err({ code: 'FORBIDDEN' })` | 403, use case never called |
| Approved-only | account_sales_social, `view/export` or `create link`, status not `approved` | `FORBIDDEN` | 403 |
| Guardrail action | every role incl. admin and system, `change permissions or guardrails` | `FORBIDDEN` | 403 |
| System actor | `system`, any non-job action | `FORBIDDEN`; only `job work` allowed | 403 |
| Admin | admin, `manage users` | `ok` (last-admin rule is Story 6.3) | N/A |
| Skipped authorize | an exported server action or route handler with no `authorize(` before its use-case call | test fails naming the file and export | N/A |

</frozen-after-approval>

## Code Map

- `src/modules/access/index.ts` -- currently `export {}`; becomes the public surface (`getActor`, `authorize`, `Actor`, `Role`, `Action`, `respondToAppError` or equivalent).
- `src/modules/access/adapters/supabase/server.ts` -- 2.1 cookie client (publishable key) for Epic 6 auth; leave it. Add a separate service-role client next to it.
- `src/shared/env.ts` -- `getEnv()` exposes `SUPABASE_URL`, `SUPABASE_SECRET_KEY`; reuse, don't read `process.env`.
- `src/shared/result.ts` -- `Result`, `ok`, `err`, `AppError`; all access functions return `Result`.
- `eslint.config.mjs` -- per-module layers already allow vendor SDK + `db.types` only in `adapters/`, `zod` in `domain/`; `access` is in `MODULES`. Cross-folder imports inside a module use `@/modules/access/...`.
- `test/lint-boundaries.test.ts` -- pattern for linting in-memory code; reuse for the authorize-check fixtures.
- `supabase/migrations/` -- empty; first migration goes here as `<UTC timestamp>_access_profile.sql`.
- No Docker locally: migration and Supabase adapter can't run here; unit tests use an in-memory `ProfileRepository` fake.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/<ts>_access_profile.sql` -- `profile` (uuid pk `gen_random_uuid()`, email unique, display_name, role check in 4 values, created_at timestamptz default now(), disabled_at null); enable RLS, no policies; revoke all from anon, authenticated; insert `system` and dev owner_designer with fixed uuids -- AC1
- [x] `src/shared/db.types.ts`, `.gitignore`, `README.md` -- hand-written `Database` type for `profile` in gen-types shape; ensure not gitignored; README: regenerate with `npm run db:types` and commit after every migration
- [x] `src/modules/access/domain/actor.ts` -- `Role`, `Actor` zod schema/types; fixed `SYSTEM_ACTOR_ID`, `DEV_ACTOR_ID` matching the seed
- [x] `src/modules/access/domain/policy.ts` -- `Action` union for every matrix row; `Resource` (optional case `status`, link); pure `can(role, action, resource): boolean` with the full matrix -- AC2
- [x] `src/modules/access/application/ports.ts`, `get-actor.ts`, `authorize.ts` -- `ProfileRepository.findById`; `getActor` resolves `DEV_ACTOR_ID` per call; `authorize` returns `ok` or `FORBIDDEN`
- [x] `src/modules/access/adapters/supabase/admin.ts`, `profile-repository.ts` -- service-role client per call; maps rows to `Actor`
- [x] `src/modules/access/index.ts` -- exports wired `getActor`, `authorize`, types, and an HTTP helper mapping `AppError` codes to status (`FORBIDDEN` 403, `UNAUTHENTICATED` 401)
- [x] `src/modules/access/domain/policy.test.ts` -- asserts every cell (role × action × relevant status) incl. guardrail row denied to all
- [x] `src/modules/access/application/*.test.ts` -- getActor (found, missing, disabled, no caching: two calls hit repository twice) and authorize (denial never reaches a use-case spy)
- [x] `test/authorize-guard.test.ts` + helper -- scans `src/app/**` for `"use server"` modules and `route.ts` handlers; each export must call `authorize(` before any other module call; fixture files prove pass and fail
- [x] `test/secret-key.test.ts` -- `SUPABASE_SECRET_KEY` referenced only in `src/shared/env.ts` and `src/modules/*/adapters/**`; no `.next/static` file contains the key's env name or `from(` table queries (skips with notice if no build)

**Acceptance Criteria:**
- Given the migration, when read, then `profile` matches the spec, RLS is on with zero policies, and exactly two seed rows exist.
- Given `policy.ts`, when the matrix test runs, then every cell passes and no other file defines permissions.
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | verification-gap, blind | `.next/static` secret-key check always skips in CI (`npm test` runs before `npm run build`) | medium | patch | `ci.yml` runs test at line 23, build at 24; fresh checkout has no `.next`. |
| 2 | verification-gap, blind | `createSupabaseProfileRepository().findById` (error / null / row / `.eq`) has no test | medium | patch | Only `toProfile` is tested; `getActor` tests all use a fake repo. |
| 3 | verification-gap, blind | Seed ids/roles in the migration not tied to `DEV_ACTOR_ID`/`SYSTEM_ACTOR_ID`/`ROLES`; AC1 unchecked | medium | patch | Constants used on both sides of every unit test; a cheap SQL-text test catches drift without Docker. |
| 4 | verification-gap | Guard's route re-export branch (`export { GET } from`) untested | low | patch | Only the `"use server"` re-export path is exercised. |
| 5 | edge-case | Module call inside `authorize(`'s arguments counts as after it (sorted by start position) | medium | patch | `authorize(a, x, { status: (await getCase(id)).value.status })` passes; getCase runs first. Sort by end position. |
| 6 | edge-case | Bodiless overload signatures flagged "has no body" | low | patch | `checkFunction` returns "has no body" for any exported declaration without a body; one-line skip. |
| 7 | blind, edge-case | `respondToAppError` sends `details` to the client | low | patch | Whole `AppError` serialized; later module errors may carry internal details. Send `{ code, message }` only. |
| 8 | blind | Lookup failure cause dropped, not logged | low | patch | Supabase `error` discarded in `profile-repository.ts`; an outage leaves no trace in logs. |
| 9 | blind, edge-case, verification-gap | Guard checks call order only: ignored/conditional decision, local helpers, dynamic import pass | medium (unverified scope) | defer | Static-check design limit; enforcing "decision acted on" adds real complexity beyond the frozen matrix row. |
| 10 | blind | `admin.ts` lacks a `server-only` guard | medium | defer | `server-only` is not a dependency; adding it is a stack decision. Key value isn't inlined (no `NEXT_PUBLIC_`), only the import would reach the client. |
| 11 | blind | `system` role assignable to any profile row | medium | defer | No path creates profiles until Story 6.3; constraint guards state not yet reachable. |
| 12 | blind | `email` uniqueness is case-sensitive | low | defer | Matters when Epic 6 matches session emails; fix then with a forward migration. |
| 13 | blind | Worker has no exported system-actor resolver | low | defer | No worker job uses `job work` yet; belongs with the job loop. |
| 14 | blind | `list cases` approved scope not tied to the query | medium | defer | Use case (Story 2.6) must filter by the authorized scope. |
| 15 | blind | Dev owner/designer resolves in every deployed environment | false | reject | By design: every deployed env sits behind HTTP basic auth until Epic 6 (epic-2-context, Gating). |
| 16 | edge-case | `getEnv()` throw / fetch throw rejects past the `Result` contract | false | reject | `instrumentation.ts` refuses to start on bad env; postgrest-js returns fetch failures as `error` unless `throwOnError`. |
| 17 | blind | `Resource.link` unused | false | reject | The spec's policy task requires `Resource` to carry a link. |
| 18 | blind | Spec/sprint status mismatch; `.gitignore` ticked but untouched | false | reject | Status sync is the workflow's job at step 5; `git check-ignore` confirms `db.types.ts` is not ignored, so "ensure" needed no edit. |
| 19 | edge-case | Secret-key allowlist also exempts the env tests | false | reject | The spec's Verification line allows "env tests". |
| 20 | blind | Guard scans only `src/app` | low | reject | The spec scopes it to `src/app/**`, where AD-1 puts actions and routes; widening adds scope. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
- `grep -rn "SUPABASE_SECRET_KEY" src` -- expected: only env.ts, env tests and `adapters/`

**Manual checks (if no CLI):**
- With Docker: `npm run db:start` applies the migration; `select role from profile` returns `system` and `owner_designer`; querying `profile` with the publishable key returns no rows.
