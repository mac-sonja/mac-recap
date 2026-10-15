import type { Client } from "@/modules/case-study/domain/case-study";
import { ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

/**
 * Every client, sorted by name (Italian, case- and accent-insensitive; ties keep
 * the repository's order). The caller has already authorized `list clients`.
 */
export function makeListClients(clients: ClientRepository) {
  return async function listClients(): Promise<Result<Client[]>> {
    const listed = await clients.list();
    if (!listed.ok) return listed;
    return ok(
      listed.value
        .map((client, index) => ({ client, index }))
        .sort((a, b) => collator.compare(a.client.name, b.client.name) || a.index - b.index)
        .map(({ client }) => client),
    );
  };
}
