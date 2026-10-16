import { z } from "zod";
import type { AppError, Result } from "@/shared/result";

/** Job kinds (AD-10). The `job.kind` check in the migration lists exactly these. */
export const JOB_KINDS = ["generate", "export", "rendition"] as const;
export const jobKindSchema = z.enum(JOB_KINDS);
export type JobKind = z.infer<typeof jobKindSchema>;

/** Job statuses. The `job.status` check in the migration lists exactly these. */
export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

// Timing. The lease and the attempt limit are also written in the migration
// (`jobs_claim`, `jobs_renew`, `job.max_attempts` default); keep them in sync.
/** A claim or renewal holds the job this long. It detects a crashed worker; it is never a time limit (NFR4). */
export const JOB_LEASE_MS = 10 * 60 * 1000;
/** The worker renews the lease this often while a handler runs. */
export const JOB_RENEW_EVERY_MS = 60 * 1000;
/** The worker waits this long before polling again when nothing was claimable or the claim failed. */
export const JOB_POLL_IDLE_MS = 2 * 1000;
/** A renewal that has not answered after this long counts as failed. */
export const JOB_RENEW_TIMEOUT_MS = 30 * 1000;
/**
 * Without a successful renewal for this long, the worker treats the lease as
 * lost and aborts the handler: one renewal interval before the database lease
 * runs out, so another worker never runs the job while this one still does.
 */
export const JOB_LEASE_SAFE_MS = JOB_LEASE_MS - JOB_RENEW_EVERY_MS;
/** First retry delay; it doubles with every further attempt. */
export const JOB_RETRY_BASE_MS = 30 * 1000;
/** Longest retry delay. */
export const JOB_RETRY_MAX_MS = 60 * 60 * 1000;
/** Attempts per job before it fails for good. */
export const JOB_MAX_ATTEMPTS = 3;
/** On shutdown the worker waits at most this long for the running handler before releasing its job. */
export const JOB_SHUTDOWN_GRACE_MS = 10 * 1000;
/** After the grace period, shutdown waits at most this long more for an outcome already being recorded. */
export const JOB_SETTLE_GRACE_MS = 3 * 1000;

/** Delay before a job that just failed its `attempts`-th attempt is claimable again: 30 s × 2^(attempts−1), at most 1 hour. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.min(Math.max(1, Math.trunc(attempts)) - 1, 30);
  return Math.min(JOB_RETRY_BASE_MS * 2 ** exponent, JOB_RETRY_MAX_MS);
}

/** Limits on a stored error; the migration's `job.error` check uses the same numbers. */
export const JOB_ERROR_CODE_MAX = 64;
export const JOB_ERROR_MESSAGE_MAX = 1000;

/** What a failed attempt stores in `job.error`. Never material, prompts or responses. */
export const jobErrorSchema = z.object({
  code: z.string().min(1).max(JOB_ERROR_CODE_MAX),
  message: z.string().max(JOB_ERROR_MESSAGE_MAX),
});

/** Fits a handler's error into the stored limits (an empty code becomes `UNKNOWN`). */
export function toJobError(error: { code: unknown; message: unknown }): JobError {
  const code = String(error.code ?? "").slice(0, JOB_ERROR_CODE_MAX);
  return { code: code === "" ? "UNKNOWN" : code, message: String(error.message ?? "").slice(0, JOB_ERROR_MESSAGE_MAX) };
}
export type JobError = z.infer<typeof jobErrorSchema>;

const payloadSchema = z.record(z.string(), z.json());

/** A `job` row. */
export const jobSchema = z.object({
  id: z.uuid(),
  kind: jobKindSchema,
  subjectId: z.uuid(),
  inputHash: z.string().min(1),
  payload: payloadSchema,
  status: jobStatusSchema,
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  lockedUntil: z.string().nullable(),
  error: jobErrorSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

/** A job as the UI reads it (`getJobsFor`): everything but the payload. */
export const jobSummarySchema = jobSchema.omit({ payload: true });
export type JobSummary = z.infer<typeof jobSummarySchema>;

/** What `enqueue` accepts. The input hash identifies the job's input: the same triple is deduplicated while live. */
export const enqueueInputSchema = z.object({
  kind: jobKindSchema,
  subjectId: z.uuid(),
  inputHash: z.string().min(1).max(256),
  payload: payloadSchema.default({}),
});
export type EnqueueInput = z.infer<typeof enqueueInputSchema>;

/** The (id, attempts) pair every renew, finish, fail and release is fenced on. */
export interface Lease {
  id: string;
  attempts: number;
}

/**
 * The code a handler returns (`err({ code: JOB_ABORTED, ... })`) when it stopped
 * because its signal aborted. On shutdown only this outcome (or a throw after
 * the abort) gives the attempt back; any other error is recorded as usual.
 */
export const JOB_ABORTED = "ABORTED";

/** A failed attempt as a handler reports it. `retryable: false` fails the job at once; otherwise it is retried while attempts are left. */
export type JobFailure = AppError & { retryable?: boolean };

export type JobOutcome = Result<void, JobFailure>;

/**
 * Does the work of one job kind. `run` must stop promptly when `signal` aborts
 * (lease lost or shutdown) and must not write anything after that. `caseIdOf`
 * maps a job to its case so a permanent failure is logged as `job_failed` on
 * that case; without it (or when it returns null) the failure is only logged.
 */
export interface JobHandler {
  run(job: Job, signal: AbortSignal): Promise<JobOutcome>;
  caseIdOf?(job: Job): string | null;
}

/** One handler per kind; the worker claims only kinds that have one. */
export type JobHandlers = Partial<Record<JobKind, JobHandler>>;

/** Case event written when a job fails for good; `data` is `{ jobId, kind, code }`. */
export const JOB_FAILED = "job_failed";
