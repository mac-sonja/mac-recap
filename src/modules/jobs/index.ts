// Public surface of the jobs module. Code outside this module imports only this file.
// The module owns the `job` table (AD-1); its state changes only through the
// jobs_* SQL functions.
import { authorize } from "@/modules/access";
import { recordEvent } from "@/modules/case-study";
import { createSupabaseJobRepository } from "@/modules/jobs/adapters/supabase/job-repository";
import { makeEnqueue } from "@/modules/jobs/application/enqueue";
import { makeGetJobsFor, makeLiveSubjects } from "@/modules/jobs/application/get-jobs-for";
import { makeStartJobLoop, type JobLoop, type JobLoopOptions } from "@/modules/jobs/application/run-loop";
import type { Job, JobSummary } from "@/modules/jobs/domain/job";
import type { Result } from "@/shared/result";

export type { JobLoop, JobLoopOptions } from "@/modules/jobs/application/run-loop";
export { JOB_ABORTED, JOB_FAILED, JOB_KINDS, JOB_STATUSES } from "@/modules/jobs/domain/job";
export type {
  EnqueueInput,
  Job,
  JobError,
  JobFailure,
  JobHandler,
  JobHandlers,
  JobKind,
  JobOutcome,
  JobStatus,
  JobSummary,
} from "@/modules/jobs/domain/job";

/**
 * Enqueues `{ kind, subjectId, inputHash, payload? }` (kind `generate`,
 * `export` or `rendition`). Idempotent: while a job with the same kind, subject
 * and input hash is queued or running, that job is returned and nothing is
 * written. Call only after the caller's own `authorize`. Errors: `INVALID_INPUT`.
 */
export function enqueue(input: unknown): Promise<Result<Job>> {
  return makeEnqueue(createSupabaseJobRepository())(input);
}

/**
 * The subject's jobs (case, asset or revision id), the newest 50 first, without
 * payloads: the only way the UI reads job outcomes (AD-10). Call only after
 * `authorize` for the subject (e.g. `view` or `edit` on its case); this does no
 * authorization of its own. Errors: `INVALID_INPUT`.
 */
export function getJobsFor(subjectId: unknown): Promise<Result<JobSummary[]>> {
  return makeGetJobsFor(createSupabaseJobRepository())(subjectId);
}

/**
 * Which of `{ kind, subjectIds }` (at most 500 ids) have a job of that kind
 * queued or running, in one read: e.g. which assets still wait for renditions.
 * Call only after `authorize` for the subjects. Errors: `INVALID_INPUT`, `JOB_LOOKUP_FAILED`.
 */
export function liveSubjects(input: unknown): Promise<Result<string[]>> {
  return makeLiveSubjects(createSupabaseJobRepository())(input);
}

/**
 * Starts the worker's job loop as `actor` (the `system` actor) with one handler
 * per kind; kinds without a handler are never claimed. Runs one job at a time
 * until `stop()`. Worker only.
 */
export function startJobLoop(options: JobLoopOptions): JobLoop {
  return makeStartJobLoop({ jobs: createSupabaseJobRepository(), authorize, recordEvent })(options);
}
