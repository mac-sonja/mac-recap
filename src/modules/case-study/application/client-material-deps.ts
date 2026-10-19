import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { ClientMaterialStorage } from "@/modules/case-study/ports/client-material-storage";
import { err } from "@/shared/result";

/** What the client material use cases need. */
export interface ClientMaterialDeps {
  clients: ClientRepository;
  storage: ClientMaterialStorage;
  /** Generates asset ids at presign. */
  newId: () => string;
}

/** How long a client file's thumbnail link stays valid (AD-8: at most 15 minutes). */
export const CLIENT_THUMBNAIL_TTL_SECONDS = 15 * 60;

export const clientNotFound = (clientId: unknown) =>
  err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { clientId } });

/** The one refusal for an uploaded object that is not what was declared (size, type or pixels). */
export const uploadRejected = (reason: string, details?: Record<string, unknown>) =>
  err({ code: "UPLOAD_REJECTED", message: `The uploaded file was refused: ${reason}.`, details });
