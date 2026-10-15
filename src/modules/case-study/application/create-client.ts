import type { Actor } from "@/modules/access";
import { createClientInputSchema, type Client } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

/**
 * Adds a client with an automatic code (assigned in SQL, AD-21). The caller has
 * already authorized `manage clients`. `INVALID_INPUT` (name blank or over 120
 * characters after trimming), `CLIENT_NAME_TAKEN` and `CLIENT_CODE_EXHAUSTED` write nothing.
 */
export function makeCreateClient(clients: ClientRepository) {
  return async function createClient(actor: Actor, input: unknown): Promise<Result<Client>> {
    const parsed = parseInput(createClientInputSchema, input);
    if (!parsed.ok) return parsed;
    return clients.create(parsed.value.name, actor.id);
  };
}
