import type { Actor } from "@/modules/access";
import {
  clientMaterialKindFor,
  confirmClientMaterialUploadInputSchema,
  isClientImageSizeAllowed,
  isClientMaterialContentType,
  isClientMaterialSizeAllowed,
  type ClientMaterialContentType,
  type ListedClientAsset,
} from "@/modules/case-study/domain/client-material";
import { parseInput } from "@/modules/case-study/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import { clientNotFound, uploadRejected, type ClientMaterialDeps } from "./client-material-deps";

/** The format an image's stored bytes must have for each declared type (`ClientMaterialImage.format`). */
const IMAGE_FORMAT_OF: Readonly<Partial<Record<ClientMaterialContentType, string>>> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

/**
 * Turns an uploaded client file into a `client_asset` row, only after re-checking the
 * stored object: present (else `UPLOAD_NOT_FOUND`), 1 B–50 MB and the declared
 * `Content-Type`; an image's real bytes must also decode as that format with a short
 * side of at least 1600 px and no side over 8000 px. Anything else is
 * `UPLOAD_REJECTED` (pixels: `CLIENT_IMAGE_SIZE_INVALID`) and no row is written (the
 * object stays orphaned, harmlessly).
 * Other types get the type and size checks only. The database picks the lowest free
 * position and refuses a 4th file (`CLIENT_MATERIAL_LIMIT`). Returns the listed file
 * (no thumbnail yet: the step lists again for it). The caller has already authorized
 * `manage clients`. Errors: `INVALID_INPUT`, `FILE_TYPE_NOT_ALLOWED`,
 * `CLIENT_NOT_FOUND`, `UPLOAD_NOT_FOUND`, `UPLOAD_REJECTED`, `CLIENT_IMAGE_SIZE_INVALID`, `CLIENT_MATERIAL_LIMIT`,
 * `ASSET_ALREADY_CONFIRMED`, `STORAGE_FAILED`, `CLIENT_WRITE_FAILED`.
 */
export function makeConfirmClientMaterialUpload({ clients, storage }: ClientMaterialDeps) {
  return async function confirmClientMaterialUpload(actor: Actor, input: unknown): Promise<Result<ListedClientAsset>> {
    const parsed = parseInput(confirmClientMaterialUploadInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, assetId, contentType, fileName } = parsed.value;
    if (!isClientMaterialContentType(contentType)) {
      return err({ code: "FILE_TYPE_NOT_ALLOWED", message: "This file type is not allowed.", details: { clientId, contentType } });
    }

    const found = await clients.findById(clientId);
    if (!found.ok) return found;
    if (found.value === null) return clientNotFound(clientId);

    const target = { clientId, assetId, contentType };
    const head = await storage.head(target);
    if (!head.ok) return head;
    if (head.value === null) {
      return err({ code: "UPLOAD_NOT_FOUND", message: "The uploaded file was not found.", details: { clientId, assetId } });
    }
    const { sizeBytes, contentType: storedType } = head.value;
    if (!isClientMaterialSizeAllowed(sizeBytes)) return uploadRejected("size", { clientId, assetId, sizeBytes });
    if (storedType !== contentType) return uploadRejected("type", { clientId, assetId, storedType });

    let width: number | null = null;
    let height: number | null = null;
    if (clientMaterialKindFor(contentType) === "image") {
      const image = await storage.dimensions(target);
      if (!image.ok) return image;
      if (image.value === null) {
        return err({ code: "UPLOAD_NOT_FOUND", message: "The uploaded file was not found.", details: { clientId, assetId } });
      }
      const { format } = image.value;
      if (format !== IMAGE_FORMAT_OF[contentType]) return uploadRejected("type", { clientId, assetId, format });
      if (!isClientImageSizeAllowed(image.value.width, image.value.height)) {
        return err({
          code: "CLIENT_IMAGE_SIZE_INVALID",
          message: "The image must be at least 1600 px on the short side and at most 8000 px on any side.",
          details: { clientId, assetId, width: image.value.width, height: image.value.height },
        });
      }
      ({ width, height } = image.value);
    }

    const inserted = await clients.insertAsset({ id: assetId, clientId, fileName, contentType, sizeBytes, width, height, createdBy: actor.id });
    if (!inserted.ok) return inserted;
    return ok({ ...inserted.value, thumbnailUrl: null });
  };
}
