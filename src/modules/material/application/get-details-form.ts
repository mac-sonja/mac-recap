import { detailsFormInputSchema, type DetailsForm } from "@/modules/material/domain/details-form";
import { parseInput } from "@/modules/material/domain/validation";
import type { Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * The details form of a case (`{ caseId }`): `{ context, solution, results }`,
 * each `""` when never saved (all `""` for a case with no row). Errors:
 * `INVALID_INPUT`, `NOT_FOUND`. Needs no storage. The caller has already authorized `fill details`.
 */
export function makeGetDetailsForm({ form, cases }: Pick<MaterialDeps, "form" | "cases">) {
  return async function getDetailsForm(input: unknown): Promise<Result<DetailsForm>> {
    const parsed = parseInput(detailsFormInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    return form.read(caseId);
  };
}
