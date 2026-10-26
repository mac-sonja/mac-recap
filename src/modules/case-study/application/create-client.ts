import type { Actor } from "@/modules/access";
import { createClientInputSchema, FIELD_INVALID, FIELD_TOO_LONG, type Client } from "@/modules/case-study/domain/case-study";
import { parseClientInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

/**
 * Adds a client with an automatic code (assigned in SQL, AD-21), its sector (one
 * `client_sector` key) and its description (trimmed, required).
 * The logo is linked afterwards with `updateClient`, since its key needs the new
 * client's id, and the brief is saved with `saveClientBriefField`; until then the
 * client is unfinished. The caller has already authorized `manage clients`.
 * `INVALID_INPUT` (name blank or over 120 characters after trimming),
 * `CLIENT_FIELD_INVALID` (no sector, an unknown one, or a blank description), `CLIENT_FIELD_TOO_LONG` (description over 400 characters),
 * `CLIENT_NAME_TAKEN` and `CLIENT_CODE_EXHAUSTED` write nothing.
 */
export function makeCreateClient(clients: ClientRepository) {
  return async function createClient(actor: Actor, input: unknown): Promise<Result<Client>> {
    const parsed = parseClientInput(createClientInputSchema, input, { tooLong: FIELD_TOO_LONG, invalid: FIELD_INVALID });
    if (!parsed.ok) return parsed;
    const { name, industry, description } = parsed.value;
    return clients.create(name, { industry, description }, actor.id);
  };
}
