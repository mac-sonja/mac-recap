import { z } from "zod";
import type { ClientDetail } from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";

/** How long the client page's logo link stays valid (AD-8: at most 15 minutes). */
export const LOGO_URL_TTL_SECONDS = 10 * 60;

const notFound = (id: unknown) => err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { id } });

/**
 * Reads one client with a signed URL for its current logo. Unknown or malformed
 * ids are `CLIENT_NOT_FOUND`. A logo that can't be read or signed never fails the
 * read: `logoUrl` is null and the failure is logged with the client id only. The
 * caller has already authorized `list clients`.
 */
export function makeGetClient(clients: ClientRepository, storage: LogoStorage) {
  return async function getClient(id: unknown): Promise<Result<ClientDetail>> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) return notFound(id);
    const found = await clients.findById(parsed.data);
    if (!found.ok) return found;
    const client = found.value;
    if (client === null) return notFound(parsed.data);
    if (client.logoId === null) return ok({ ...client, logoUrl: null });

    const logo = await clients.findLogo(client.logoId);
    if (!logo.ok || logo.value === null) {
      log.warn("client logo could not be read", { clientId: client.id });
      return ok({ ...client, logoUrl: null });
    }
    const signed = await storage.presignDownload(
      { clientId: client.id, logoId: logo.value.id, contentType: logo.value.contentType },
      LOGO_URL_TTL_SECONDS,
    );
    if (!signed.ok) {
      log.warn("client logo could not be signed", { clientId: client.id });
      return ok({ ...client, logoUrl: null });
    }
    return ok({ ...client, logoUrl: signed.value });
  };
}
