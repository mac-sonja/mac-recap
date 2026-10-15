import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import { clientSchema, type Client, type ClientSummary } from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { refusalOf, type Refusals } from "./refusal";

const CLIENT_COLUMNS = "id, name, code";
/** The client with the count of its embedded case studies; the embedded filter keeps non-deleted ones only. */
const CLIENT_SUMMARY_COLUMNS = "id, name, code, case_study(count)";

/** `create_client` raises these as P0001 (AD-21); nothing is written then. */
const CREATE_REFUSALS: Refusals = {
  CLIENT_NAME_TAKEN: { code: "CLIENT_NAME_TAKEN", message: "A client with this name already exists." },
  CLIENT_CODE_EXHAUSTED: { code: "CLIENT_CODE_EXHAUSTED", message: "No free code is left for this client name." },
};
/** `rename_client` raises these as P0001 (AD-21); nothing is written then. */
const RENAME_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
  CLIENT_NAME_TAKEN: CREATE_REFUSALS.CLIENT_NAME_TAKEN,
};

/** Maps a `client` row to the domain shape, rejecting values outside the domain. */
export function toClient(row: { id: string; name: string; code: string }): Result<Client> {
  const parsed = clientSchema.safeParse({ id: row.id, name: row.name, code: row.code });
  if (!parsed.success) {
    return err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { id: row.id } });
  }
  return { ok: true, value: parsed.data };
}

/** Maps a `client` row with its embedded case count; a missing or malformed count fails validation. */
export function toClientSummary(row: {
  id: string;
  name: string;
  code: string;
  case_study: { count: number }[] | null;
}): Result<ClientSummary> {
  const client = toClient(row);
  if (!client.ok) return client;
  const count = row.case_study?.[0]?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { id: row.id } });
  }
  return ok({ ...client.value, caseCount: count });
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

    async listWithCaseCounts() {
      const { data, error } = await client()
        .from("client")
        .select(CLIENT_SUMMARY_COLUMNS)
        .is("case_study.deleted_at", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        log.error(`client summary list failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not list the clients." });
      }
      const clients: ClientSummary[] = [];
      for (const row of data) {
        const mapped = toClientSummary(row);
        if (!mapped.ok) return mapped;
        clients.push(mapped.value);
      }
      return { ok: true, value: clients };
    },

    async findById(id) {
      const { data, error } = await client().from("client").select(CLIENT_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        log.error(`client lookup failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the client.", details: { id } });
      }
      return data === null ? { ok: true, value: null } : toClient(data);
    },

    async create(name, actorId) {
      const { data, error } = await client().rpc("create_client", { p_name: name, p_actor_id: actorId });
      if (error) {
        const refused = refusalOf(error, CREATE_REFUSALS);
        if (refused) return err(refused);
        log.error(`client create failed: ${error.code}`, { actorId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not add the client." });
      }
      if (data === null) {
        log.error("client create failed: no row returned", { actorId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not add the client." });
      }
      return toClient(data);
    },

    async rename(id, name, actorId) {
      const { data, error } = await client().rpc("rename_client", { p_client_id: id, p_name: name, p_actor_id: actorId });
      if (error) {
        const refused = refusalOf(error, RENAME_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId: id } });
        log.error(`client rename failed: ${error.code}`, { actorId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not rename the client.", details: { clientId: id } });
      }
      if (data === null) {
        log.error("client rename failed: no row returned", { actorId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not rename the client.", details: { clientId: id } });
      }
      return toClient(data);
    },
  };
}
