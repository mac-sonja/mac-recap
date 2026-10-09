---
title: 'Story 2.3: Actor and policy seam with a dev owner/designer'
type: 'feature'
created: '2026-10-09'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
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
- [ ] `supabase/migrations/<ts>_access_profile.sql` -- `profile` (uuid pk `gen_random_uuid()`, email unique, display_name, role check in 4 values, created_at timestamptz default now(), disabled_at null); enable RLS, no policies; revoke all from anon, authenticated; insert `system` and dev owner_designer with fixed uuids -- AC1
- [ ] `src/shared/db.types.ts`, `.gitignore`, `README.md` -- hand-written `Database` type for `profile` in gen-types shape; ensure not gitignored; README: regenerate with `npm run db:types` and commit after every migration
- [ ] `src/modules/access/domain/actor.ts` -- `Role`, `Actor` zod schema/types; fixed `SYSTEM_ACTOR_ID`, `DEV_ACTOR_ID` matching the seed
- [ ] `src/modules/access/domain/policy.ts` -- `Action` union for every matrix row; `Resource` (optional case `status`, link); pure `can(role, action, resource): boolean` with the full matrix -- AC2
- [ ] `src/modules/access/application/ports.ts`, `get-actor.ts`, `authorize.ts` -- `ProfileRepository.findById`; `getActor` resolves `DEV_ACTOR_ID` per call; `authorize` returns `ok` or `FORBIDDEN`
- [ ] `src/modules/access/adapters/supabase/admin.ts`, `profile-repository.ts` -- service-role client per call; maps rows to `Actor`
- [ ] `src/modules/access/index.ts` -- exports wired `getActor`, `authorize`, types, and an HTTP helper mapping `AppError` codes to status (`FORBIDDEN` 403, `UNAUTHENTICATED` 401)
- [ ] `src/modules/access/domain/policy.test.ts` -- asserts every cell (role × action × relevant status) incl. guardrail row denied to all
- [ ] `src/modules/access/application/*.test.ts` -- getActor (found, missing, disabled, no caching: two calls hit repository twice) and authorize (denial never reaches a use-case spy)
- [ ] `test/authorize-guard.test.ts` + helper -- scans `src/app/**` for `"use server"` modules and `route.ts` handlers; each export must call `authorize(` before any other module call; fixture files prove pass and fail
- [ ] `test/secret-key.test.ts` -- `SUPABASE_SECRET_KEY` referenced only in `src/shared/env.ts` and `src/modules/*/adapters/**`; no `.next/static` file contains the key's env name or `from(` table queries (skips with notice if no build)

**Acceptance Criteria:**
- Given the migration, when read, then `profile` matches the spec, RLS is on with zero policies, and exactly two seed rows exist.
- Given `policy.ts`, when the matrix test runs, then every cell passes and no other file defines permissions.
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
- `grep -rn "SUPABASE_SECRET_KEY" src` -- expected: only env.ts, env tests and `adapters/`

**Manual checks (if no CLI):**
- With Docker: `npm run db:start` applies the migration; `select role from profile` returns `system` and `owner_designer`; querying `profile` with the publishable key returns no rows.
