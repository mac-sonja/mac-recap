---
title: 'CI Supabase test harness'
type: 'chore'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '082f5023c9d81bf2d866ef1ddcad2eb98d39aa57'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-actor-and-policy-seam-with-a-dev-owner-designer.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No migration has ever run against a real Postgres: the `profile` table, its RLS lockout, the seed rows and the hand-written `db.types.ts` are unverified, and every coming Supabase story would add more unverified SQL.

**Approach:** A CI job that starts the local Supabase stack with the pinned CLI, applies every migration, runs DB-level tests, and fails when `db.types.ts` differs from freshly generated types; the same commands work locally for anyone with Docker.

## Boundaries & Constraints

**Always:** Supabase CLI only via the pinned devDependency (`npx supabase`). Tests read connection details from `supabase status -o env` mapped onto the existing names (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) plus a DB URL; nothing hard-codes local keys. DB tests are a separate suite (`npm run test:db`), excluded from `npm test`, so the existing `check` job stays Docker-free. Stack started with only the services the tests and `gen types` need. **Decision (types bootstrap):** nobody here can run Docker, so when the drift check fails the job uploads the generated `db.types.ts` as a workflow artifact; it is then committed from that artifact, and the job passes from then on.

**Never:** No change to the migration's SQL or to application code unless a DB test proves a defect (then report it, don't silently rewrite). No hosted Supabase project. No secrets in the repo or workflow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Migrations apply | fresh stack | every file in `supabase/migrations/` applies in order | job fails with CLI output |
| Seed rows | `profile` after migrate | exactly two rows: `SYSTEM_ACTOR_ID`/`system`, `DEV_ACTOR_ID`/`owner_designer` | N/A |
| Schema guards | `pg_catalog` | RLS enabled on `profile`, zero policies, role check list equals `ROLES` | N/A |
| Browser key | supabase-js with the publishable key, `select` on `profile` | no rows returned (error or empty) | N/A |
| DB roles | `set role anon` / `set role authenticated`, `select` on `profile` | permission denied | N/A |
| Real adapter | `getActor()` from `@/modules/access` against the stack | `ok` dev owner/designer | N/A |
| Disabled dev profile | set `disabled_at` on the dev row inside a rolled-back transaction or reset after | `getActor()` → `UNAUTHENTICATED` | restore the row in `finally` |
| Types drift | committed `db.types.ts` ≠ `npm run db:types` output | job fails, prints the diff, uploads the generated file as an artifact | N/A |
| No stack locally | `npm run test:db` without a running stack | fails fast with a message telling you to run `npm run db:start` | N/A |

</frozen-after-approval>

## Code Map

- `supabase/config.toml` -- API 54321, DB 54322, Postgres 17; `[db.seed]` points at `supabase/seed.sql` (exists). Many services enabled (realtime, storage, studio, mailpit…); exclude what's unneeded with `supabase start -x …` (keep what `gen types --local` needs).
- `supabase/migrations/20261009120000_access_profile.sql` -- the only migration; `profile` table, RLS, `revoke all … from anon, authenticated`, two seeds.
- `package.json` -- `db:start`, `db:types` (writes `src/shared/db.types.ts` via a `.tmp` + `mv`). Add `test:db`. Exact pins only (`test/scaffold.test.ts`); add `pg` + `@types/pg` (latest versions published ≥2 weeks ago) as devDependencies for catalog/role checks.
- `vitest.config.mts` -- single config including `src/**` and `test/**`; exclude `test/db/**` from it and give the DB suite its own config or project.
- `src/modules/access/domain/actor.ts` -- `ROLES`, `SYSTEM_ACTOR_ID`, `DEV_ACTOR_ID`; `src/modules/access/index.ts` -- real `getActor()` wired to the service-role adapter; `src/shared/env.ts` -- `getEnv()` caches, so the DB suite sets env before importing.
- `test/profile-migration.test.ts` -- existing SQL-text check; keep it (fast, Docker-free).
- `supabase status -o env --override-name <key>=<NAME>` maps status fields to our names; verify the exact field keys (e.g. `api.url`, publishable/secret key, `db.url`) against CLI 2.120.0.
- `.github/workflows/ci.yml` -- jobs `check` and `image`; add `db`. Runners have Docker.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/test-db.sh` -- checks the stack is up (else the matrix's fail-fast message), exports the mapped env, runs the DB suite
- [x] `vitest.config.mts`, `vitest.db.config.mts`, `package.json`, `package-lock.json` -- separate suite; `test:db`; `pg`, `@types/pg`
- [x] `test/db/profile.db.test.ts` -- every matrix row from "Seed rows" to "Disabled dev profile"
- [x] `.github/workflows/ci.yml` -- `db` job: `npm ci`, `supabase start` (trimmed), `npm run test:db`, `npm run db:types` + `git diff --exit-code`, on drift upload `src/shared/db.types.ts` artifact; `timeout-minutes`
- [x] `README.md` -- local DB tests and the types-update rule

**Acceptance Criteria:**
- Given a clean checkout, when `npm run lint && npm run typecheck && npm test && npm run build` run, then all pass and none needs Docker.
- Given the PR, when the `db` job runs, then migrations apply and every DB test passes; the types step either passes or uploads the generated file.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case, verification-gap | Artifact upload fires when type generation itself fails, uploading the unchanged committed file | medium | patch | `db:types` writes `.tmp` then `mv`; a gen failure skips `mv`, and the upload condition only checks the step failed. |
| 2 | verification-gap, blind, edge-case | Browser-key test passes on any error (401, bad URL, missing table) | medium | patch | Pre-verified: supabase-js returns `data: null` on every error, so the else branch always holds. |
| 3 | blind | INSERT/UPDATE/DELETE never tested for anon, authenticated or the publishable key | medium | patch | Only SELECT is exercised; self-inserting an `owner_designer` profile is the riskier path. |
| 4 | blind, edge-case | `asRole` leaks the client and masks the error if `rollback` throws | low | patch | `release()` follows the rollback in the same `finally`; direct fix. |
| 5 | edge-case | Interrupted run leaves the dev row disabled | low | patch | Restore runs only in `finally`; a `beforeAll` reset to the seed value fixes it. |
| 6 | blind | Seed test compares only id and role | low | patch | email, display_name and disabled_at unchecked; direct extension. |
| 7 | blind | Every `supabase status` failure says "no stack running" | low | patch | A broken CLI or a stopped Docker daemon gets the same hint; reword. |
| 8 | blind | Vitest configs duplicate alias, environment and timeout | low | patch | Two hand-copied configs will drift; `mergeConfig` is direct. |
| 9 | blind | README overstates coverage | low | patch | Follows from #2 and #3. |
| 10 | blind | `eval` of CLI output in `test-db.sh` | low | reject | Output comes from the pinned local CLI; replacing it adds a parser for an unlikely case. |
| 11 | blind | Spec lacks a record of CLI field-key verification | low | reject | Fix would edit this spec; the implementer checked the keys against the CLI 2.120.0 binary, and the first CI run settles it. |
| 12 | blind | No Docker image cache or readiness wait in the `db` job | low | reject | `supabase start` waits for health checks itself; caching is cost only. |
| 13 | edge-case | Restored `disabled_at` loses microseconds | false | reject | The seeded value is null, so nothing is truncated. |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- expected: all exit 0
- `npm run test:db` (no Docker here) -- expected: exits non-zero with the "run npm run db:start" message
- `bash -n scripts/test-db.sh` -- expected: parses

**Manual checks (if no CLI):**
- The `db` job on the PR is the only real run; read its log and artifact.
