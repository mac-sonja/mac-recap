import { enqueueInputSchema, type Job } from "@/modules/jobs/domain/job";
import { parseInput } from "@/modules/jobs/domain/validation";
import type { JobRepository } from "@/modules/jobs/ports/job-repository";
import type { Result } from "@/shared/result";

/**
 * Enqueues `{ kind, subjectId, inputHash, payload? }` as a `queued` job with 3
 * attempts. While a job with the same kind, subject and input hash is queued or
 * running, that job is returned instead and nothing is written. Errors:
 * `INVALID_INPUT`.
 */
export function makeEnqueue(jobs: Pick<JobRepository, "enqueue">) {
  return async function enqueue(input: unknown): Promise<Result<Job>> {
    const parsed = parseInput(enqueueInputSchema, input);
    if (!parsed.ok) return parsed;
    return jobs.enqueue(parsed.value);
  };
}
