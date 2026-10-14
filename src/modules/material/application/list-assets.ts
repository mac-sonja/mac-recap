import { listAssetsInputSchema, THUMBNAIL_URL_TTL_SECONDS, type ListedAsset } from "@/modules/material/domain/asset";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * The non-deleted assets of a live case, oldest first (`{ caseId }`). Images get
 * a signed GET of the original valid 15 minutes as `thumbnailUrl` (scaled by
 * the browser, IR-OP12), all signed in one storage call; other kinds, and every
 * asset when storage is `null`, get `null`. Signing never fails the listing: an
 * image that could not be signed gets `null` and a warning is logged (case id
 * only). Reads only. Errors: `INVALID_INPUT`, `NOT_FOUND`, `ASSET_LOOKUP_FAILED`,
 * `ASSET_INVALID`. The caller has already authorized `upload`.
 */
export function makeListAssets({ assets, storage, cases }: Pick<MaterialDeps, "assets" | "storage" | "cases">) {
  return async function listAssets(input: unknown): Promise<Result<ListedAsset[]>> {
    const parsed = parseInput(listAssetsInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const live = await assets.listLive(caseId);
    if (!live.ok) return live;

    const images = storage === null ? [] : live.value.filter((asset) => asset.kind === "image");
    const urls = new Map<string, string | null>();
    if (storage !== null && images.length > 0) {
      const targets = images.map((asset) => ({ caseId, assetId: asset.id, contentType: asset.contentType }));
      const signed = await storage.presignDownloads(targets, THUMBNAIL_URL_TTL_SECONDS);
      if (signed.ok) images.forEach((asset, i) => urls.set(asset.id, signed.value[i] ?? null));
      else log.warn(`thumbnails not signed: ${signed.error.code}`, { caseId });
    }

    return ok(
      live.value.map(({ id, kind, originalFileName, contentType, sizeBytes, createdAt, isFavourite }) => ({
        id,
        kind,
        originalFileName,
        contentType,
        sizeBytes,
        createdAt,
        isFavourite,
        thumbnailUrl: urls.get(id) ?? null,
      })),
    );
  };
}
