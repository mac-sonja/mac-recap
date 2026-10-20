import type { Actor } from "@/modules/access";
import { deleteClientInputSchema } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

/** What `deleteClient` did: the number of case histories deleted with the client. */
export interface ClientDeleted {
  deletedCases: number;
}

/**
 * Deletes a client (owner, 2026-10-19: clients can be deleted (soft), with their
 * cases): input `{ clientId, confirmName }`, where `confirmName` must equal the
 * client's name once trimmed with inner whitespace collapsed. The client and every
 * one of its non-deleted cases, approved ones included, get `deleted_at` in one
 * transaction, with one `case_deleted` case event per case. Nothing is hard-deleted: rows,
 * objects and events stay. The caller has already authorized `manage clients`.
 * Errors: `INVALID_INPUT`, `CLIENT_NOT_FOUND` (unknown or already deleted),
 * `CLIENT_DELETE_NAME_MISMATCH`, `CLIENT_WRITE_FAILED`; nothing is written on any of them.
 */
export function makeDeleteClient(clients: ClientRepository) {
  return async function deleteClient(actor: Actor, input: unknown): Promise<Result<ClientDeleted>> {
    const parsed = parseInput(deleteClientInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, confirmName } = parsed.value;
    const deleted = await clients.deleteClient(clientId, confirmName, actor.id);
    if (!deleted.ok) return deleted;
    return { ok: true, value: { deletedCases: deleted.value } };
  };
}
