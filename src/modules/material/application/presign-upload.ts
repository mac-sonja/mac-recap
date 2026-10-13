import type { Actor } from "@/modules/access";
import { presignInputSchema } from "@/modules/material/domain/asset";
import { isAllowedContentType, MAX_ASSETS_PER_CASE, MAX_FILE_BYTES } from "@/modules/material/domain/files";
import { parseInput } from "@/modules/material/domain/validation";
import type { PresignedUpload } from "@/modules/material/ports/object-storage";
import { err, ok, type Result } from "@/shared/result";
import { storageNotConfigured, type MaterialDeps } from "./deps";

export interface PresignedAssetUpload extends PresignedUpload {
  assetId: string;
}

/**
 * Issues a presigned POST for one file of a non-deleted case (any status). The
 * caller has already authorized `upload`. Nothing is stored: the asset row is
 * created only by `confirmUpload`. Errors: `INVALID_INPUT`, `FILE_TYPE_NOT_ALLOWED`,
 * `FILE_TOO_LARGE`, `STORAGE_NOT_CONFIGURED`, `NOT_FOUND`, `FILE_LIMIT_REACHED`.
 */
export function makePresignUpload({ assets, storage, cases, newId }: MaterialDeps) {
  return async function presignUpload(_actor: Actor, input: unknown): Promise<Result<PresignedAssetUpload>> {
    const parsed = parseInput(presignInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, contentType, sizeBytes } = parsed.value;
    if (!isAllowedContentType(contentType)) {
      return err({ code: "FILE_TYPE_NOT_ALLOWED", message: "This file type is not allowed.", details: { contentType } });
    }
    if (sizeBytes > MAX_FILE_BYTES) {
      return err({ code: "FILE_TOO_LARGE", message: "Files can be at most 100 MB.", details: { sizeBytes } });
    }
    if (storage === null) return storageNotConfigured();

    const found = await cases.get(caseId);
    if (!found.ok) return found;
    const live = await assets.countLive(caseId);
    if (!live.ok) return live;
    if (live.value >= MAX_ASSETS_PER_CASE) {
      return err({ code: "FILE_LIMIT_REACHED", message: "This case study already has 20 files.", details: { caseId } });
    }

    const assetId = newId();
    const presigned = await storage.presignUpload({ caseId, assetId, contentType }, MAX_FILE_BYTES);
    if (!presigned.ok) return presigned;
    return ok({ assetId, ...presigned.value });
  };
}
