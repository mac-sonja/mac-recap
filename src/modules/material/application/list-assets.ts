import { listAssetsInputSchema, THUMBNAIL_URL_TTL_SECONDS, type ListedAsset } from "@/modules/material/domain/asset";
import { parseInput } from "@/modules/material/domain/validation";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * The non-deleted assets of a live case, oldest first (`{ caseId }`). Images get
 * a presigned GET of the original valid 15 minutes as `thumbnailUrl` (scaled by
 * the browser, IR-OP12); other kinds, and every asset when S3 isn't configured,
 * get `null`. Images are signed in parallel; signing is local. Reads only.
 * Errors: `INVALID_INPUT`, `NOT_FOUND`, `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`,
 * `STORAGE_FAILED`. The caller has already authorized `upload`.
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

    const urls = await Promise.all(
      live.value.map((asset) =>
        asset.kind === "image" && storage !== null
          ? storage.presignDownload({ caseId, assetId: asset.id, contentType: asset.contentType }, THUMBNAIL_URL_TTL_SECONDS)
          : Promise.resolve(ok(null)),
      ),
    );
    const listed: ListedAsset[] = [];
    for (const [i, asset] of live.value.entries()) {
      const url = urls[i];
      if (!url.ok) return url;
      const { id, kind, originalFileName, contentType, sizeBytes, createdAt, isFavourite } = asset;
      listed.push({ id, kind, originalFileName, contentType, sizeBytes, createdAt, isFavourite, thumbnailUrl: url.value });
    }
    return ok(listed);
  };
}
