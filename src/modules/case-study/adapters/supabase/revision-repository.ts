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

/** `approve_revision` raises these as P0001; nothing is written then. */
const APPROVE_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of this case study with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The case study's head revision changed since it was read." },
  CASE_NOT_APPROVABLE: { code: "CASE_NOT_APPROVABLE", message: "Only a case study in review can be approved." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working revision can be approved." },
  STALE_REVISION: { code: "STALE_REVISION", message: "The revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The approval is malformed." },
};

/** `update_approved_revision` raises these as P0001; nothing is written then. */
const UPDATE_APPROVED_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of this case study with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The case study's head revision changed since it was read." },
  CASE_NOT_APPROVABLE: { code: "CASE_NOT_APPROVABLE", message: "Only an approved case study's approved version can be updated." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working copy can become the approved version." },
  STALE_REVISION: { code: "STALE_REVISION", message: "The revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The update is malformed." },
};

/** `fork_head` raises these as P0001; nothing is written then. */
const FORK_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No case study with this id." },
  CASE_NOT_EDITABLE: { code: "CASE_NOT_EDITABLE", message: "Only an approved case study's head is forked." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "The head is neither the approved revision nor a working copy." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The case study's head revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The fork is malformed." },
};

/** `discard_head` raises these as P0001; nothing is written then. */
const DISCARD_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of this case study with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The case study's head revision changed since it was read." },
  CASE_NOT_EDITABLE: { code: "CASE_NOT_EDITABLE", message: "Only an approved case study's copy is discarded." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working copy can be discarded." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The discard is malformed." },
};

/** `fork_head`'s JSON result: the revision row and the case's `head_version`. */
function forkedOf(data: unknown): { row: RevisionRow; headVersion: number } | null {
  if (typeof data !== "object" || data === null) return null;
  const { revision, headVersion } = data as { revision?: unknown; headVersion?: unknown };
  if (typeof revision !== "object" || revision === null || typeof headVersion !== "number") return null;
  return { row: revision as RevisionRow, headVersion };
}

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

    async approve(input) {
      const { data, error } = await client().rpc("approve_revision", {
        p_case_id: input.caseId,
        p_revision_id: input.revisionId,
        p_expected_revision_version: input.expectedRevisionVersion,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      if (error) {
        const refused = refusalOf(error, APPROVE_REFUSALS);
        if (refused) return err({ ...refused, details: { caseId: input.caseId, revisionId: input.revisionId } });
        log.error(`revision approve failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not approve the revision.", details: { revisionId: input.revisionId } });
      }
      if (data === null) {
        log.error("revision approve failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not approve the revision.", details: { revisionId: input.revisionId } });
      }
      return toRevision(data);
    },

    async updateApproved(input) {
      const { data, error } = await client().rpc("update_approved_revision", {
        p_case_id: input.caseId,
        p_revision_id: input.revisionId,
        p_expected_revision_version: input.expectedRevisionVersion,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      if (error) {
        const refused = refusalOf(error, UPDATE_APPROVED_REFUSALS);
        if (refused) return err({ ...refused, details: { caseId: input.caseId, revisionId: input.revisionId } });
        log.error(`approved version update failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not update the approved version.", details: { revisionId: input.revisionId } });
      }
      if (data === null) {
        log.error("approved version update failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not update the approved version.", details: { revisionId: input.revisionId } });
      }
      return toRevision(data);
    },

    async forkHead(input) {
      const { data, error } = await client().rpc("fork_head", {
        p_case_id: input.caseId,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      if (error) {
        const refused = refusalOf(error, FORK_REFUSALS);
        if (refused) return err({ ...refused, details: { caseId: input.caseId, expectedHeadVersion: input.expectedHeadVersion } });
        log.error(`head fork failed: ${error.code}`, { caseId: input.caseId, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not fork the head.", details: { caseId: input.caseId } });
      }
      const forked = forkedOf(data);
      if (forked === null) {
        log.error("head fork failed: no row returned", { caseId: input.caseId, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not fork the head.", details: { caseId: input.caseId } });
      }
      const revision = toRevision(forked.row);
      return revision.ok ? ok({ revision: revision.value, headVersion: forked.headVersion }) : revision;
    },

    async discardHead(input) {
      const { data, error } = await client().rpc("discard_head", {
        p_case_id: input.caseId,
        p_revision_id: input.revisionId,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      if (error) {
        const refused = refusalOf(error, DISCARD_REFUSALS);
        if (refused) return err({ ...refused, details: { caseId: input.caseId, revisionId: input.revisionId } });
        log.error(`head discard failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not discard the changes.", details: { revisionId: input.revisionId } });
      }
      if (data === null) {
        log.error("head discard failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not discard the changes.", details: { revisionId: input.revisionId } });
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
