import { z } from "zod";
import type { LogoContentType } from "@/modules/case-study/domain/case-study";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import { err, ok, type Result } from "@/shared/result";

/** A client's current logo file. */
export interface ClientLogoFile {
  bytes: Uint8Array;
  contentType: LogoContentType;
}

/**
 * The bytes of a client's current logo (Story 5.3: exports draw it inline, an SVG
 * rasterised first), or `null` when the client has no logo or its row or object is
 * missing. An object over `LOGO_MAX_BYTES` comes back with empty bytes. Unknown,
 * malformed or deleted clients are `CLIENT_NOT_FOUND`. No authorization of its own.
 */
export function makeReadClientLogo(clients: Pick<ClientRepository, "findById" | "findLogo">, storage: Pick<LogoStorage, "read">) {
  return async function readClientLogo(clientId: unknown): Promise<Result<ClientLogoFile | null>> {
    const parsed = z.uuid().safeParse(clientId);
    if (!parsed.success) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { id: clientId } });
    const found = await clients.findById(parsed.data);
    if (!found.ok) return found;
    if (found.value === null) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { id: parsed.data } });
    if (found.value.logoId === null) return ok(null);
    const logo = await clients.findLogo(found.value.logoId);
    if (!logo.ok) return logo;
    if (logo.value === null) return ok(null);
    const target = { clientId: found.value.id, logoId: logo.value.id, contentType: logo.value.contentType };
    const bytes = await storage.read(target);
    if (!bytes.ok) return bytes;
    return bytes.value === null ? ok(null) : ok({ bytes: bytes.value, contentType: logo.value.contentType });
  };
}
