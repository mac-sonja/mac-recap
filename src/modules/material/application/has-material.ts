import { caseIdSchema, parseInput } from "@/modules/material/domain/validation";
import { ok, type Result } from "@/shared/result";
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

/**
 * The ids of the case's non-deleted assets, oldest first (Story 4.5a: the media guardrail
 * of `case-study.saveRevisionDoc`). Needs no storage. An unknown case has none. Errors:
 * `INVALID_INPUT` (malformed id), `ASSET_LOOKUP_FAILED`.
 */
export function makeLiveAssetIds({ assets }: Pick<MaterialDeps, "assets">) {
  return async function liveAssetIds(caseId: unknown): Promise<Result<string[]>> {
    const parsed = parseInput(caseIdSchema, caseId);
    if (!parsed.ok) return parsed;
    const live = await assets.listLive(parsed.value);
    return live.ok ? ok(live.value.map((asset) => asset.id)) : live;
  };
}
