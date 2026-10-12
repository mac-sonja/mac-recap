import type { Actor } from "@/modules/access";
import { createCaseStudyInputSchema, type CaseStudy } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Creates a case study in `draft` with a DB-generated permanent id, plus its
 * `case_created` event, in one transaction. The caller has already authorized
 * `create case`. `INVALID_INPUT` (naming each field) writes nothing.
 */
export function makeCreateCaseStudy(cases: CaseStudyRepository) {
  return async function create(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
    const parsed = parseInput(createCaseStudyInputSchema, input);
    if (!parsed.ok) return parsed;
    return cases.create(parsed.value, actor.id);
  };
}
