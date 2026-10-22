import { clientMaterialKey } from "@/modules/case-study/adapters/client-material-key";
import { logoKey } from "@/modules/case-study/adapters/logo-key";
import type { ClientLogo, ClientRepository } from "@/modules/case-study/ports/client-repository";
import {
  CLIENT_MATERIAL_MAX_FILES,
  clientMaterialKindFor,
  isClientMaterialContentType,
  type ClientAsset,
} from "@/modules/case-study/domain/client-material";
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
  type StoredClientSummary,
} from "@/modules/case-study/domain/case-study";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { RAISE_EXCEPTION, refusalOf, type Refusals } from "./refusal";

const CLIENT_REF_COLUMNS = "id, name, code";
const CLIENT_COLUMNS = "id, name, code, industries, description, logo_id";
const BRIEF_COLUMNS = "context, solution, results, testimonial_quote, testimonial_author";
/**
 * The client with what `isClientComplete` reads, the count of its embedded case
 * studies (the embedded filter keeps non-deleted ones only) and its current logo,
 * embedded through `client.logo_id` (named: `client_logo` also points back at `client`).
 */
const CLIENT_SUMMARY_COLUMNS = `${CLIENT_COLUMNS}, client_brief(${BRIEF_COLUMNS}), case_study(count), logo:client_logo!client_logo_id_fkey(id, mime_type)`;
const LOGO_COLUMNS = "id, client_id, mime_type, size_bytes";
const ASSET_COLUMNS = "id, client_id, position, file_name, mime_type, size_bytes, width, height, created_at";
/** A case's client and its brief, embedded through `case_study.client_id` (the only FK from case_study to client). */
const CASE_CLIENT_COLUMNS = `id, client(id, name, industries, description, logo_id, client_brief(${BRIEF_COLUMNS}))`;

/** `create_client` raises these as P0001 (AD-21); nothing is written then. */
const CREATE_REFUSALS: Refusals = {
  CLIENT_NAME_TAKEN: { code: "CLIENT_NAME_TAKEN", message: "A client with this name already exists." },
  CLIENT_CODE_EXHAUSTED: { code: "CLIENT_CODE_EXHAUSTED", message: "No free code is left for this client name." },
};
/** `save_client_brief_field` (and `save_client_results`, `save_client_testimonial`: CLIENT_NOT_FOUND) raise these as P0001; nothing is written then. */
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

/** `delete_client_logo` raises these as P0001; nothing is deleted then. */
const DELETE_LOGO_REFUSALS: Refusals = {
  CLIENT_LOGO_IN_USE: { code: "CLIENT_LOGO_IN_USE", message: "A client still shows this logo." },
  CLIENT_NOT_FOUND: BRIEF_REFUSALS.CLIENT_NOT_FOUND,
};

/** `delete_client_asset` raises this as P0001 (a deleted client's file); nothing is deleted then. */
const DELETE_ASSET_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: BRIEF_REFUSALS.CLIENT_NOT_FOUND,
};

/** `delete_client` raises these as P0001; nothing is written then. */
const DELETE_CLIENT_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: BRIEF_REFUSALS.CLIENT_NOT_FOUND,
  CLIENT_DELETE_NAME_MISMATCH: {
    code: "CLIENT_DELETE_NAME_MISMATCH",
    message: "The typed name does not match the client's name.",
  },
};

/** `insert_client_asset` raises these as P0001; nothing is written then. */
const INSERT_ASSET_REFUSALS: Refusals = {
  CLIENT_MATERIAL_LIMIT: { code: "CLIENT_MATERIAL_LIMIT", message: "This client already has 3 files." },
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
  ASSET_ALREADY_CONFIRMED: { code: "ASSET_ALREADY_CONFIRMED", message: "This file was already confirmed." },
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
  client_brief_testimonial_quote_check: "quote",
  client_brief_testimonial_author_check: "author",
};
/** The DB value checks and the field each one guards. */
const VALUE_CHECKS: Readonly<Record<string, string>> = {
  client_industries_check: "industries",
  client_brief_results_check: "results",
  // An author without a quote: the quote is what is missing.
  client_brief_testimonial_check: "quote",
};

