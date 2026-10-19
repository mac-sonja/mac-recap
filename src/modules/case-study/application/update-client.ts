import type { Actor } from "@/modules/access";
import { FIELD_INVALID, FIELD_TOO_LONG, updateClientInputSchema, type Client } from "@/modules/case-study/domain/case-study";
import { parseClientInput } from "@/modules/case-study/domain/validation";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";

/**
 * Edits a client: name, industries, description and current logo, all required and
 * as they should be after the save. Its code and every case history code stay the
 * same (AD-21). Client info is live (owner, 2026-10-16): every case history shows
 * the new values. `logoId` must be a confirmed logo of this client; a logo can be
 * replaced but not cleared. Once the client points at the new logo, the old logo is deleted for real: its
 * `client_logo` row, then its object. A failed delete never fails the save; it is
 * logged with the client id only. The caller has already authorized
 * `manage clients`. `INVALID_INPUT`, `CLIENT_FIELD_INVALID`, `CLIENT_FIELD_TOO_LONG`,
 * `CLIENT_NOT_FOUND`, `CLIENT_NAME_TAKEN` and `CLIENT_LOGO_INVALID` write nothing.
 */
export function makeUpdateClient(clients: ClientRepository, storage: LogoStorage) {
  return async function updateClient(actor: Actor, input: unknown): Promise<Result<Client>> {
    const parsed = parseClientInput(updateClientInputSchema, input, { tooLong: FIELD_TOO_LONG, invalid: FIELD_INVALID });
    if (!parsed.ok) return parsed;
    const { clientId, name, industries, description, logoId } = parsed.value;

    // The logo shown before this save; read first, since `update_client` returns only the new row.
    const before = await clients.findById(clientId);
    const oldLogoId = before.ok ? (before.value?.logoId ?? null) : null;

    const updated = await clients.update({ id: clientId, name, industries, description, logoId }, actor.id);
    if (!updated.ok) return updated;
    if (oldLogoId !== null && oldLogoId !== updated.value.logoId) await deleteOldLogo(clients, storage, clientId, oldLogoId);
    return ok(updated.value);
  };
}

/** Deletes a logo no client shows any more: the row (refused if still in use), then the object. Never fails. */
async function deleteOldLogo(clients: ClientRepository, storage: LogoStorage, clientId: string, logoId: string): Promise<void> {
  const logo = await clients.findLogo(logoId);
  if (!logo.ok || logo.value === null) {
    if (!logo.ok) log.warn("old client logo could not be read for deletion", { clientId });
    return;
  }
  const deleted = await clients.deleteLogo(logoId);
  if (!deleted.ok) {
    log.warn(`old client logo row not deleted: ${deleted.error.code}`, { clientId });
    return;
  }
  const removed = await storage.remove({ clientId, logoId, contentType: logo.value.contentType });
  if (!removed.ok) log.warn("old client logo file not deleted", { clientId });
}
