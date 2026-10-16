---
title: 'Story 3.1: Background job queue and worker loop'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_commit: '7264176036d3c4471fa51e3c6891a85c37fb77c4'
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
- [x] `supabase/migrations/20261016120000_jobs_job.sql` -- `job` table per AC (+ `created_at`, `updated_at`, `finished_at`), partial unique index, RLS; `jobs_enqueue`, `jobs_claim(p_kinds)`, `jobs_renew`, `jobs_finish`, `jobs_fail(…, p_retry_after, p_retryable)`, `jobs_release`.
- [x] `src/shared/db.types.ts` -- table and RPCs.
- [x] `src/modules/jobs/domain/job.ts` + test -- `Job` schema, timing constants, `retryDelayMs`, `JobHandler { run(job, signal), caseIdOf? }`.
- [x] `src/modules/jobs/{ports/job-repository.ts,adapters/supabase/}` -- RPC wrappers, `listBySubject`.
- [x] `src/modules/jobs/application/{enqueue,get-jobs-for,run-loop}.ts` + tests -- injected repo, timers, handlers; every matrix row with fakes.
- [x] `src/modules/jobs/index.ts` -- `enqueue`, `getJobsFor`, `startJobLoop`, types.
- [x] `src/modules/access/{application/get-system-actor.ts,index.ts}` + test.
- [x] `src/worker/run.ts` + test -- env → system actor → loop (empty handler map) → drain on signal.
- [x] `test/db/jobs.db.test.ts` -- dedupe, two-connection claim race, expiry reclaim and last-attempt fail, fencing, retry delay, role denial.
- [x] `test/web-imports.test.ts` -- esbuild `metafile` over web entries (`src/app/**`, `src/proxy.ts`, `src/instrumentation*.ts`); fail on `@anthropic-ai/sdk`, `playwright*`, `sharp`, `child_process`; a fixture proves it fails.
- [x] `README.md`, `deferred-work.md` -- worker row; close the system-actor item.

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

- The jobs_* functions are `security definer` and the service role has only `select` on `job` (all other privileges revoked), so no server code can write a job row except through them. The other modules' functions are `security invoker`; this is deliberate.
- All jobs_* functions except renew/finish/release return `setof job` (0 or 1 row) so a lost lease is an empty result, not a null composite. `jobs_fail.p_retry_after` is milliseconds.
- `jobs_claim` fails expired last-attempt jobs only of `p_kinds`, so a worker without a handler for a kind never touches it (AC 4).
- Shutdown: only the abort outcome (`err` with code `ABORTED`, or a throw after the abort) or no answer within 10 s releases the job; `ok` is finished and any other error goes through jobs_fail. After the grace, an outcome already being recorded gets at most 3 s more; a late outcome after the release writes nothing. Hosts need a stop timeout of at least 15 s (README).
- Lease watchdog: a renewal that does not answer in 30 s counts as failed; with no successful renewal for 9 minutes (lease minus one interval) the handler is aborted and its outcome discarded.
- A refused `authorize(system, "job work")` fails the job for good (`FORBIDDEN`) instead of releasing it. Handler errors are capped (code 1–64, message ≤ 1000 characters, same check in SQL); a non-Result outcome is `HANDLER_BAD_OUTCOME`; retry delays are capped at 1 hour; `getJobsFor` returns the newest 50.
- `scripts/smoke-image.sh` worker rows now run against a tiny PostgREST stub (same image, shared network) because readiness needs the system profile; a new row checks exit 1 with no readiness line when Supabase is unreachable.
- `test/system-actor.test.ts` enforces AC 2 (no `SYSTEM_ACTOR_ID` or its value in `src/` outside `access`); `test/jobs-migration.test.ts` keeps the migration's kinds, statuses, lease and attempt limit in sync with `jobs/domain/job.ts`.
- `db.types.ts` was hand-edited; the CI drift check is the authority (commit its artifact if it fails).

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|--------|---------|---------|-------|----------|
| 1 | blind, edge-case | Lease can lapse while renewals fail, so two workers run one job | medium | patch | `renew` never tracks time since the last success; only writes are fenced. |
| 2 | blind, edge-case | `stop()` leaves the renewal interval and an in-flight settle | low | patch | Interval is cleared only in `runOne`'s `finally`; `current` may be null while settling. |
| 3 | edge-case | A permanent failure during shutdown is released and rerun | low | patch | `settle` releases on any error while `stopping`. |
| 4 | edge-case | Handler returning a non-Result throws in settle | low | patch | `outcome.ok` read without a guard. |
| 5 | blind, verification-gap | Refused `job work` releases and reclaims every 2 s forever | low | patch | `jobs_release` gives the attempt back; policy always allows `system` today. |
| 6 | verification-gap | `reportFailed` refusal path untested | low | patch | No test combines a refused authorize with a case-bound failure. |
| 7 | blind, edge-case | Stored errors unbounded; empty code passes SQL but fails zod | low | patch | SQL checks only types; zod `code.min(1)`. |
| 8 | edge-case | Retry delay overflows int4 when max_attempts > 17 | low | patch | `30 s × 2^(n−1)` in ms passed as `integer`. |
| 9 | blind, edge-case | `getJobsFor` unbounded, no authorize note | low | patch | No limit on `listBySubject`. |
| 10 | edge-case | Synchronous throw from `startJobLoop` is unhandled | low | patch | `void runWorker()` with no guard around the call. |
| 11 | edge-case | 10 s grace equals Docker's default stop timeout | low | patch | Docs only: host stop timeout ≥ 15 s. |
| 12 | blind | Migration sync test doesn't tie the lease to `JOB_LEASE_MS` | low | patch | Counts the literal only. |
| 13 | blind, edge-case | Access-module exclusion matches by bare prefix | low | patch | `startsWith` without a separator. |
| 14 | blind | Web import check misses worker_threads/execa/cross-spawn/puppeteer; `instrumentation-node.ts` can drop out | low | patch | Regex list and `existsSync` filter. |
| 15 | blind, edge-case, verification-gap | `job_failed` lost if the worker dies or `recordEvent` fails after the job is final | medium | defer | Needs a durable "reported" marker; no case-bound handler exists until 3.7. |
| 16 | blind | No retention for finished jobs | low | defer | Growth only; claims use partial indexes. |
| 17 | edge-case | Claimed row failing `toJob` burns attempts | low | reject | Main cause (empty code) removed by #7. |
| 18 | edge-case | `jobs_fail` RPC error on the last attempt reports LEASE_EXPIRED instead | low | reject | Needs a DB error at that exact step; the job still ends failed. |
| 19 | edge-case | One bad row hides a subject's job list | low | reject | Rows are validated on write by #7. |
| 20 | blind | System actor read once at boot | low | reject | The worker restarts on deploy; no path disables `system` today. |
| 21 | blind | "worker ready" logged before the first claim | low | reject | A broken queue shows as repeated claim errors right after. |
| 22 | blind | More DB edge tests (enqueue give-up, constraint rows); race on a shared DB | false | reject | CI uses a fresh database; constraints are exercised by the function tests. |
| 23 | blind | Spec in review, tracker in progress | false | reject | Normal workflow states. |
