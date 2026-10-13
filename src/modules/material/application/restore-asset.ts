import type { Actor } from "@/modules/access";
import { ASSET_RESTORED, assetRefInputSchema } from "@/modules/material/domain/asset";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import { storageNotConfigured, type MaterialDeps } from "./deps";

/**
 * Clears `deleted_at` on one asset of a non-deleted case (re-checking the cap
 * under the per-case lock) and records `asset_restored { assetId }`. An already
 * live asset is ok with no event. Errors: `NOT_FOUND`, `FILE_LIMIT_REACHED`. If
 * the event write fails the asset is removed again and the error returned. The
 * caller has already authorized `upload`.
 */
export function makeRestoreAsset({ assets, storage, cases }: MaterialDeps) {
  return async function restoreAsset(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(assetRefInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, assetId } = parsed.value;
    if (storage === null) return storageNotConfigured();

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const restored = await assets.restore(caseId, assetId);
    if (!restored.ok) return restored;
    if (!restored.value) return ok(undefined);

    const event = await cases.recordEvent(actor, { caseId, type: ASSET_RESTORED, data: { assetId } });
    if (!event.ok) {
      const undone = await assets.softDelete(caseId, assetId);
      if (!undone.ok || !undone.value) {
        log.error("asset restored without its asset_restored event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(undefined);
  };
}
