import type { EnqueueInput, Job, JobError, JobKind, JobSummary, Lease } from "@/modules/jobs/domain/job";
import type { Result } from "@/shared/result";

/**
 * The `job` table, reached only through its SQL functions (AD-10). Implemented
 * by `adapters/supabase/job-repository.ts`. Every time check runs on the
 * database clock. `err` means the call itself failed (database unreachable,
 * bad row), never a lost lease: a lost lease is `ok(false)` / `ok(null)`.
 */
export interface JobRepository {
  /** `jobs_enqueue`: the new job, or the live one with the same (kind, subject, input hash). */
  enqueue(input: EnqueueInput): Promise<Result<Job>>;
  /** `jobs_claim`: at most one job of `kinds`, now `running` (or `failed` with `LEASE_EXPIRED`); `null` when nothing is claimable. */
  claim(kinds: readonly JobKind[]): Promise<Result<Job | null>>;
  /** `jobs_renew`: false when the lease is lost. */
  renew(lease: Lease): Promise<Result<boolean>>;
  /** `jobs_finish`: false when the lease is lost. */
  finish(lease: Lease): Promise<Result<boolean>>;
  /** `jobs_fail`: the job as it is now (`queued` for a retry, or `failed`); `null` when the lease is lost. */
  fail(lease: Lease, failure: { error: JobError; retryAfterMs: number; retryable: boolean }): Promise<Result<Job | null>>;
  /** `jobs_release`: back to `queued` with the attempt given back; false when the lease is lost. */
  release(lease: Lease): Promise<Result<boolean>>;
  /** The subject's newest 50 jobs, newest first, without payloads. */
  listBySubject(subjectId: string): Promise<Result<JobSummary[]>>;
  /** Which of `subjectIds` have a `kind` job that is queued or running, in one read. */
  liveSubjects(kind: JobKind, subjectIds: readonly string[]): Promise<Result<string[]>>;
}
