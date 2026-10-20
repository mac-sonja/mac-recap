import {
  getRenditionInputSchema,
  hasRenditions,
  RENDITION_NOT_READY,
  RENDITION_SPECS,
  RENDITION_URL_TTL_SECONDS,
  type RenditionLink,
} from "@/modules/material/domain/rendition";
import { parseInput } from "@/modules/material/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import { storageNotConfigured, type MaterialDeps } from "./deps";
import { specHash } from "./spec-hash";

/**
 * A signed GET (15 minutes) for one rendition of a live asset of a live case:
 * `{ url, width, height, contentType }`. Errors: `INVALID_INPUT` (malformed id
 * or unknown spec name), `NOT_FOUND` (no such asset, a soft-deleted one, one
 * whose case is soft-deleted, or a spec of another kind, e.g. `video.poster` of an image), `RENDITION_NOT_READY`
 * (the worker has not made it yet), `STORAGE_NOT_CONFIGURED`, the lookup and
 * signing errors. Reads only. The caller has already authorized access to the case.
 */
export function makeGetRendition({ assets, renditions, storage, cases }: Pick<MaterialDeps, "assets" | "renditions" | "storage" | "cases">) {
  return async function getRendition(assetId: unknown, specName: unknown): Promise<Result<RenditionLink>> {
    const parsed = parseInput(getRenditionInputSchema, { assetId, specName });
    if (!parsed.ok) return parsed;
    const spec = RENDITION_SPECS[parsed.value.specName];
    if (storage === null) return storageNotConfigured();

    const found = await assets.getById(parsed.value.assetId);
    if (!found.ok) return found;
    const asset = found.value;
    if (asset === null || asset.deletedAt !== null || !hasRenditions(asset.kind) || asset.kind !== spec.source) {
      return err({ code: "NOT_FOUND", message: "No such file.", details: { assetId: parsed.value.assetId } });
    }
    const liveCase = await cases.get(asset.caseId);
    if (!liveCase.ok) {
      return liveCase.error.code === "NOT_FOUND"
        ? err({ code: "NOT_FOUND", message: "No such file.", details: { assetId: asset.id } })
        : liveCase;
    }

    const rendition = await renditions.get(asset.id, specHash(spec));
    if (!rendition.ok) return rendition;
    if (rendition.value === null) {
      return err({ code: RENDITION_NOT_READY, message: "This display copy is not ready yet.", details: { assetId: asset.id, specName: spec.name } });
    }

    const signed = await storage.presignKeys([rendition.value.path], RENDITION_URL_TTL_SECONDS);
    if (!signed.ok) return signed;
    const url = signed.value[0];
    if (url === null || url === undefined) return err({ code: "STORAGE_FAILED", message: "Could not prepare the file link." });
    const { width, height, contentType } = rendition.value;
    return ok({ url, width, height, contentType });
  };
}
