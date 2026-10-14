import type { Actor } from "@/modules/access";
import {
  ASSET_FAVOURITED,
  ASSET_UNFAVOURITED,
  FAVOURITABLE_KINDS,
  favouriteInputSchema,
} from "@/modules/material/domain/asset";
import type { AssetKind } from "@/modules/material/domain/files";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

const isFavouritable = (kind: AssetKind) => (FAVOURITABLE_KINDS as readonly AssetKind[]).includes(kind);

/**
 * Sets or clears the favourite flag of one live asset of a non-deleted case
 * (`{ caseId, assetId, isFavourite }`) and records `asset_favourited` or
 * `asset_unfavourited { assetId }`. Setting the current value again writes
 * nothing and records no event, also when a concurrent request already set it
 * (compare-and-set). Only images and videos can be favourites
 * (`NOT_FAVOURITABLE`); an unknown or removed asset is `NOT_FOUND`. Case status
 * never changes. If the event write fails the flag is put back and the error
 * returned. Works without S3. The caller has already authorized `mark favourites`.
 */
export function makeSetFavourite({ assets, cases }: Pick<MaterialDeps, "assets" | "cases">) {
  return async function setFavourite(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(favouriteInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, assetId, isFavourite } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const asset = await assets.get(caseId, assetId);
    if (!asset.ok) return asset;
    if (asset.value === null) {
      return err({ code: "NOT_FOUND", message: "No such file.", details: { caseId, assetId } });
    }

    const previous = asset.value.isFavourite;
    if (previous === isFavourite) return ok(undefined);
    if (isFavourite && !isFavouritable(asset.value.kind)) {
      return err({
        code: "NOT_FAVOURITABLE",
        message: "Only images and videos can be favourites.",
        details: { caseId, assetId },
      });
    }

    // Compare-and-set: only one of two concurrent identical requests changes the row.
    const updated = await assets.setFavourite(caseId, assetId, isFavourite);
    if (!updated.ok) return updated;
    if (!updated.value) {
      const current = await assets.get(caseId, assetId);
      if (!current.ok) return current;
      if (current.value === null) {
        return err({ code: "NOT_FOUND", message: "No such file.", details: { caseId, assetId } });
      }
      return ok(undefined); // a concurrent request already set it: no event
    }

    const type = isFavourite ? ASSET_FAVOURITED : ASSET_UNFAVOURITED;
    const event = await cases.recordEvent(actor, { caseId, type, data: { assetId } });
    if (!event.ok) {
      // Same compare-and-set: reverts only while the flag still holds our value.
      const reverted = await assets.setFavourite(caseId, assetId, previous);
      if (!reverted.ok || !reverted.value) {
        log.error(`favourite changed without its ${type} event: compensation failed`, { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(undefined);
  };
}
