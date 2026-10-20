import { listAssetsInputSchema, THUMBNAIL_URL_TTL_SECONDS, type Asset, type ListedAsset } from "@/modules/material/domain/asset";
import { parseInput } from "@/modules/material/domain/validation";
import { hasRenditions, THUMBNAIL_SPEC, type Rendition } from "@/modules/material/domain/rendition";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";
import { specHashOf } from "./spec-hash";

const THUMB_HASHES = { image: specHashOf(THUMBNAIL_SPEC.image), video: specHashOf(THUMBNAIL_SPEC.video) };

/**
 * The non-deleted assets of a live case, oldest first (`{ caseId }`). The
 * `thumbnailUrl` (signed GET, valid 15 minutes) is the asset's thumbnail
 * rendition when it exists and could be signed (`image.thumb` for images,
 * `video.poster` for videos); otherwise an image gets its original (scaled by
 * the browser, IR-OP12) and a video `null`. `thumbnailPending` is true only
 * for an image or video without its thumbnail rendition whose `rendition` job
 * is still queued or running: a failed job, a failed enqueue or a file from
 * before renditions is not pending (it keeps the fallback). Documents and text
 * files get `null` / `false`, and every asset gets a `null` URL when storage
 * is `null`. Signing never fails the listing: an asset that could not be
 * signed gets `null` and a warning is logged (case id only); a failed
 * rendition or job read falls back to the originals, not pending. Reads only.
 * Errors: `INVALID_INPUT`, `NOT_FOUND`, `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`.
 * The caller has already authorized `upload`.
 */
export function makeListAssets({
  assets,
  renditions,
  storage,
  cases,
  jobs,
}: Pick<MaterialDeps, "assets" | "renditions" | "storage" | "cases" | "jobs">) {
  return async function listAssets(input: unknown): Promise<Result<ListedAsset[]>> {
    const parsed = parseInput(listAssetsInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const live = await assets.listLive(caseId);
    if (!live.ok) return live;

    const media = live.value.filter((asset) => hasRenditions(asset.kind));
    const thumbs = new Map<string, Rendition>();
    if (media.length > 0) {
      const read = await renditions.listFor(
        media.map((asset) => asset.id),
        [THUMB_HASHES.image, THUMB_HASHES.video],
      );
      if (read.ok) {
        for (const r of read.value) {
          const asset = media.find((a) => a.id === r.assetId);
          if (asset !== undefined && hasRenditions(asset.kind) && r.specHash === THUMB_HASHES[asset.kind]) thumbs.set(r.assetId, r);
        }
      } else {
        log.warn(`thumbnail renditions not read: ${read.error.code}`, { caseId });
      }
    }

    // Pending only while a rendition job for the asset is still queued or running.
    const waiting = new Set<string>();
    const withoutThumb = media.filter((asset) => !thumbs.has(asset.id)).map((asset) => asset.id);
    if (withoutThumb.length > 0) {
      const liveJobs = await jobs.liveSubjects({ kind: "rendition", subjectIds: withoutThumb });
      if (liveJobs.ok) for (const id of liveJobs.value) waiting.add(id);
      else log.warn(`rendition jobs not read: ${liveJobs.error.code}`, { caseId });
    }

    const urls = new Map<string, string | null>();
    if (storage !== null) {
      const withRendition = media.filter((asset) => thumbs.has(asset.id));
      if (withRendition.length > 0) {
        const signed = await storage.presignKeys(
          withRendition.map((asset) => (thumbs.get(asset.id) as Rendition).path),
          THUMBNAIL_URL_TTL_SECONDS,
        );
        if (signed.ok) withRendition.forEach((asset, i) => urls.set(asset.id, signed.value[i] ?? null));
        else log.warn(`thumbnail renditions not signed: ${signed.error.code}`, { caseId });
      }
      // Images without a signed rendition (none made, or its signing failed) fall back to the original.
      const originals = live.value.filter((asset) => asset.kind === "image" && !urls.get(asset.id));
      if (originals.length > 0) {
        const targets = originals.map((asset) => ({ caseId, assetId: asset.id, contentType: asset.contentType }));
        const signed = await storage.presignDownloads(targets, THUMBNAIL_URL_TTL_SECONDS);
        if (signed.ok) originals.forEach((asset, i) => urls.set(asset.id, signed.value[i] ?? null));
        else log.warn(`thumbnails not signed: ${signed.error.code}`, { caseId });
      }
    }

    const pending = (asset: Asset) => hasRenditions(asset.kind) && !thumbs.has(asset.id) && waiting.has(asset.id);

    return ok(
      live.value.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        originalFileName: asset.originalFileName,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        createdAt: asset.createdAt,
        isFavourite: asset.isFavourite,
        thumbnailUrl: urls.get(asset.id) ?? null,
        thumbnailPending: pending(asset),
      })),
    );
  };
}
