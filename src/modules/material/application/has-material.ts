import { caseIdSchema } from "@/modules/material/domain/text-item";
import { parseInput } from "@/modules/material/domain/validation";
import type { Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * True only when the case has at least one non-deleted asset or one non-deleted,
 * non-empty text item. The details form never counts. Needs no storage. An
 * unknown case has no material. Errors: `INVALID_INPUT` (malformed id).
 */
export function makeHasMaterial({ texts }: Pick<MaterialDeps, "texts">) {
  return async function hasMaterial(caseId: unknown): Promise<Result<boolean>> {
    const parsed = parseInput(caseIdSchema, caseId);
    if (!parsed.ok) return parsed;
    return texts.hasMaterial(parsed.value);
  };
}
