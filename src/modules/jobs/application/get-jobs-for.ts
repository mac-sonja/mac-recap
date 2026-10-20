import { z } from "zod";
import { jobKindSchema, type JobSummary } from "@/modules/jobs/domain/job";
import { parseInput } from "@/modules/jobs/domain/validation";
import type { JobRepository } from "@/modules/jobs/ports/job-repository";
import type { Result } from "@/shared/result";

const subjectIdSchema = z.uuid();

/**
 * The jobs for one subject (case, asset or revision), the newest 50 first,
 * without their payloads. This is how the UI reads job outcomes (AD-10).
 * Callers must `authorize` first; this does not. Errors: `INVALID_INPUT` (malformed id).
 */
export function makeGetJobsFor(jobs: Pick<JobRepository, "listBySubject">) {
  return async function getJobsFor(subjectId: unknown): Promise<Result<JobSummary[]>> {
    const parsed = parseInput(subjectIdSchema, subjectId);
    if (!parsed.ok) return parsed;
    return jobs.listBySubject(parsed.value);
  };
}

const liveSubjectsInputSchema = z.object({ kind: jobKindSchema, subjectIds: z.array(z.uuid()).max(500) });

/**
 * Which of `subjectIds` have a `kind` job queued or running, in one read (no
 * payloads). Callers must `authorize` first; this does not. Errors: `INVALID_INPUT`.
 */
export function makeLiveSubjects(jobs: Pick<JobRepository, "liveSubjects">) {
  return async function liveSubjects(input: unknown): Promise<Result<string[]>> {
    const parsed = parseInput(liveSubjectsInputSchema, input);
    if (!parsed.ok) return parsed;
    return jobs.liveSubjects(parsed.value.kind, parsed.value.subjectIds);
  };
}
