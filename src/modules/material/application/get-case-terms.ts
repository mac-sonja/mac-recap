import { caseTermsInputSchema, toDeliverableTerms, type DeliverableTerms } from "@/modules/material/domain/taxonomy";
import { parseInput } from "@/modules/material/domain/validation";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * The term keys of every live deliverable of a case (`{ caseId }`):
 * `{ refKind, refId, tag, property, flag }` each, untagged ones with all `[]`.
 * Removed deliverables are left out (their links are kept for a restore).
 * Errors: `INVALID_INPUT`, `NOT_FOUND`. The caller has already authorized `tag`.
 */
export function makeGetCaseTerms({ taxonomy, cases }: Pick<MaterialDeps, "taxonomy" | "cases">) {
  return async function getCaseTerms(input: unknown): Promise<Result<DeliverableTerms[]>> {
    const parsed = parseInput(caseTermsInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const links = await taxonomy.caseTerms(caseId);
    if (!links.ok) return links;
    return ok(links.value.map(toDeliverableTerms));
  };
}
