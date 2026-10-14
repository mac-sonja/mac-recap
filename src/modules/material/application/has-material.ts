import { caseIdSchema, parseInput } from "@/modules/material/domain/validation";
import type { Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * True only when the case has at least one non-deleted asset. The details form
 * never counts. Needs no storage. An unknown case has no material. Errors:
 * `INVALID_INPUT` (malformed id).
 */
export function makeHasMaterial({ assets }: Pick<MaterialDeps, "assets">) {
  return async function hasMaterial(caseId: unknown): Promise<Result<boolean>> {
    const parsed = parseInput(caseIdSchema, caseId);
    if (!parsed.ok) return parsed;
    return assets.hasMaterial(parsed.value);
  };
}
