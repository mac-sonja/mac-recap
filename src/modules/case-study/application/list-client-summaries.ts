import type { ClientSummary } from "@/modules/case-study/domain/case-study";
import { ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

/**
 * Every client with its count of non-deleted case studies, sorted by name
 * (Italian, case- and accent-insensitive; ties keep the repository's order).
 * The caller has already authorized `list clients`.
 */
export function makeListClientSummaries(clients: ClientRepository) {
  return async function listClientSummaries(): Promise<Result<ClientSummary[]>> {
    const listed = await clients.listWithCaseCounts();
    if (!listed.ok) return listed;
    return ok(
      listed.value
        .map((client, index) => ({ client, index }))
        .sort((a, b) => collator.compare(a.client.name, b.client.name) || a.index - b.index)
        .map(({ client }) => client),
    );
  };
}
