import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import { err } from "@/shared/result";

/** What the logo use cases need. */
export interface LogoDeps {
  clients: ClientRepository;
  storage: LogoStorage;
  /** Generates logo ids at presign. */
  newId: () => string;
}

/** The one refusal for a logo that is not acceptable (type, size, pixels, owner, or a missing object). */
export const logoInvalid = (reason: string, details?: Record<string, unknown>) =>
  err({ code: "CLIENT_LOGO_INVALID", message: `The logo was refused: ${reason}.`, details });
