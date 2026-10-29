import { storedRevisionSchema, type Revision } from "@/modules/case-study/domain/revision";
import type { RevisionRepository } from "@/modules/case-study/ports/revision-repository";
import type { Json, Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { refusalOf, type Refusals } from "./refusal";

type RevisionRow = Tables<"revision">;

const REVISION_COLUMNS =
  "id, case_id, client_intro_id, status, version, generated_doc, doc, manifest, model, fell_back, prompt_version, schema_version, created_by, created_at, updated_at";

/** `create_working_revision` raises these as P0001; nothing is written then. */
const CREATE_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No case study with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The case study's head revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The revision is malformed." },
};

/** `save_revision_doc` raises these as P0001; nothing is written then. */
const SAVE_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of a case study with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The revision is no longer the case study's head." },
  CASE_NOT_EDITABLE: { code: "CASE_NOT_EDITABLE", message: "The case study cannot be edited in its current status." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working revision can be edited." },
  STALE_REVISION: { code: "STALE_REVISION", message: "The revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The document is malformed." },
};

/** Maps a `revision` row to the domain shape (documents as stored), rejecting values outside the domain. */
export function toRevision(row: RevisionRow): Result<Revision> {
  const parsed = storedRevisionSchema.safeParse({
    id: row.id,
    caseId: row.case_id,
    clientIntroId: row.client_intro_id,
    status: row.status,
    version: row.version,
    generatedDoc: row.generated_doc,
    doc: row.doc,
    manifest: row.manifest,
    model: row.model,
    fellBack: row.fell_back,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) {
    return err({ code: "REVISION_INVALID", message: "A revision row failed validation.", details: { id: row.id } });
  }
  return ok(parsed.data);
}

export function createSupabaseRevisionRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): RevisionRepository {
  return {
    async createWorking(input) {
      const { data, error } = await client().rpc("create_working_revision", {
        p_case_id: input.caseId,
        p_doc: input.doc as Json,
        p_manifest: input.manifest as Json,
        p_meta: input.meta as Json,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      if (error) {
        const refused = refusalOf(error, CREATE_REFUSALS);
        if (refused) return err({ ...refused, details: { caseId: input.caseId, expectedHeadVersion: input.expectedHeadVersion } });
        log.error(`revision create failed: ${error.code}`, { caseId: input.caseId, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not create the revision.", details: { caseId: input.caseId } });
      }
      if (data === null) {
        log.error("revision create failed: no row returned", { caseId: input.caseId, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not create the revision.", details: { caseId: input.caseId } });
      }
      return toRevision(data);
    },

    async saveDoc(input) {
      const { data, error } = await client().rpc("save_revision_doc", {
        p_revision_id: input.revisionId,
        p_doc: input.doc as Json,
        p_expected_version: input.expectedVersion,
        p_actor_id: input.actorId,
      });
      if (error) {
        const refused = refusalOf(error, SAVE_REFUSALS);
        if (refused) return err({ ...refused, details: { revisionId: input.revisionId, expectedVersion: input.expectedVersion } });
        log.error(`revision save failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not save the revision.", details: { revisionId: input.revisionId } });
      }
      if (data === null) {
        log.error("revision save failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not save the revision.", details: { revisionId: input.revisionId } });
      }
      return toRevision(data);
    },

    async findById(id) {
      const { data, error } = await client().from("revision").select(REVISION_COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        log.error(`revision lookup failed: ${error.code}`);
        return err({ code: "REVISION_LOOKUP_FAILED", message: "Could not read the revision.", details: { id } });
      }
      return data === null ? ok(null) : toRevision(data);
    },
  };
}
