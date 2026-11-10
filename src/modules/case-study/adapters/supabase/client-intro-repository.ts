import { clientIntroSchema, type ClientIntro } from "@/modules/case-study/domain/client-intro";
import { TRANSITION } from "@/modules/case-study/domain/case-event";
import { READY_DRAFTS_GENERATE_LOOKBACK_MS, READY_DRAFTS_LIMIT, selectReadyDrafts, type ReadyDraft } from "@/modules/case-study/domain/ready-draft";
import type { ClientIntroRepository } from "@/modules/case-study/ports/client-intro-repository";
import type { Json, Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { refusalOf, type Refusals } from "./refusal";
import { toRevision } from "./revision-repository";

type ClientIntroRow = Tables<"client_intro">;

const INTRO_COLUMNS = "id, client_id, status, head_revision_id, approved_revision_id, head_version, created_by, created_at, updated_at";
/** The intro with its client, so a deleted client's intro can be left out (`client.deleted_at is null`). */
const INTRO_OF_LIVE_CLIENT = `${INTRO_COLUMNS}, client!inner(deleted_at)`;

/** `create_client_intro` raises these as P0001; nothing is written then. */
const CREATE_REFUSALS: Refusals = {
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
};
/** `transition_client_intro` raises these as P0001; nothing is written then. */
const TRANSITION_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No client intro with this id." },
  STALE_STATUS: { code: "STALE_STATUS", message: "The client intro status changed since it was read." },
  INVALID_TRANSITION: { code: "INVALID_TRANSITION", message: "This status change is not allowed." },
};
/** `create_working_revision_for_client_intro` raises these as P0001; nothing is written then. */
const REVISION_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No client intro with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The client intro's head revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The revision is malformed." },
};

/** `save_intro_revision_doc` raises these as P0001; nothing is written then. */
const SAVE_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of a client intro with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The revision is no longer the client intro's head." },
  CASE_NOT_EDITABLE: { code: "CASE_NOT_EDITABLE", message: "The client intro cannot be edited in its current status." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working revision can be edited." },
  STALE_REVISION: { code: "STALE_REVISION", message: "The revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The document is malformed." },
};
/** `approve_client_intro` raises these as P0001; nothing is written then. */
const APPROVE_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of this client intro with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The client intro's head revision changed since it was read." },
  CASE_NOT_APPROVABLE: { code: "CASE_NOT_APPROVABLE", message: "Only a client intro in review can be approved." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working revision can be approved." },
  STALE_REVISION: { code: "STALE_REVISION", message: "The revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The approval is malformed." },
};

/** `update_approved_intro_revision` raises these as P0001; nothing is written then. */
const UPDATE_APPROVED_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of this client intro with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The client intro's head revision changed since it was read." },
  CASE_NOT_APPROVABLE: { code: "CASE_NOT_APPROVABLE", message: "Only an approved client intro's approved version can be updated." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working copy can become the approved version." },
  STALE_REVISION: { code: "STALE_REVISION", message: "The revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The update is malformed." },
};
/** `fork_intro_head` raises these as P0001; nothing is written then. */
const FORK_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No client intro with this id." },
  CASE_NOT_EDITABLE: { code: "CASE_NOT_EDITABLE", message: "Only an approved client intro's head is forked." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "The head is neither the approved revision nor a working copy." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The client intro's head revision changed since it was read." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The fork is malformed." },
};
/** `discard_intro_head` raises these as P0001; nothing is written then. */
const DISCARD_REFUSALS: Refusals = {
  NOT_FOUND: { code: "NOT_FOUND", message: "No revision of this client intro with this id." },
  STALE_HEAD: { code: "STALE_HEAD", message: "The client intro's head revision changed since it was read." },
  CASE_NOT_EDITABLE: { code: "CASE_NOT_EDITABLE", message: "Only an approved client intro's copy is discarded." },
  REVISION_NOT_WRITABLE: { code: "REVISION_NOT_WRITABLE", message: "Only a working copy can be discarded." },
  INVALID_INPUT: { code: "INVALID_INPUT", message: "The discard is malformed." },
};

/** `fork_intro_head`'s JSON result: the revision row and the intro's `head_version`. */
function forkedOf(data: unknown): { row: Tables<"revision">; headVersion: number } | null {
  if (typeof data !== "object" || data === null) return null;
  const { revision, headVersion } = data as { revision?: unknown; headVersion?: unknown };
  if (typeof revision !== "object" || revision === null || typeof headVersion !== "number") return null;
  return { row: revision as Tables<"revision">, headVersion };
}

/** Maps a `client_intro` row to the domain shape, rejecting values outside the domain. */
export function toClientIntro(row: ClientIntroRow): Result<ClientIntro> {
  const parsed = clientIntroSchema.safeParse({
    id: row.id,
    clientId: row.client_id,
    status: row.status,
    headRevisionId: row.head_revision_id,
    approvedRevisionId: row.approved_revision_id,
    headVersion: row.head_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) {
    return err({ code: "CLIENT_INTRO_INVALID", message: "A client_intro row failed validation.", details: { id: row.id } });
  }
  return ok(parsed.data);
}

/** `data.event` of a `transition` client event, or `""` when it has none. */
function transitionEventOf(data: Json): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "";
  const event = data.event;
  return typeof event === "string" ? event : "";
}

