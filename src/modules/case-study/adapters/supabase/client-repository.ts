import { logoKey } from "@/modules/case-study/adapters/logo-key";
import type { ClientLogo, ClientRepository } from "@/modules/case-study/ports/client-repository";
import {
  clientRefSchema,
  clientSchema,
  clientSnapshotSchema,
  isLogoContentType,
  type Client,
  type ClientRef,
  type ClientSummary,
} from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { refusalOf, type Refusals } from "./refusal";

const CLIENT_REF_COLUMNS = "id, name, code";
const CLIENT_COLUMNS = "id, name, code, sector, description, logo_id";
/** The client with the count of its embedded case studies; the embedded filter keeps non-deleted ones only. */
const CLIENT_SUMMARY_COLUMNS = "id, name, code, case_study(count)";
const LOGO_COLUMNS = "id, client_id, mime_type, size_bytes";
/** A case's client, embedded through `case_study.client_id` (the only FK from case_study to client). */
const SNAPSHOT_COLUMNS = "id, client(id, name, sector, description, logo_id)";

/** `create_client` raises these as P0001 (AD-21); nothing is written then. */
const CREATE_REFUSALS: Refusals = {
  CLIENT_NAME_TAKEN: { code: "CLIENT_NAME_TAKEN", message: "A client with this name already exists." },
  CLIENT_CODE_EXHAUSTED: { code: "CLIENT_CODE_EXHAUSTED", message: "No free code is left for this client name." },
};
/** `update_client` raises these as P0001 (AD-21, AD-22); nothing is written then. */
const UPDATE_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
  CLIENT_NAME_TAKEN: CREATE_REFUSALS.CLIENT_NAME_TAKEN,
  CLIENT_LOGO_INVALID: { code: "CLIENT_LOGO_INVALID", message: "This logo does not belong to the client." },
};

/** Postgres check_violation; the sector and description checks are the length backstop. */
const CHECK_VIOLATION = "23514";
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** The DB length checks and the field each one guards. */
const LENGTH_CHECKS: Readonly<Record<string, string>> = {
  client_sector_check: "sector",
  client_description_check: "description",
};

/**
 * `CLIENT_FIELD_TOO_LONG` naming the field(s) when the DB's length check refused
 * the write, so the dialog can show the error on the field.
 */
function tooLongOf(error: { code: string; message: string }): AppError | undefined {
  if (error.code !== CHECK_VIOLATION) return undefined;
  const fields = Object.entries(LENGTH_CHECKS)
    .filter(([check]) => error.message.includes(check))
    .map(([, field]) => field);
  if (fields.length === 0) return undefined;
  return { code: "CLIENT_FIELD_TOO_LONG", message: "The sector or description is too long.", details: { fields } };
}

const invalidRow = (id: string) =>
  err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { id } });

/** Maps a `client` row's id, name and code, rejecting values outside the domain. */
export function toClientRef(row: { id: string; name: string; code: string }): Result<ClientRef> {
  const parsed = clientRefSchema.safeParse({ id: row.id, name: row.name, code: row.code });
  return parsed.success ? ok(parsed.data) : invalidRow(row.id);
}

/** Maps a `client` row with its info to the domain shape, rejecting values outside the domain. */
export function toClient(row: {
  id: string;
  name: string;
  code: string;
  sector: string | null;
  description: string | null;
  logo_id: string | null;
}): Result<Client> {
  const parsed = clientSchema.safeParse({
    id: row.id,
    name: row.name,
    code: row.code,
    sector: row.sector,
    description: row.description,
    logoId: row.logo_id,
  });
  return parsed.success ? ok(parsed.data) : invalidRow(row.id);
}

/** Maps a `client` row with its embedded case count; a missing or malformed count fails validation. */
export function toClientSummary(row: {
  id: string;
  name: string;
  code: string;
  case_study: { count: number }[] | null;
}): Result<ClientSummary> {
  const client = toClientRef(row);
  if (!client.ok) return client;
  const count = row.case_study?.[0]?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return invalidRow(row.id);
  return ok({ ...client.value, caseCount: count });
}

/** Maps a `client_logo` row; an unknown mime type fails validation. */
export function toClientLogo(row: { id: string; client_id: string; mime_type: string; size_bytes: number }): Result<ClientLogo> {
  if (!isLogoContentType(row.mime_type)) {
    return err({ code: "CLIENT_INVALID", message: "A client logo row failed validation.", details: { id: row.id } });
  }
  return ok({ id: row.id, clientId: row.client_id, contentType: row.mime_type, sizeBytes: Number(row.size_bytes) });
}

