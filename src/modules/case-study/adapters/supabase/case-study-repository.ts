import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import { caseEventSchema, type CaseEvent } from "@/modules/case-study/domain/case-event";
import { caseStudySchema, type CaseStudy } from "@/modules/case-study/domain/case-study";
import type { Json, Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, type AppError, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type CaseEventRow = Tables<"case_event">;

/** A `case_study` row with its client embedded, as every read selects it. */
export type CaseStudyRow = Omit<Tables<"case_study">, "client_id"> & {
  client: Pick<Tables<"client">, "id" | "name" | "code"> | null;
};

// Reads embed the client; the case's own `client_id` is `client.id`.
const CASE_STUDY_COLUMNS =
  "id, code, number, name, year, locale, status, project_order_ref, head_revision_id, approved_revision_id, head_version, created_by, created_at, updated_at, deleted_at, client(id, name, code)";
const CASE_EVENT_COLUMNS = "id, case_id, revision_id, actor_id, type, at, data";

/** Postgres foreign_key_violation, and the constraint naming an unknown case. */
const FOREIGN_KEY_VIOLATION = "23503";
const CASE_FK = "case_event_case_id_fkey";

/** Postgres raise_exception: `transition_case_study` and `create_case_study` raise it with one of these messages. */
const RAISE_EXCEPTION = "P0001";
const TRANSITION_REFUSALS: Readonly<Record<string, Omit<AppError, "details">>> = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No case study with this id." },
  STALE_STATUS: { code: "STALE_STATUS", message: "The case study status changed since it was read." },
  INVALID_TRANSITION: { code: "INVALID_TRANSITION", message: "This status change is not allowed." },
};
/** `create_case_study` raises these (AD-21); nothing is written then. */
const CREATE_REFUSALS: Readonly<Record<string, Omit<AppError, "details">>> = {
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
};

/** The refusal a Postgres function raised as P0001 with one of `refusals`' messages, if any. */
function refusalOf(
  error: { code: string; message: string },
  refusals: Readonly<Record<string, Omit<AppError, "details">>>,
): Omit<AppError, "details"> | undefined {
  return error.code === RAISE_EXCEPTION && Object.hasOwn(refusals, error.message) ? refusals[error.message] : undefined;
}

/** Maps a `case_study` row to the domain shape, rejecting values outside the domain. */
export function toCaseStudy(row: CaseStudyRow): Result<CaseStudy> {
  const parsed = caseStudySchema.safeParse({
    id: row.id,
    code: row.code,
    number: row.number,
    name: row.name,
    client: row.client,
    year: row.year,
    locale: row.locale,
    status: row.status,
    projectOrderRef: row.project_order_ref,
    headRevisionId: row.head_revision_id,
    approvedRevisionId: row.approved_revision_id,
    headVersion: row.head_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  });
  if (!parsed.success) {
    return err({ code: "CASE_STUDY_INVALID", message: "A case_study row failed validation.", details: { id: row.id } });
  }
  return { ok: true, value: parsed.data };
}

/** Maps a `case_event` row to the domain shape. */
export function toCaseEvent(row: CaseEventRow): Result<CaseEvent> {
  const parsed = caseEventSchema.safeParse({
    id: row.id,
    caseId: row.case_id,
    revisionId: row.revision_id,
    actorId: row.actor_id,
    type: row.type,
    at: row.at,
    data: row.data,
  });
  if (!parsed.success) {
    return err({ code: "CASE_EVENT_INVALID", message: "A case_event row failed validation.", details: { id: row.id } });
  }
  return { ok: true, value: parsed.data };
}

export function createSupabaseCaseStudyRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): CaseStudyRepository {
  /**
   * Re-reads a case just written by a Postgres function, whose returned row has
   * no client join. Soft-deleted rows included: the write already succeeded.
   */
  async function reread(id: string, context: { actorId: string; what: string }): Promise<Result<CaseStudy>> {
    const { data, error } = await client().from("case_study").select(CASE_STUDY_COLUMNS).eq("id", id).maybeSingle();
    if (error || data === null) {
      log.error(`case_study ${context.what} re-read failed: ${error?.code ?? "no row"}`, { caseId: id, actorId: context.actorId });
      return err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "Could not read the case study.", details: { id } });
    }
    return toCaseStudy(data);
  }

  return {
    async create(input, actorId) {
      // One Postgres function assigns the number and code and writes the case and
      // its `case_created` event atomically (AD-21).
      const { data, error } = await client().rpc("create_case_study", {
        p_name: input.name,
        p_client_id: input.clientId,
        p_year: input.year,
        p_locale: input.locale,
        p_actor_id: actorId,
      });
      if (error) {
        const refused = refusalOf(error, CREATE_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId: input.clientId } });
        log.error(`case_study create failed: ${error.code}`, { actorId });
        return err({ code: "CASE_STUDY_WRITE_FAILED", message: "Could not create the case study." });
      }
      if (data === null) {
        log.error("case_study create failed: no row returned", { actorId });
        return err({ code: "CASE_STUDY_WRITE_FAILED", message: "Could not create the case study." });
      }
      return reread(data.id, { actorId, what: "create" });
    },

    async findById(id) {
      const { data, error } = await client()
        .from("case_study")
        .select(CASE_STUDY_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        log.error(`case_study lookup failed: ${error.code}`, { caseId: id });
        return err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "Could not read the case study.", details: { id } });
      }
      return data === null ? { ok: true, value: null } : toCaseStudy(data);
    },

    async list(scope) {
      let query = client().from("case_study").select(CASE_STUDY_COLUMNS).is("deleted_at", null);
      if (scope.status !== undefined) query = query.eq("status", scope.status);
      // `id` breaks ties so equal timestamps keep a stable order between loads.
      const { data, error } = await query.order("updated_at", { ascending: false }).order("id", { ascending: true });
      if (error) {
        log.error(`case_study list failed: ${error.code}`);
        return err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "Could not list the case studies." });
      }
      const cases: CaseStudy[] = [];
      for (const row of data) {
        const mapped = toCaseStudy(row);
        if (!mapped.ok) return mapped;
        cases.push(mapped.value);
      }
      return { ok: true, value: cases };
    },

    async appendEvent(event) {
      const { data, error } = await client()
        .from("case_event")
        .insert({
          case_id: event.caseId,
          actor_id: event.actorId,
          type: event.type,
          revision_id: event.revisionId,
          data: event.data as NonNullable<Json>,
        })
        .select(CASE_EVENT_COLUMNS)
        .single();
      if (error) {
        if (error.code === FOREIGN_KEY_VIOLATION && `${error.message} ${error.details}`.includes(CASE_FK)) {
          return { ok: true, value: null };
        }
        log.error(`case_event insert failed: ${error.code}`, { caseId: event.caseId, actorId: event.actorId });
        return err({
          code: "CASE_EVENT_WRITE_FAILED",
          message: "Could not record the case event.",
          details: { caseId: event.caseId },
        });
      }
      return toCaseEvent(data);
    },

    async transition(change) {
      // One Postgres function compare-and-sets status and appends the `transition` event atomically.
      const { data, error } = await client().rpc("transition_case_study", {
        p_case_id: change.caseId,
        p_event: change.event,
        p_from: change.from,
        p_to: change.to,
        p_actor_id: change.actorId,
      });
      if (error) {
        const refused = refusalOf(error, TRANSITION_REFUSALS);
        if (refused) return err({ ...refused, details: { id: change.caseId, from: change.from, to: change.to } });
        log.error(`case_study transition failed: ${error.code}`, { caseId: change.caseId, actorId: change.actorId });
        return err({
          code: "CASE_STUDY_WRITE_FAILED",
          message: "Could not change the case study status.",
          details: { caseId: change.caseId },
        });
      }
      if (data === null) {
        log.error("case_study transition failed: no row returned", { caseId: change.caseId, actorId: change.actorId });
        return err({ code: "CASE_STUDY_WRITE_FAILED", message: "Could not change the case study status." });
      }
      return reread(data.id, { actorId: change.actorId, what: "transition" });
    },
  };
}