const fieldsOf = (message: string, checks: Readonly<Record<string, string>>) =>
  Object.entries(checks)
    .filter(([check]) => message.includes(check))
    .map(([, field]) => field);

/**
 * The field error when the DB refused the write: `CLIENT_FIELD_INVALID` for the
 * industries, results or testimonial check or a P0001 `CLIENT_FIELD_INVALID` (its DETAIL names the field),
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
    return { code: "CLIENT_FIELD_INVALID", message: "A client field has a value outside what is allowed.", details: { fields: invalid } };
  }
  const tooLong = fieldsOf(error.message, LENGTH_CHECKS);
  if (tooLong.length === 0) return undefined;
  return { code: "CLIENT_FIELD_TOO_LONG", message: "A client field is too long.", details: { fields: tooLong } };
}

/** The result of `save_client_results` / `save_client_testimonial`: whether something changed, or the refusal. */
function briefSaved(
  data: unknown,
  error: { code: string; message: string; details?: string | null } | null,
  what: string,
  context: { actorId: string; clientId: string },
): Result<boolean> {
  if (error) {
    const refused = refusalOf(error, BRIEF_REFUSALS);
    if (refused) return err({ ...refused, details: { clientId: context.clientId } });
    const fieldError = fieldErrorOf(error);
    if (fieldError) return err(fieldError);
    log.error(`client ${what} save failed: ${error.code}`, context);
    return err({ code: "CLIENT_WRITE_FAILED", message: `Could not save the client ${what}.`, details: { clientId: context.clientId } });
  }
  if (typeof data !== "boolean") {
    log.error(`client ${what} save failed: no result returned`, context);
    return err({ code: "CLIENT_WRITE_FAILED", message: `Could not save the client ${what}.`, details: { clientId: context.clientId } });
  }
  return ok(data);
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
  /** jsonb: `[{ label, value }]`, checked by `client_brief_results_valid`. */
  results: unknown;
  testimonial_quote: string;
  testimonial_author: string;
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
  const parsed = clientBriefSchema.safeParse({
    context: row.context,
    solution: row.solution,
    results: row.results,
    testimonialQuote: row.testimonial_quote,
    testimonialAuthor: row.testimonial_author,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Maps a `client` row with its brief, embedded case count and current logo; a missing
 * or malformed count or brief fails validation. `complete` is `isClientComplete`. A
 * logo with an unknown type is left out (the list shows the monogram), never failing the row.
 */
export function toClientSummary(
  row: ClientRow & {
    client_brief: BriefRow | BriefRow[] | null;
    case_study: { count: number }[] | null;
    logo?: { id: string; mime_type: string } | null;
  },
): Result<StoredClientSummary> {
  const client = toClient(row);
  if (!client.ok) return client;
  const brief = toClientBrief(row.client_brief);
  if (brief === null) return invalidRow(row.id);
  const count = row.case_study?.[0]?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return invalidRow(row.id);
  const { id, name, code } = client.value;
  const logo = row.logo && isLogoContentType(row.logo.mime_type) ? { id: row.logo.id, contentType: row.logo.mime_type } : null;
  return ok({ id, name, code, caseCount: count, complete: isClientComplete(client.value, brief), logo });
}

/** Maps a `client_logo` row; an unknown mime type fails validation. */
export function toClientLogo(row: { id: string; client_id: string; mime_type: string; size_bytes: number }): Result<ClientLogo> {
  if (!isLogoContentType(row.mime_type)) {
    return err({ code: "CLIENT_INVALID", message: "A client logo row failed validation.", details: { id: row.id } });
  }
  return ok({ id: row.id, clientId: row.client_id, contentType: row.mime_type, sizeBytes: Number(row.size_bytes) });
}

interface AssetRow {
  id: string;
  client_id: string;
  position: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

/** Maps a `client_asset` row; an unknown mime type or a position outside 1–`CLIENT_MATERIAL_MAX_FILES` fails validation. */
export function toClientAsset(row: AssetRow): Result<ClientAsset> {
  const position = Number(row.position);
  if (!isClientMaterialContentType(row.mime_type) || !Number.isInteger(position) || position < 1 || position > CLIENT_MATERIAL_MAX_FILES) {
    return err({ code: "CLIENT_INVALID", message: "A client file row failed validation.", details: { id: row.id } });
  }
  return ok({
    id: row.id,
    clientId: row.client_id,
    position,
    fileName: row.file_name,
    kind: clientMaterialKindFor(row.mime_type),
    contentType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  });
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
        .is("case_study.deleted_at", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        log.error(`client summary list failed: ${error.code}`);
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not list the clients." });
      }
      const clients: StoredClientSummary[] = [];
      for (const row of data) {
        const mapped = toClientSummary(row);
        if (!mapped.ok) return mapped;
        clients.push(mapped.value);
      }
      return ok(clients);
    },

    async findById(id) {
      const { data, error } = await client()
        .from("client")
        .select(CLIENT_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
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

    async deleteClient(clientId, confirmName, actorId) {
      const { data, error } = await client().rpc("delete_client", {
        p_client_id: clientId,
        p_confirm_name: confirmName,
        p_actor_id: actorId,
      });
      if (error) {
        const refused = refusalOf(error, DELETE_CLIENT_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId } });
        log.error(`client delete failed: ${error.code}`, { actorId, clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not delete the client.", details: { clientId } });
      }
      if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
        log.error("client delete failed: no count returned", { actorId, clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not delete the client.", details: { clientId } });
      }
      return ok(data);
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

    async saveResults(clientId, results, actorId) {
      const { data, error } = await client().rpc("save_client_results", {
        p_client_id: clientId,
        // Only label and value: any other key would fail client_brief_results_check.
        p_results: results.map(({ label, value }) => ({ label, value })),
        p_actor_id: actorId,
      });
      return briefSaved(data, error, "results", { actorId, clientId });
    },

    async saveTestimonial(clientId, quote, author, actorId) {
      const { data, error } = await client().rpc("save_client_testimonial", {
        p_client_id: clientId,
        p_quote: quote,
        p_author: author,
        p_actor_id: actorId,
      });
      return briefSaved(data, error, "testimonial", { actorId, clientId });
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

    async listAssets(clientId) {
      const { data, error } = await client()
        .from("client_asset")
        .select(ASSET_COLUMNS)
        .eq("client_id", clientId)
        .order("position", { ascending: true });
      if (error) {
        log.error(`client material list failed: ${error.code}`, { clientId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not list the client's files.", details: { clientId } });
      }
      const assets: ClientAsset[] = [];
      for (const row of data) {
        const mapped = toClientAsset(row);
        if (!mapped.ok) return mapped;
        assets.push(mapped.value);
      }
      return ok(assets);
    },

    async insertAsset(asset) {
      const { data, error } = await client().rpc("insert_client_asset", {
        p_id: asset.id,
        p_client_id: asset.clientId,
        p_path: clientMaterialKey(asset.clientId, asset.id, asset.contentType),
        p_file_name: asset.fileName,
        p_mime_type: asset.contentType,
        p_size_bytes: asset.sizeBytes,
        // Null for every type but images (the dimensions check).
        p_width: asset.width as number,
        p_height: asset.height as number,
        p_actor_id: asset.createdBy,
      });
      if (error) {
        const refused = refusalOf(error, INSERT_ASSET_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId: asset.clientId } });
        log.error(`client material insert failed: ${error.code}`, { actorId: asset.createdBy, clientId: asset.clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not record the file.", details: { clientId: asset.clientId } });
      }
      if (data === null) {
        log.error("client material insert failed: no row returned", { actorId: asset.createdBy, clientId: asset.clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not record the file.", details: { clientId: asset.clientId } });
      }
      return toClientAsset(data);
    },

    async deleteAsset(id, clientId) {
      const { data, error } = await client().rpc("delete_client_asset", { p_asset_id: id });
      if (error) {
        const refused = refusalOf(error, DELETE_ASSET_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId } });
        log.error(`client material delete failed: ${error.code}`, { clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not delete the file." });
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
