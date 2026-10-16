---
title: 'Story 3.1: Background job queue and worker loop'
type: 'feature'
created: '2026-10-16'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-MAC Recap-2026-10-08/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The worker only idles. Renditions, generation and exports need a queue that keeps long work out of web requests, never runs it twice and never leaves a case stuck after a crash (AD-10, NFR4).

**Approach:** A `job` table whose state changes only through SQL functions (DB clock). The `jobs` module exposes `enqueue`, `getJobsFor` and a handler-per-kind loop. The worker runs it as the `system` actor, one job at a time.

## Boundaries & Constraints

**Always:** One forward-only migration (irreversible once pushed). RLS on, `anon`/`authenticated` revoked, functions `set search_path = ''`, executable by `service_role` only. Time checks use `now()`, never the worker clock. Renew/finish/fail/release are fenced on `(id, attempts)` with `status = 'running'`. A worker claims only kinds it has handlers for, and calls `authorize(system, "job work")` before each run. `job_failed` is written via `case-study.recordEvent` when the handler maps the job to a case. `error` holds `{ code, message }`; logs hold ids only.

**Never:** No real handlers, and no sharp/Playwright/ffmpeg/Anthropic in the worker. No `job_ok` event, job timeout, job cleanup or UI. `SYSTEM_ACTOR_ID` stays inside `access`. No change to `case_event`, `profile` or transition SQL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enqueue | new `(kind, subject, hash)` | `queued`, `attempts 0`, `max_attempts 3` | bad input → `INVALID_INPUT` |
| Duplicate enqueue | same triple `queued`/`running`, sequential or parallel | existing job returned; one row | — |
| Re-enqueue | prior job `succeeded`/`failed` | new job | — |
| Two workers | one claimable job | one claim (`SKIP LOCKED`); `attempts +1`; lease `now()+10 min` | — |
| Empty queue | nothing claimable | sleep 2 s, poll again | DB error → log, keep polling |
| Long job | runs > 10 min | lease renewed every 60 s; never reclaimed | lease lost → abort, write nothing |
| Success | handler `ok` | `succeeded`, lease cleared | — |
| Retryable error | `err` or throw, `attempts < max` | `queued`, `error` set, claimable after `30 s × 2^(attempts−1)` | throw → `HANDLER_THREW` |
| Permanent error | `retryable: false` or last attempt | `failed`; `job_failed {jobId, kind, code}` | no case → log only |
| Crash | lease expired, `attempts < max` | claimable again | — |
| Crash, last attempt | lease expired, `attempts = max` | `jobs_claim()` marks `failed` (`LEASE_EXPIRED`), returns it; worker emits `job_failed` | — |
| Shutdown | SIGTERM/SIGINT | stop claiming, abort handler, wait ≤ 10 s, release unfinished job (attempt given back), exit 0 once | — |
| Start | bad env / no enabled `system` profile | exit 1, no readiness line | logged |
| UI read | `getJobsFor(subjectId)` | subject's jobs, newest first, no `payload` | bad id → `INVALID_INPUT` |

</frozen-after-approval>

## Code Map

- `src/worker/run.ts` (+ test), `index.ts` -- idle worker from 2.2 part 2 (`WorkerHost`, injected `loadEnv`, one-exit guard). Swap the idle interval for the loop; readiness line moves after actor resolution and adds `actorId`.
- `src/modules/jobs/` -- empty `index.ts`, `.gitkeep` in `domain/`, `application/`.
- `src/modules/access/application/get-actor.ts`, `domain/actor.ts` (`SYSTEM_ACTOR_ID`) -- model `getSystemActor()` on `makeGetActor`; not `system`/disabled/missing → `UNAUTHENTICATED`. `policy.ts` already allows `"job work"` for `system`.
- `src/modules/case-study/index.ts` `recordEvent` -- the only `job_failed` writer. `adapters/supabase/{admin.ts,refusal.ts}` -- copy the pattern.
- `supabase/migrations/20261012120000_case_study_transition.sql` -- function/grant style.
- `src/shared/db.types.ts` -- hand-edit; if CI drift fails, commit its artifact.
- `test/db/case-study.db.test.ts` -- DB test style (`pg`, `inRolledBackTx`, own rows).

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/20261016120000_jobs_job.sql` -- `job` table per AC (+ `created_at`, `updated_at`, `finished_at`), partial unique index, RLS; `jobs_enqueue`, `jobs_claim(p_kinds)`, `jobs_renew`, `jobs_finish`, `jobs_fail(…, p_retry_after, p_retryable)`, `jobs_release`.
- [ ] `src/shared/db.types.ts` -- table and RPCs.
- [ ] `src/modules/jobs/domain/job.ts` + test -- `Job` schema, timing constants, `retryDelayMs`, `JobHandler { run(job, signal), caseIdOf? }`.
- [ ] `src/modules/jobs/{ports/job-repository.ts,adapters/supabase/}` -- RPC wrappers, `listBySubject`.
- [ ] `src/modules/jobs/application/{enqueue,get-jobs-for,run-loop}.ts` + tests -- injected repo, timers, handlers; every matrix row with fakes.
- [ ] `src/modules/jobs/index.ts` -- `enqueue`, `getJobsFor`, `startJobLoop`, types.
- [ ] `src/modules/access/{application/get-system-actor.ts,index.ts}` + test.
- [ ] `src/worker/run.ts` + test -- env → system actor → loop (empty handler map) → drain on signal.
- [ ] `test/db/jobs.db.test.ts` -- dedupe, two-connection claim race, expiry reclaim and last-attempt fail, fencing, retry delay, role denial.
- [ ] `test/web-imports.test.ts` -- esbuild `metafile` over web entries (`src/app/**`, `src/proxy.ts`, `src/instrumentation*.ts`); fail on `@anthropic-ai/sdk`, `playwright*`, `sharp`, `child_process`; a fixture proves it fails.
- [ ] `README.md`, `deferred-work.md` -- worker row; close the system-actor item.

**Acceptance Criteria:**
- Given a fresh stack, when the migration runs, then `job`, its unique index and `jobs_claim()` exist and `anon`/`authenticated` can't touch them.
- Given the worker starts, when it needs an actor, then it calls `getSystemActor()`, and nothing outside `access` references `SYSTEM_ACTOR_ID`.
- Given a web entry importing a forbidden package, when `npm test` runs, then the import check fails.
- Given jobs of a kind without a handler, when the worker polls, then it never claims them.

## Design Notes

`jobs_claim` first fails one expired `running` row with `attempts >= max_attempts` and returns it. Otherwise it claims the oldest row of `p_kinds` that is `queued` with no future `locked_until`, or `running` with an expired lease and attempts left. `jobs_enqueue`: `insert … on conflict … where status in ('queued','running') do nothing`, then select the live row, retrying if it just finished.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test && npm run build` -- pass.
- CI `db` job -- green.

**Manual checks:**
- Push to **mac-recap-dev** only: `npx supabase db push -p "$SUPABASE_DEV_DB_PASSWORD"`. Run `npm run build:dist && node --env-file=.env.local dist/worker.js`: one `worker ready` line with the system `actorId`, then quiet polling; Ctrl+C exits 0. The dashboard shows an empty `job` table.

## Implementation Notes

## Spec Change Log

## Review Triage Log