export function createSupabaseClientRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ClientRepository {
  return {
    async list() {
      // `id` breaks ties so equal names keep a stable order between loads.
      const { data, error } = await client()
        .from("client")
        .select(CLIENT_REF_COLUMNS)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        log.error(`client list failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not list the clients." });
      }
      const clients: ClientRef[] = [];
      for (const row of data) {
        const mapped = toClientRef(row);
        if (!mapped.ok) return mapped;
        clients.push(mapped.value);
      }
      return ok(clients);
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
      return ok(clients);
    },

    async findById(id) {
      const { data, error } = await client().from("client").select(CLIENT_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        log.error(`client lookup failed: ${error.code}`, { clientId: id });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the client.", details: { id } });
      }
      return data === null ? ok(null) : toClient(data);
    },

    async create(name, info, actorId) {
      const { data, error } = await client().rpc("create_client", {
        p_name: name,
        // Blank is stored as null by the SQL function (`client_info_text`).
        p_sector: info.sector ?? "",
        p_description: info.description ?? "",
        p_actor_id: actorId,
      });
      if (error) {
        const refused = refusalOf(error, CREATE_REFUSALS) ?? tooLongOf(error);
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

    async update(input, actorId) {
      const { data, error } = await client().rpc("update_client", {
        p_client_id: input.id,
        p_name: input.name,
        p_sector: input.sector ?? "",
        p_description: input.description ?? "",
        // null clears the logo; the generated arg type has no null for a plpgsql parameter.
        p_logo_id: input.logoId as string,
        p_actor_id: actorId,
      });
      if (error) {
        const tooLong = tooLongOf(error);
        if (tooLong) return err(tooLong);
        const refused = refusalOf(error, UPDATE_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId: input.id } });
        log.error(`client update failed: ${error.code}`, { actorId, clientId: input.id });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not save the client.", details: { clientId: input.id } });
      }
      if (data === null) {
        log.error("client update failed: no row returned", { actorId, clientId: input.id });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not save the client.", details: { clientId: input.id } });
      }
      return toClient(data);
    },

    async findLogo(id) {
      const { data, error } = await client().from("client_logo").select(LOGO_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        log.error(`client logo lookup failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the logo.", details: { id } });
      }
      return data === null ? ok(null) : toClientLogo(data);
    },

    async insertLogo(logo) {
      const { data, error } = await client()
        .from("client_logo")
        .insert({
          id: logo.id,
          client_id: logo.clientId,
          path: logoKey(logo.clientId, logo.id, logo.contentType),
          mime_type: logo.contentType,
          size_bytes: logo.sizeBytes,
          created_by: logo.createdBy,
        })
        .select(LOGO_COLUMNS)
        .single();
      if (error) {
        // The same logo id confirmed twice: the first row stands, unchanged.
        if (error.code === UNIQUE_VIOLATION) {
          return err({ code: "CLIENT_LOGO_INVALID", message: "This logo was already confirmed.", details: { clientId: logo.clientId } });
        }
        log.error(`client logo insert failed: ${error.code}`, { actorId: logo.createdBy, clientId: logo.clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not record the logo.", details: { clientId: logo.clientId } });
      }
      return toClientLogo(data);
    },

    async findSnapshotByCaseId(caseId) {
      const { data, error } = await client()
        .from("case_study")
        .select(SNAPSHOT_COLUMNS)
        .eq("id", caseId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        log.error(`client snapshot lookup failed: ${error.code}`, { caseId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the case's client.", details: { caseId } });
      }
      if (data === null) return ok(null);
      const owner = data.client;
      if (owner === null) {
        log.error("client snapshot lookup failed: case without client", { caseId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the case's client.", details: { caseId } });
      }
      const parsed = clientSnapshotSchema.safeParse({
        clientId: owner.id,
        name: owner.name,
        sector: owner.sector,
        description: owner.description,
        logoId: owner.logo_id,
      });
      if (!parsed.success) {
        log.error("client snapshot failed validation", { caseId, clientId: owner.id });
        return err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { caseId } });
      }
      return ok(parsed.data);
    },
  };
}
