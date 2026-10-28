import type { Actor } from "@/modules/access";
import { deleteCaseStudyInputSchema } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Deletes a draft or an approved case (Story 4.1, Story 5.2; AR3 amended 2026-10-28: delete
 * in `draft` or `approved`, soft): input `{ caseId, status }`, the status the person
 * confirmed. The case gets `deleted_at` and one `case_deleted` event (reason
 * `{status}_deleted`) with the actor, in the same transaction. Nothing is hard-deleted:
 * rows, material, events and the case number stay. The caller has already authorized
 * `delete case` for that status; the status check itself runs in the same transaction as
 * the delete. Errors: `INVALID_INPUT`, `NOT_FOUND` (unknown or already deleted),
 * `CASE_NOT_DELETABLE` (no longer in `status`), `CASE_STUDY_WRITE_FAILED`; nothing is
 * written on any of them.
 */
export function makeDeleteCaseStudy(cases: CaseStudyRepository) {
  return async function deleteCaseStudy(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(deleteCaseStudyInputSchema, input);
    if (!parsed.ok) return parsed;
    return cases.softDelete(parsed.value.caseId, parsed.value.status, actor.id);
  };
}
