import type { Actor } from "@/modules/access";
import {
  confirmClientLogoUploadInputSchema,
  isLogoContentType,
  isLogoLargeEnough,
  isLogoSizeAllowed,
  isLogoWithinMaxSide,
  type LogoContentType,
} from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import { logoInvalid, type LogoDeps } from "./logo-deps";

/** The format the stored bytes must have for each declared type (`LogoImage.format`). */
const FORMAT_OF: Readonly<Record<LogoContentType, string>> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

/**
 * Turns an uploaded logo object into a `client_logo` row and returns its id. Only
 * after re-checking the stored object: present, 1 B–5 MB, the declared
 * `Content-Type`, and its real bytes decode as that format with a short side of at
 * least 400 px and no side over 8000 px. Anything else is `CLIENT_LOGO_INVALID` and no row is written (the
 * object stays orphaned, harmlessly). The logo is not
 * shown yet: the dialog's save links it with `updateClient`. The caller has already
 * authorized `manage clients`. Errors: `INVALID_INPUT`, `CLIENT_LOGO_INVALID`,
 * `CLIENT_NOT_FOUND`, `STORAGE_FAILED`, `CLIENT_WRITE_FAILED`.
 */
export function makeConfirmClientLogoUpload({ clients, storage }: LogoDeps) {
  return async function confirmClientLogoUpload(actor: Actor, input: unknown): Promise<Result<{ logoId: string }>> {
    const parsed = parseInput(confirmClientLogoUploadInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, logoId, contentType } = parsed.value;
    if (!isLogoContentType(contentType)) return logoInvalid("type", { clientId, contentType });

    const found = await clients.findById(clientId);
    if (!found.ok) return found;
    if (found.value === null) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { clientId } });

    const target = { clientId, logoId, contentType };
    const head = await storage.head(target);
    if (!head.ok) return head;
    if (head.value === null) return logoInvalid("not uploaded", { clientId, logoId });
    const { sizeBytes, contentType: storedType } = head.value;
    if (!isLogoSizeAllowed(sizeBytes)) return logoInvalid("size", { clientId, logoId, sizeBytes });
    if (storedType !== contentType) return logoInvalid("type", { clientId, logoId, storedType });

    const image = await storage.dimensions(target);
    if (!image.ok) return image;
    if (image.value === null) return logoInvalid("not uploaded", { clientId, logoId });
    const { format, width, height } = image.value;
    if (format !== FORMAT_OF[contentType]) return logoInvalid("type", { clientId, logoId, format });
    if (!isLogoLargeEnough(width, height) || !isLogoWithinMaxSide(width, height)) {
      return logoInvalid("pixels", { clientId, logoId, width, height });
    }

    const inserted = await clients.insertLogo({ id: logoId, clientId, contentType, sizeBytes, createdBy: actor.id });
    if (!inserted.ok) return inserted;
    return ok({ logoId: inserted.value.id });
  };
}
