import type { Actor } from "@/modules/access";
import { ASSET_REMOVED, assetRefInputSchema } from "@/modules/material/domain/asset";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { storageNotConfigured, type MaterialDeps } from "./deps";

/**
 * Soft-deletes one live asset of a non-deleted case and records `asset_removed
 * { assetId }`; the S3 object stays. An unknown or already removed asset is
 * `NOT_FOUND`. If the event write fails the asset is restored and the error
 * returned. The caller has already authorized `upload`.
 */
export function makeRemoveAsset({ assets, storage, cases }: MaterialDeps) {
  return async function removeAsset(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(assetRefInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, assetId } = parsed.value;
    if (storage === null) return storageNotConfigured();

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const removed = await assets.softDelete(caseId, assetId);
    if (!removed.ok) return removed;
    if (!removed.value) {
      return err({ code: "NOT_FOUND", message: "No such file.", details: { caseId, assetId } });
    }

    const event = await cases.recordEvent(actor, { caseId, type: ASSET_REMOVED, data: { assetId } });
    if (!event.ok) {
      const undone = await assets.restore(caseId, assetId);
      if (!undone.ok) log.error("asset removed without its asset_removed event: compensation failed", { caseId, actorId: actor.id });
      return event;
    }
    return ok(undefined);
  };
}
