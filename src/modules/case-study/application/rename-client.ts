import type { Actor } from "@/modules/access";
import { renameClientInputSchema, type Client } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

/**
 * Renames a client; its code and every case history code stay the same (AD-21).
 * The caller has already authorized `manage clients`. `INVALID_INPUT`,
 * `CLIENT_NOT_FOUND` and `CLIENT_NAME_TAKEN` write nothing. Renaming a client to
 * its own name (or a variant of it) is allowed.
 */
export function makeRenameClient(clients: ClientRepository) {
  return async function renameClient(actor: Actor, input: unknown): Promise<Result<Client>> {
    const parsed = parseInput(renameClientInputSchema, input);
    if (!parsed.ok) return parsed;
    return clients.rename(parsed.value.clientId, parsed.value.name, actor.id);
  };
}
