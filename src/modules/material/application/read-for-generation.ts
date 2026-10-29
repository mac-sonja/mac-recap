import { z } from "zod";
import type { AllowedContentType, AssetKind } from "@/modules/material/domain/files";
import { RENDITION_NOT_READY, RENDITION_SPECS } from "@/modules/material/domain/rendition";
import { caseIdSchema, parseInput } from "@/modules/material/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import { storageNotConfigured, type MaterialDeps } from "./deps";
import { specHash } from "./spec-hash";

/** One live asset as generation reads it (Story 3.6): kind, type, size and the favourite flag; never its file name. */
export interface GenerationAsset {
  id: string;
  kind: AssetKind;
  contentType: AllowedContentType;
  sizeBytes: number;
  isFavourite: boolean;
}

/**
 * The live assets of a case, oldest first, with their favourite flag (Story 3.6: favourite
 * images go to the AI first). Reads only; never touches storage. Errors: `INVALID_INPUT`,
 * `NOT_FOUND`, `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`.
 */
export function makeListGenerationAssets({ assets, cases }: Pick<MaterialDeps, "assets" | "cases">) {
  return async function listGenerationAssets(caseId: unknown): Promise<Result<GenerationAsset[]>> {
    const parsed = parseInput(caseIdSchema, caseId);
    if (!parsed.ok) return parsed;
    const found = await cases.get(parsed.value);
    if (!found.ok) return found;
    const live = await assets.listLive(parsed.value);
    if (!live.ok) return live;
    return ok(live.value.map((a) => ({ id: a.id, kind: a.kind, contentType: a.contentType, sizeBytes: a.sizeBytes, isFavourite: a.isFavourite })));
  };
}

/** Which bytes of an asset: the uploaded file, or an image's display rendition (2048 px WebP). */
export const ASSET_BYTES_VARIANTS = ["original", "image.display"] as const;
export type AssetBytesVariant = (typeof ASSET_BYTES_VARIANTS)[number];

const readInputSchema = z.object({ caseId: z.uuid(), assetId: z.uuid(), variant: z.enum(ASSET_BYTES_VARIANTS) });

/**
 * The bytes of one live asset of one case (Story 3.6, worker only: the generate job reads the
 * material it sends to the AI). `image.display` is for images only. Errors: `INVALID_INPUT`,
 * `NOT_FOUND` (no such live asset in the case, a missing object, or `image.display` of a
 * non-image), `RENDITION_NOT_READY`, `STORAGE_NOT_CONFIGURED`, the lookup and download errors.
 */
export function makeReadAssetBytes(
  { assets, renditions, storage }: Pick<MaterialDeps, "assets" | "renditions" | "storage">,
  originalKey: (asset: { caseId: string; id: string; contentType: AllowedContentType }) => string,
) {
  return async function readAssetBytes(input: unknown): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
    const parsed = parseInput(readInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, assetId, variant } = parsed.value;
    if (storage === null) return storageNotConfigured();
    const notFound = () => err({ code: "NOT_FOUND", message: "No such file.", details: { assetId } });

    const found = await assets.get(caseId, assetId);
    if (!found.ok) return found;
    const asset = found.value;
    if (asset === null || asset.deletedAt !== null) return notFound();

    let key: string;
    let contentType: string;
    if (variant === "original") {
      key = originalKey(asset);
      contentType = asset.contentType;
    } else {
      if (asset.kind !== "image") return notFound();
      const spec = RENDITION_SPECS["image.display"];
      const rendition = await renditions.get(asset.id, specHash(spec));
      if (!rendition.ok) return rendition;
      if (rendition.value === null) {
        return err({ code: RENDITION_NOT_READY, message: "This display copy is not ready yet.", details: { assetId, specName: spec.name } });
      }
      key = rendition.value.path;
      contentType = rendition.value.contentType;
    }
    const downloaded = await storage.download(key);
    if (!downloaded.ok) return downloaded;
    if (downloaded.value === null) return notFound();
    return ok({ bytes: downloaded.value, contentType });
  };
}
