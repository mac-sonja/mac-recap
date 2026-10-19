import { logoKey } from "@/modules/case-study/adapters/logo-key";
import type { ClientLogo, ClientRepository } from "@/modules/case-study/ports/client-repository";
import {
  clientBriefSchema,
  clientRefSchema,
  clientSchema,
  caseClientInfoSchema,
  emptyClientBrief,
  isClientComplete,
  isLogoContentType,
  type Client,
  type ClientBrief,
  type ClientRef,
  type ClientSummary,
} from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { RAISE_EXCEPTION, refusalOf, type Refusals } from "./refusal";

const CLIENT_REF_COLUMNS = "id, name, code";
const CLIENT_COLUMNS = "id, name, code, industries, description, logo_id";
const BRIEF_COLUMNS = "context, solution, results";
/**
 * The client with what `isClientComplete` reads and the count of its embedded case
 * studies; the embedded filter keeps non-deleted ones only.
 */
const CLIENT_SUMMARY_COLUMNS = `${CLIENT_COLUMNS}, client_brief(${BRIEF_COLUMNS}), case_study(count)`;
const LOGO_COLUMNS = "id, client_id, mime_type, size_bytes";
/** A case's client and its brief, embedded through `case_study.client_id` (the only FK from case_study to client). */
const CASE_CLIENT_COLUMNS = `id, client(id, name, industries, description, logo_id, client_brief(${BRIEF_COLUMNS}))`;

/** `create_client` raises these as P0001 (AD-21); nothing is written then. */
const CREATE_REFUSALS: Refusals = {
  CLIENT_NAME_TAKEN: { code: "CLIENT_NAME_TAKEN", message: "A client with this name already exists." },
  CLIENT_CODE_EXHAUSTED: { code: "CLIENT_CODE_EXHAUSTED", message: "No free code is left for this client name." },
};
/** `save_client_brief_field` raises these as P0001; nothing is written then. */
const BRIEF_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
  UNKNOWN_FIELD: { code: "UNKNOWN_FIELD", message: "Unknown field." },
};
/** `update_client` raises these as P0001 (AD-21, AD-22); nothing is written then. */
const UPDATE_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
  CLIENT_NAME_TAKEN: CREATE_REFUSALS.CLIENT_NAME_TAKEN,
  CLIENT_LOGO_INVALID: { code: "CLIENT_LOGO_INVALID", message: "This logo does not belong to the client." },
};

/** `delete_client_logo` raises this as P0001; nothing is deleted then. */
const DELETE_LOGO_REFUSALS: Refusals = {
  CLIENT_LOGO_IN_USE: { code: "CLIENT_LOGO_IN_USE", message: "A client still shows this logo." },
};

/** Postgres check_violation; the description, brief and industries checks are the backstop. */
const CHECK_VIOLATION = "23514";
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** The DB length checks and the field each one guards. */
const LENGTH_CHECKS: Readonly<Record<string, string>> = {
  client_description_check: "description",
  client_brief_context_check: "context",
  client_brief_solution_check: "solution",
  client_brief_results_check: "results",
};
/** The DB value checks and the field each one guards. */
const VALUE_CHECKS: Readonly<Record<string, string>> = {
  client_industries_check: "industries",
};

const fieldsOf = (message: string, checks: Readonly<Record<string, string>>) =>
  Object.entries(checks)
    .filter(([check]) => message.includes(check))
    .map(([, field]) => field);

/**
 * The field error when the DB refused the write: `CLIENT_FIELD_INVALID` for the
 * industries check or a P0001 `CLIENT_FIELD_INVALID` (its DETAIL names the field),
 * `CLIENT_FIELD_TOO_LONG` for a length check, each naming the field(s), so the
 * wizard can show the error on the field.
 */
function fieldErrorOf(error: { code: string; message: string; details?: string | null }): AppError | undefined {
  if (error.code === RAISE_EXCEPTION && error.message === "CLIENT_FIELD_INVALID") {
    const fields = typeof error.details === "string" && error.details !== "" ? [error.details] : [];
    return { code: "CLIENT_FIELD_INVALID", message: "A required client field is missing.", details: { fields } };
  }
  if (error.code !== CHECK_VIOLATION) return undefined;
  const invalid = fieldsOf(error.message, VALUE_CHECKS);
  if (invalid.length > 0) {
    return { code: "CLIENT_FIELD_INVALID", message: "The industries are not in the list.", details: { fields: invalid } };
  }
  const tooLong = fieldsOf(error.message, LENGTH_CHECKS);
  if (tooLong.length === 0) return undefined;
  return { code: "CLIENT_FIELD_TOO_LONG", message: "A client field is too long.", details: { fields: tooLong } };
}

const invalidRow = (id: string) =>
  err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { id } });

/** Maps a `client` row's id, name and code, rejecting values outside the domain. */
export function toClientRef(row: { id: string; name: string; code: string }): Result<ClientRef> {
  const parsed = clientRefSchema.safeParse({ id: row.id, name: row.name, code: row.code });
  return parsed.success ? ok(parsed.data) : invalidRow(row.id);
}

