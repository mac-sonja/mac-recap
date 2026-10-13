import type { Actor } from "@/modules/access";
import { ASSET_UPLOADED, confirmInputSchema, type Asset } from "@/modules/material/domain/asset";
import { isAllowedContentType, kindFor, MAX_FILE_BYTES } from "@/modules/material/domain/files";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { storageNotConfigured, type MaterialDeps } from "./deps";

/**
 * Turns an uploaded object into an asset. HEAD-checks the object (present, ≤ 100 MB,
 * same `Content-Type`), inserts the row under the per-case cap lock, then records
 * `asset_uploaded { assetId }`. If the event write fails the row is soft-deleted
 * again and the error returned, so no asset exists without its event. Case status
 * never changes. The caller has already authorized `upload`.
 */
export function makeConfirmUpload({ assets, storage, cases }: MaterialDeps) {
  return async function confirmUpload(actor: Actor, input: unknown): Promise<Result<Asset>> {
    const parsed = parseInput(confirmInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, assetId, contentType, fileName } = parsed.value;
    if (!isAllowedContentType(contentType)) {
      return err({ code: "FILE_TYPE_NOT_ALLOWED", message: "This file type is not allowed.", details: { contentType } });
    }
    if (storage === null) return storageNotConfigured();

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const head = await storage.head({ caseId, assetId, contentType });
    if (!head.ok) return head;
    if (head.value === null) {
      return err({ code: "UPLOAD_NOT_FOUND", message: "The uploaded file was not found.", details: { caseId, assetId } });
    }
    const { sizeBytes, contentType: storedType } = head.value;
    if (sizeBytes < 1 || sizeBytes > MAX_FILE_BYTES || storedType !== contentType) {
      return err({
        code: "UPLOAD_REJECTED",
        message: "The uploaded file does not match what was requested.",
        details: { caseId, assetId, sizeBytes, storedType },
      });
    }

    const created = await assets.create({
      id: assetId,
      caseId,
      kind: kindFor(contentType),
      originalFileName: fileName,
      contentType,
      sizeBytes,
      createdBy: actor.id,
    });
    if (!created.ok) return created;

    const event = await cases.recordEvent(actor, { caseId, type: ASSET_UPLOADED, data: { assetId } });
    if (!event.ok) {
      const undone = await assets.softDelete(caseId, assetId);
      if (!undone.ok || !undone.value) {
        log.error("asset left without its asset_uploaded event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(created.value);
  };
}