export function createSupabaseClientIntroRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ClientIntroRepository {
  async function findOne(column: "id" | "client_id", value: string): Promise<Result<ClientIntro | null>> {
    const { data, error } = await client()
      .from("client_intro")
      .select(INTRO_OF_LIVE_CLIENT)
      .eq(column, value)
      .is("client.deleted_at", null)
      .maybeSingle();
    if (error) {
      log.error(`client_intro lookup failed: ${error.code}`);
      return err({ code: "CLIENT_INTRO_LOOKUP_FAILED", message: "Could not read the client intro.", details: { [column]: value } });
    }
    return data === null ? ok(null) : toClientIntro(data);
  }

  return {
    findById: (id) => findOne("id", id),
    findByClientId: (clientId) => findOne("client_id", clientId),

    async getOrCreate(clientId, actorId) {
      const { data, error } = await client().rpc("create_client_intro", { p_client_id: clientId, p_actor_id: actorId });
      if (error) {
        const refused = refusalOf(error, CREATE_REFUSALS);
        if (refused) return err({ ...refused, details: { clientId } });
        log.error(`client_intro create failed: ${error.code}`, { clientId, actorId });
        return err({ code: "CLIENT_INTRO_WRITE_FAILED", message: "Could not create the client intro.", details: { clientId } });
      }
      if (data === null) {
        log.error("client_intro create failed: no row returned", { clientId, actorId });
        return err({ code: "CLIENT_INTRO_WRITE_FAILED", message: "Could not create the client intro.", details: { clientId } });
      }
      return toClientIntro(data);
    },

    async transition(change) {
      const { data, error } = await client().rpc("transition_client_intro", {
        p_client_intro_id: change.clientIntroId,
        p_event: change.event,
        p_from: change.from,
        p_to: change.to,
        p_actor_id: change.actorId,
      });
      if (error) {
        const refused = refusalOf(error, TRANSITION_REFUSALS);
        if (refused) return err({ ...refused, details: { id: change.clientIntroId, from: change.from, to: change.to } });
        log.error(`client_intro transition failed: ${error.code}`, { clientIntroId: change.clientIntroId, actorId: change.actorId });
        return err({ code: "CLIENT_INTRO_WRITE_FAILED", message: "Could not change the client intro status.", details: { clientIntroId: change.clientIntroId } });
      }
      if (data === null) {
        log.error("client_intro transition failed: no row returned", { clientIntroId: change.clientIntroId, actorId: change.actorId });
        return err({ code: "CLIENT_INTRO_WRITE_FAILED", message: "Could not change the client intro status." });
      }
      return toClientIntro(data);
    },

    async createWorkingRevision(input) {
      const { data, error } = await client().rpc("create_working_revision_for_client_intro", {
        p_client_intro_id: input.clientIntroId,
        p_doc: input.doc as Json,
        p_manifest: input.manifest as Json,
        p_meta: input.meta as Json,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      const details = { clientIntroId: input.clientIntroId };
      if (error) {
        const refused = refusalOf(error, REVISION_REFUSALS);
        if (refused) return err({ ...refused, details: { ...details, expectedHeadVersion: input.expectedHeadVersion } });
        log.error(`intro revision create failed: ${error.code}`, { ...details, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not create the revision.", details });
      }
      if (data === null) {
        log.error("intro revision create failed: no row returned", { ...details, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not create the revision.", details });
      }
      return toRevision(data);
    },

    async saveDoc(input) {
      const { data, error } = await client().rpc("save_intro_revision_doc", {
        p_revision_id: input.revisionId,
        p_doc: input.doc as Json,
        p_expected_version: input.expectedVersion,
        p_actor_id: input.actorId,
      });
      const details = { revisionId: input.revisionId };
      if (error) {
        const refused = refusalOf(error, SAVE_REFUSALS);
        if (refused) return err({ ...refused, details: { ...details, expectedVersion: input.expectedVersion } });
        log.error(`intro revision save failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not save the revision.", details });
      }
      if (data === null) {
        log.error("intro revision save failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not save the revision.", details });
      }
      return toRevision(data);
    },

    async approve(input) {
      const { data, error } = await client().rpc("approve_client_intro", {
        p_client_intro_id: input.clientIntroId,
        p_revision_id: input.revisionId,
        p_expected_revision_version: input.expectedRevisionVersion,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      const details = { clientIntroId: input.clientIntroId, revisionId: input.revisionId };
      if (error) {
        const refused = refusalOf(error, APPROVE_REFUSALS);
        if (refused) return err({ ...refused, details });
        log.error(`intro approve failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not approve the revision.", details });
      }
      if (data === null) {
        log.error("intro approve failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not approve the revision.", details });
      }
      return toRevision(data);
    },

    async updateApproved(input) {
      const { data, error } = await client().rpc("update_approved_intro_revision", {
        p_client_intro_id: input.clientIntroId,
        p_revision_id: input.revisionId,
        p_expected_revision_version: input.expectedRevisionVersion,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      const details = { clientIntroId: input.clientIntroId, revisionId: input.revisionId };
      if (error) {
        const refused = refusalOf(error, UPDATE_APPROVED_REFUSALS);
        if (refused) return err({ ...refused, details });
        log.error(`intro approved version update failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not update the approved version.", details });
      }
      if (data === null) {
        log.error("intro approved version update failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not update the approved version.", details });
      }
      return toRevision(data);
    },

    async forkHead(input) {
      const { data, error } = await client().rpc("fork_intro_head", {
        p_client_intro_id: input.clientIntroId,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      const details = { clientIntroId: input.clientIntroId };
      if (error) {
        const refused = refusalOf(error, FORK_REFUSALS);
        if (refused) return err({ ...refused, details: { ...details, expectedHeadVersion: input.expectedHeadVersion } });
        log.error(`intro head fork failed: ${error.code}`, { ...details, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not fork the head.", details });
      }
      const forked = forkedOf(data);
      if (forked === null) {
        log.error("intro head fork failed: no row returned", { ...details, actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not fork the head.", details });
      }
      const revision = toRevision(forked.row);
      return revision.ok ? ok({ revision: revision.value, headVersion: forked.headVersion }) : revision;
    },

    async discardHead(input) {
      const { data, error } = await client().rpc("discard_intro_head", {
        p_client_intro_id: input.clientIntroId,
        p_revision_id: input.revisionId,
        p_expected_head_version: input.expectedHeadVersion,
        p_actor_id: input.actorId,
      });
      const details = { clientIntroId: input.clientIntroId, revisionId: input.revisionId };
      if (error) {
        const refused = refusalOf(error, DISCARD_REFUSALS);
        if (refused) return err({ ...refused, details });
        log.error(`intro head discard failed: ${error.code}`, { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not discard the changes.", details });
      }
      if (data === null) {
        log.error("intro head discard failed: no row returned", { actorId: input.actorId });
        return err({ code: "REVISION_WRITE_FAILED", message: "Could not discard the changes.", details });
      }
      return toRevision(data);
    },

    async listReadyIntros(actorId, since): Promise<Result<ReadyDraft[]>> {
      const lookupFailed = (what: string, code: string): Result<never> => {
        log.error(`ready intros ${what} failed: ${code}`, { actorId });
        return err({ code: "CASE_STUDY_LOOKUP_FAILED", message: "Could not list the ready drafts." });
      };
      // As the cases' (Story 3.8): the intros this actor started lately, their successes after
      // `since`, every start on them, and their status and client.
      const pressedAfter = new Date(Date.parse(since) - READY_DRAFTS_GENERATE_LOOKBACK_MS).toISOString();
      const pressed = await client()
        .from("client_event")
        .select("client_intro_id")
        .eq("type", TRANSITION)
        .eq("data->>event", "generate")
        .eq("actor_id", actorId)
        .gt("at", pressedAfter)
        .order("at", { ascending: false })
        .limit(READY_DRAFTS_LIMIT);
      if (pressed.error) return lookupFailed("client_event generate lookup", pressed.error.code);
      const introIds = [...new Set(pressed.data.map((e) => e.client_intro_id))];
      if (introIds.length === 0) return ok([]);

      const [succeeded, generated, intros] = await Promise.all([
        client()
          .from("client_event")
          .select("client_intro_id, actor_id, at, data")
          .eq("type", TRANSITION)
          .eq("data->>event", "generation_succeeded")
          .in("client_intro_id", introIds)
          .gt("at", since)
          .order("at", { ascending: false })
          .limit(READY_DRAFTS_LIMIT),
        client()
          .from("client_event")
          .select("client_intro_id, actor_id, at, data")
          .eq("type", TRANSITION)
          .eq("data->>event", "generate")
          .in("client_intro_id", introIds),
        client().from("client_intro").select("id, status, client(id, name, deleted_at)").in("id", introIds),
      ]);
      if (succeeded.error) return lookupFailed("client_event lookup", succeeded.error.code);
      if (generated.error) return lookupFailed("client_event generate lookup", generated.error.code);
      if (intros.error) return lookupFailed("client_intro lookup", intros.error.code);

      const transitions = [...succeeded.data, ...generated.data].map((e) => ({
        caseId: e.client_intro_id,
        actorId: e.actor_id,
        event: transitionEventOf(e.data),
        at: e.at,
      }));
      const clientOf = new Map<string, string>();
      const subjects = intros.data.flatMap((row) => {
        if (row.client === null) return [];
        clientOf.set(row.id, row.client.id);
        return [{ id: row.id, name: row.client.name, status: row.status, deletedAt: row.client.deleted_at }];
      });
      const ready = selectReadyDrafts(transitions, subjects, actorId, "client_intro");
      return ok(ready.flatMap((draft) => {
        const clientId = clientOf.get(draft.id);
        return clientId === undefined ? [] : [{ ...draft, id: clientId }];
      }));
    },
  };
}
