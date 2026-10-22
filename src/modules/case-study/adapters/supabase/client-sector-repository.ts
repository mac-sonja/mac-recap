import { clientSectorSchema, type ClientSector } from "@/modules/case-study/domain/case-study";
import type { ClientSectorRepository } from "@/modules/case-study/ports/client-sector-repository";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { refusalOf, type Refusals } from "./refusal";

const SECTOR_COLUMNS = "key, label";

/** `add_client_sector` raises this as P0001; nothing is written then. */
const ADD_REFUSALS: Refusals = {
  SECTOR_LABEL_INVALID: { code: "SECTOR_LABEL_INVALID", message: "A sector name is 2 to 40 characters." },
};

/** Maps a `client_sector` row, rejecting a malformed key. */
export function toClientSector(row: { key: string; label: string }): Result<ClientSector> {
  const parsed = clientSectorSchema.safeParse({ key: row.key, label: row.label });
  return parsed.success
    ? ok(parsed.data)
    : err({ code: "CLIENT_INVALID", message: "A sector row failed validation.", details: { key: row.key } });
}

export function createSupabaseClientSectorRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ClientSectorRepository {
  return {
    async list() {
      const { data, error } = await client().from("client_sector").select(SECTOR_COLUMNS).order("position", { ascending: true });
      if (error) {
        log.error(`client sector list failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not list the sectors." });
      }
      const sectors: ClientSector[] = [];
      for (const row of data) {
        const mapped = toClientSector(row);
        if (!mapped.ok) return mapped;
        sectors.push(mapped.value);
      }
      return ok(sectors);
    },

    async add(label, actorId) {
      const { data, error } = await client().rpc("add_client_sector", { p_label: label, p_actor_id: actorId });
      if (error) {
        const refused = refusalOf(error, ADD_REFUSALS);
        if (refused) return err({ ...refused, details: { fields: ["label"] } });
        log.error(`client sector add failed: ${error.code}`, { actorId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not add the sector." });
      }
      if (data === null) {
        log.error("client sector add failed: no row returned", { actorId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not add the sector." });
      }
      return toClientSector(data);
    },
  };
}
