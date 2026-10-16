import type { Actor } from "@/modules/access";
import { FIELD_TOO_LONG, updateClientInputSchema, type Client } from "@/modules/case-study/domain/case-study";
import { parseClientInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

/**
 * Edits a client: name, sector, description and current logo, all as they should
 * be after the save. Its code and every case history code stay the same (AD-21).
 * `logoId` must be a confirmed logo of this client, or null to clear it; the old
 * logo row and object always stay (AD-22). The caller has already authorized
 * `manage clients`. `INVALID_INPUT`, `CLIENT_FIELD_TOO_LONG`, `CLIENT_NOT_FOUND`,
 * `CLIENT_NAME_TAKEN` and `CLIENT_LOGO_INVALID` write nothing.
 */
export function makeUpdateClient(clients: ClientRepository) {
  return async function updateClient(actor: Actor, input: unknown): Promise<Result<Client>> {
    const parsed = parseClientInput(updateClientInputSchema, input, FIELD_TOO_LONG);
    if (!parsed.ok) return parsed;
    const { clientId, name, sector, description, logoId } = parsed.value;
    return clients.update({ id: clientId, name, sector, description, logoId }, actor.id);
  };
}
