import { z } from "zod";
import type { Client } from "@/modules/case-study/domain/case-study";
import { err, ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

const notFound = (id: unknown) => err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { id } });

/**
 * Reads one client. Unknown or malformed ids are `CLIENT_NOT_FOUND`. The caller
 * has already authorized `list clients`.
 */
export function makeGetClient(clients: ClientRepository) {
  return async function getClient(id: unknown): Promise<Result<Client>> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) return notFound(id);
    const found = await clients.findById(parsed.data);
    if (!found.ok) return found;
    return found.value === null ? notFound(parsed.data) : ok(found.value);
  };
}
