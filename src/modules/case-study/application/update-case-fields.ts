import type { Actor } from "@/modules/access";
import { updateCaseFieldsInputSchema, type CaseStudy } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Saves a Da approvare case's year and business lines from the configurator (Story 4.3d,
 * owner 2026-11-03). The code never changes, even when the year does. A changed save
 * writes one `case_details_updated` event `{ year, businessLines }` with the actor, in
 * the same transaction; an unchanged one writes nothing. The caller has already
 * authorized `fill details`. `INVALID_INPUT` (naming each field), `NOT_FOUND` and
 * `STALE_STATUS` (not Da approvare) write nothing.
 */
export function makeUpdateCaseFields(cases: CaseStudyRepository) {
  return async function updateCaseFields(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
    const parsed = parseInput(updateCaseFieldsInputSchema, input);
    if (!parsed.ok) return parsed;
    return cases.updateFields(parsed.value, actor.id);
  };
}
