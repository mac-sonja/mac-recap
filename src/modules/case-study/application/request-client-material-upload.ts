import type { Actor } from "@/modules/access";
import {
  CLIENT_MATERIAL_MAX_BYTES,
  CLIENT_MATERIAL_MAX_FILES,
  isClientMaterialContentType,
  requestClientMaterialUploadInputSchema,
} from "@/modules/case-study/domain/client-material";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { PresignedClientMaterialUpload } from "@/modules/case-study/ports/client-material-storage";
import { err, ok, type Result } from "@/shared/result";
import { clientNotFound, type ClientMaterialDeps } from "./client-material-deps";

export interface PresignedClientMaterial extends PresignedClientMaterialUpload {
  assetId: string;
}

/**
 * Issues a signed upload (PUT) for one new file of an existing client, under
 * `clients/{clientId}/material/{assetId}.{ext}`. Checked first: the declared type
 * (the case material types, else `FILE_TYPE_NOT_ALLOWED`), the size (1 B–50 MB, else
 * `FILE_TOO_LARGE`) and the cap (`CLIENT_MATERIAL_LIMIT` once the client has 3 files).
 * Nothing is stored: the `client_asset` row is created only by
 * `confirmClientMaterialUpload`. The caller has already authorized `manage clients`.
 * Errors: `INVALID_INPUT`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`,
 * `CLIENT_NOT_FOUND`, `CLIENT_MATERIAL_LIMIT`, `CLIENT_LOOKUP_FAILED`, `STORAGE_FAILED`.
 */
export function makeRequestClientMaterialUpload({ clients, storage, newId }: ClientMaterialDeps) {
  return async function requestClientMaterialUpload(_actor: Actor, input: unknown): Promise<Result<PresignedClientMaterial>> {
    const parsed = parseInput(requestClientMaterialUploadInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, contentType, sizeBytes } = parsed.value;
    if (!isClientMaterialContentType(contentType)) {
      return err({ code: "FILE_TYPE_NOT_ALLOWED", message: "This file type is not allowed.", details: { clientId, contentType } });
    }
    if (sizeBytes < 1 || sizeBytes > CLIENT_MATERIAL_MAX_BYTES) {
      return err({
        code: "FILE_TOO_LARGE",
        message: `Files can be at most ${CLIENT_MATERIAL_MAX_BYTES / (1024 * 1024)} MB.`,
        details: { clientId, sizeBytes },
      });
    }

    const found = await clients.findById(clientId);
    if (!found.ok) return found;
    if (found.value === null) return clientNotFound(clientId);
    const stored = await clients.listAssets(clientId);
    if (!stored.ok) return stored;
    if (stored.value.length >= CLIENT_MATERIAL_MAX_FILES) {
      return err({ code: "CLIENT_MATERIAL_LIMIT", message: "This client already has 3 files.", details: { clientId } });
    }

    const assetId = newId();
    const presigned = await storage.presignUpload({ clientId, assetId, contentType });
    if (!presigned.ok) return presigned;
    return ok({ assetId, ...presigned.value });
  };
}
