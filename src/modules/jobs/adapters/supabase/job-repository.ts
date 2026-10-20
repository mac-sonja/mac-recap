import { jobSchema, jobSummarySchema, type Job, type JobSummary } from "@/modules/jobs/domain/job";
import type { JobRepository } from "@/modules/jobs/ports/job-repository";
import type { Json, Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type JobRow = Tables<"job">;

/** Every column but `payload`: what `getJobsFor` returns. */
const SUMMARY_COLUMNS =
  "id, kind, subject_id, input_hash, status, attempts, max_attempts, locked_until, error, created_at, updated_at, finished_at";

/** `getJobsFor` returns at most this many jobs, newest first. */
export const JOBS_PER_SUBJECT_LIMIT = 50;

/** Largest value of `jobs_fail.p_retry_after` (Postgres integer). */
const INT4_MAX = 2_147_483_647;

/** Postgres check_violation: a value outside the table's checks (backstop for enqueue input). */
const CHECK_VIOLATION = "23514";

const fields = (row: Omit<JobRow, "payload">) => ({
  id: row.id,
  kind: row.kind,
  subjectId: row.subject_id,
  inputHash: row.input_hash,
  status: row.status,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  lockedUntil: row.locked_until,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  finishedAt: row.finished_at,
});

const invalidRow = (id: string) => err({ code: "JOB_INVALID", message: "A job row failed validation.", details: { id } });

/** Maps a `job` row to the domain shape, rejecting values outside the domain. */
export function toJob(row: JobRow): Result<Job> {
  const parsed = jobSchema.safeParse({ ...fields(row), payload: row.payload });
  return parsed.success ? ok(parsed.data) : invalidRow(row.id);
}

/** Maps a `job` row read without its payload. */
export function toJobSummary(row: Omit<JobRow, "payload">): Result<JobSummary> {
  const parsed = jobSummarySchema.safeParse(fields(row));
  return parsed.success ? ok(parsed.data) : invalidRow(row.id);
}

const lookupFailed = (what: string) => err({ code: "JOB_LOOKUP_FAILED", message: `Could not ${what}.` });
const writeFailed = (what: string) => err({ code: "JOB_WRITE_FAILED", message: `Could not ${what}.` });

/** The single row a `setof job` function returned, `null` when it returned none. */
function oneOrNone(data: JobRow[] | null, context: { jobId?: string; what: string }): Result<Job | null> {
  const rows = data ?? [];
  if (rows.length > 1) {
    log.error(`job ${context.what} returned ${rows.length} rows`, { jobId: context.jobId });
    return writeFailed(context.what);
  }
  return rows.length === 0 ? ok(null) : toJob(rows[0]);
}

export function createSupabaseJobRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): JobRepository {
  /** Runs one boolean, lease-fenced function. */
  async function fenced(fn: "jobs_renew" | "jobs_finish" | "jobs_release", lease: { id: string; attempts: number }) {
    const { data, error } = await client().rpc(fn, { p_id: lease.id, p_attempts: lease.attempts });
    if (error) {
      log.error(`${fn} failed: ${error.code}`, { jobId: lease.id });
      return writeFailed(`update the job (${fn})`);
    }
    return ok(data === true);
  }

  return {
    async enqueue(input) {
      const { data, error } = await client().rpc("jobs_enqueue", {
        p_kind: input.kind,
        p_subject_id: input.subjectId,
        p_input_hash: input.inputHash,
        p_payload: input.payload as Json,
      });
      if (error) {
        if (error.code === CHECK_VIOLATION) {
          return err({ code: "INVALID_INPUT", message: "The job input is invalid.", details: { kind: input.kind } });
        }
        log.error(`jobs_enqueue failed: ${error.code}`);
        return writeFailed("enqueue the job");
      }
      const one = oneOrNone(data, { what: "enqueue" });
      if (!one.ok) return one;
      if (one.value === null) {
        log.error("jobs_enqueue returned no row");
        return writeFailed("enqueue the job");
      }
      return ok(one.value);
    },

    async claim(kinds) {
      const { data, error } = await client().rpc("jobs_claim", { p_kinds: [...kinds] });
      if (error) {
        log.error(`jobs_claim failed: ${error.code}`);
        return lookupFailed("claim a job");
      }
      return oneOrNone(data, { what: "claim" });
    },

    renew: (lease) => fenced("jobs_renew", lease),
    finish: (lease) => fenced("jobs_finish", lease),
    release: (lease) => fenced("jobs_release", lease),

    async fail(lease, { error: jobError, retryAfterMs, retryable }) {
      const { data, error } = await client().rpc("jobs_fail", {
        p_id: lease.id,
        p_attempts: lease.attempts,
        p_error: { code: jobError.code, message: jobError.message },
        p_retry_after: Math.min(INT4_MAX, Math.max(0, Math.round(retryAfterMs))),
        p_retryable: retryable,
      });
      if (error) {
        log.error(`jobs_fail failed: ${error.code}`, { jobId: lease.id });
        return writeFailed("record the failed attempt");
      }
      return oneOrNone(data, { jobId: lease.id, what: "fail" });
    },

    async listBySubject(subjectId) {
      const { data, error } = await client()
        .from("job")
        .select(SUMMARY_COLUMNS)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(JOBS_PER_SUBJECT_LIMIT);
      if (error) {
        log.error(`job list failed: ${error.code}`);
        return lookupFailed("list the jobs");
      }
      const jobs: JobSummary[] = [];
      for (const row of data) {
        const mapped = toJobSummary(row);
        if (!mapped.ok) return mapped;
        jobs.push(mapped.value);
      }
      return ok(jobs);
    },

    async liveSubjects(kind, subjectIds) {
      if (subjectIds.length === 0) return ok([]);
      const { data, error } = await client()
        .from("job")
        .select("subject_id")
        .eq("kind", kind)
        .in("subject_id", [...subjectIds])
        .in("status", ["queued", "running"]);
      if (error) {
        log.error(`job live subjects failed: ${error.code}`);
        return lookupFailed("list the live jobs");
      }
      return ok([...new Set(data.map((r) => r.subject_id))]);
    },
  };
}
