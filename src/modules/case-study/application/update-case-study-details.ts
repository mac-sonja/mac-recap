import type { Actor } from "@/modules/access";
import { updateCaseStudyDetailsInputSchema, type CaseStudy } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Saves a draft's name, year, locale and business line (wizard step 1 on an existing
 * case, Story 2.17). The client never changes; a year change renumbers the draft in the new year (next number for its client, new code; owner 2026-10-20). A changed save writes
 * one `case_details_updated` event with the actor, in the same transaction; an
 * unchanged one writes nothing. The caller has already authorized `create case`.
 * `INVALID_INPUT` (naming each field), `NOT_FOUND` and `STALE_STATUS` (no longer a
 * draft) write nothing.
 */
export function makeUpdateCaseStudyDetails(cases: CaseStudyRepository) {
  return async function updateDetails(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
    const parsed = parseInput(updateCaseStudyDetailsInputSchema, input);
    if (!parsed.ok) return parsed;
    return cases.updateDetails(parsed.value, actor.id);
  };
}
