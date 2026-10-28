import { listScopeSchema, type ListedCaseStudy } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Lists the non-deleted case studies within exactly `scope` (`{}` every status,
 * `{ status }` only that one), newest `updated_at` first, each Da approvare case with
 * `inReviewSince`. The caller derives the
 * scope from the `list cases` policy and authorizes it; this filters by it.
 * A malformed scope is `INVALID_INPUT` and queries nothing.
 */
export function makeListCaseStudies(cases: CaseStudyRepository) {
  return async function list(scope: unknown): Promise<Result<ListedCaseStudy[]>> {
    const parsed = parseInput(listScopeSchema, scope);
    if (!parsed.ok) return parsed;
    return cases.list(parsed.value);
  };
}
