import type { Actor } from "@/modules/access";
import {
  isLogoContentType,
  isLogoSizeAllowed,
  requestClientLogoUploadInputSchema,
} from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { PresignedLogoUpload } from "@/modules/case-study/ports/logo-storage";
import { err, ok, type Result } from "@/shared/result";
import { logoInvalid, type LogoDeps } from "./logo-deps";

export interface PresignedClientLogoUpload extends PresignedLogoUpload {
  logoId: string;
}

/**
 * Issues a signed upload (PUT) for a new logo of an existing client, under
 * `clients/{clientId}/logos/{logoId}.{ext}`. The declared type (PNG, JPEG,
 * WebP or SVG) and size (1 B–5 MB) are checked first: `CLIENT_LOGO_INVALID` otherwise.
 * Nothing is stored: the `client_logo` row is created only by
 * `confirmClientLogoUpload`. The caller has already authorized `manage clients`.
 * Errors: `INVALID_INPUT`, `CLIENT_LOGO_INVALID`, `CLIENT_NOT_FOUND`, `STORAGE_FAILED`.
 */
export function makeRequestClientLogoUpload({ clients, storage, newId }: LogoDeps) {
  return async function requestClientLogoUpload(_actor: Actor, input: unknown): Promise<Result<PresignedClientLogoUpload>> {
    const parsed = parseInput(requestClientLogoUploadInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, contentType, sizeBytes } = parsed.value;
    if (!isLogoContentType(contentType)) return logoInvalid("type", { clientId, contentType });
    if (!isLogoSizeAllowed(sizeBytes)) return logoInvalid("size", { clientId, sizeBytes });

    const found = await clients.findById(clientId);
    if (!found.ok) return found;
    if (found.value === null) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { clientId } });

    const logoId = newId();
    const presigned = await storage.presignUpload({ clientId, logoId, contentType });
    if (!presigned.ok) return presigned;
    return ok({ logoId, ...presigned.value });
  };
}