interface ClientRow {
  id: string;
  name: string;
  code: string;
  industries: string[];
  description: string | null;
  logo_id: string | null;
}

interface BriefRow {
  context: string;
  solution: string;
  results: string;
}

/** Maps a `client` row with its info to the domain shape, rejecting values outside the domain. */
export function toClient(row: ClientRow): Result<Client> {
  const parsed = clientSchema.safeParse({
    id: row.id,
    name: row.name,
    code: row.code,
    industries: row.industries,
    description: row.description,
    logoId: row.logo_id,
  });
  return parsed.success ? ok(parsed.data) : invalidRow(row.id);
}

/**
 * Maps an embedded `client_brief` (one-to-one, so an object or null; a list is
 * accepted too) to the domain shape; no row is the empty brief.
 */
export function toClientBrief(embedded: BriefRow | BriefRow[] | null | undefined): ClientBrief | null {
  const row = Array.isArray(embedded) ? (embedded[0] ?? null) : (embedded ?? null);
  if (row === null) return emptyClientBrief();
  const parsed = clientBriefSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

/**
 * Maps a `client` row with its brief and embedded case count; a missing or malformed
 * count or brief fails validation. `complete` is `isClientComplete`.
 */
export function toClientSummary(
  row: ClientRow & { client_brief: BriefRow | BriefRow[] | null; case_study: { count: number }[] | null },
): Result<ClientSummary> {
  const client = toClient(row);
  if (!client.ok) return client;
  const brief = toClientBrief(row.client_brief);
  if (brief === null) return invalidRow(row.id);
  const count = row.case_study?.[0]?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return invalidRow(row.id);
  const { id, name, code } = client.value;
  return ok({ id, name, code, caseCount: count, complete: isClientComplete(client.value, brief) });
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
        p_industries: [...info.industries],
        p_description: info.description,
        p_actor_id: actorId,
      });
      if (error) {
        const refused = refusalOf(error, CREATE_REFUSALS) ?? fieldErrorOf(error);
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
        p_industries: [...input.industries],
        p_description: input.description,
        p_logo_id: input.logoId,
        p_actor_id: actorId,
      });
      if (error) {
        const fieldError = fieldErrorOf(error);
        if (fieldError) return err(fieldError);
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

    async findBrief(clientId) {
      const { data, error } = await client().from("client_brief").select(BRIEF_COLUMNS).eq("client_id", clientId).maybeSingle();
      if (error) {
        log.error(`client brief lookup failed: ${error.code}`, { clientId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the client brief.", details: { clientId } });
      }
      const brief = toClientBrief(data);
      if (brief === null) {
        return err({ code: "CLIENT_INVALID", message: "A client brief row failed validation.", details: { clientId } });
      }
      return ok(brief);
    },

    async saveBriefField(clientId, field, text, actorId) {
      const { data, error } = await client().rpc("save_client_brief_field", {
        p_client_id: clientId,
        p_field: field,
        p_text: text,
        p_actor_id: actorId,
      });
      if (error) {
        const refused = refusalOf(error, BRIEF_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId } });
        const fieldError = fieldErrorOf(error);
        if (fieldError) return err(fieldError);
        log.error(`client brief save failed: ${error.code}`, { actorId, clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not save the client brief.", details: { clientId } });
      }
      if (typeof data !== "string") {
        log.error("client brief save failed: no text returned", { actorId, clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not save the client brief.", details: { clientId } });
      }
      return ok(data);
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

    async deleteLogo(id) {
      const { data, error } = await client().rpc("delete_client_logo", { p_logo_id: id });
      if (error) {
        const refused = refusalOf(error, DELETE_LOGO_REFUSALS);
        if (refused) return err(refused);
        log.error(`client logo delete failed: ${error.code}`);
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not delete the logo." });
      }
      return ok(data === true);
    },

    async findClientInfoByCaseId(caseId) {
      const { data, error } = await client()
        .from("case_study")
        .select(CASE_CLIENT_COLUMNS)
        .eq("id", caseId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        log.error(`case client info lookup failed: ${error.code}`, { caseId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the case's client.", details: { caseId } });
      }
      if (data === null) return ok(null);
      const owner = data.client;
      if (owner === null) {
        log.error("case client info lookup failed: case without client", { caseId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the case's client.", details: { caseId } });
      }
      const parsed = caseClientInfoSchema.safeParse({
        clientId: owner.id,
        name: owner.name,
        industries: owner.industries,
        description: owner.description,
        logoId: owner.logo_id,
        brief: toClientBrief(owner.client_brief),
      });
      if (!parsed.success) {
        log.error("case client info failed validation", { caseId, clientId: owner.id });
        return err({ code: "CLIENT_INVALID", message: "A client row failed validation.", details: { caseId } });
      }
      return ok(parsed.data);
    },
  };
}
