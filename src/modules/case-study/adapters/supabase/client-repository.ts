import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import { clientSchema, type Client } from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

const CLIENT_COLUMNS = "id, name, code";

/** Maps a `client` row to the domain shape, rejecting values outside the domain. */
export function toClient(row: { id: string; name: string; code: string }): Result<Client> {
  const parsed = clientSchema.safeParse({ id: row.id, name: row.name, code: row.code });
  if (!parsed.success) {
    return err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { id: row.id } });
  }
  return { ok: true, value: parsed.data };
}

export function createSupabaseClientRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ClientRepository {
  return {
    async list() {
      // `id` breaks ties so equal names keep a stable order between loads.
      const { data, error } = await client()
        .from("client")
        .select(CLIENT_COLUMNS)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        log.error(`client list failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not list the clients." });
      }
      const clients: Client[] = [];
      for (const row of data) {
        const mapped = toClient(row);
        if (!mapped.ok) return mapped;
        clients.push(mapped.value);
      }
      return { ok: true, value: clients };
    },
  };
}
