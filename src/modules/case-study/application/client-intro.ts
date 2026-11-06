import { z } from "zod";
import type { Actor } from "@/modules/access";
import { clientImageCount, CLIENT_MATERIAL_MIN_IMAGES } from "@/modules/case-study/domain/client-material";
import {
  createIntroWorkingRevisionInputSchema,
  INTRO_STARTABLE_STATUSES,
  startClientIntroInputSchema,
  type ClientIntro,
  type ClientIntroStart,
} from "@/modules/case-study/domain/client-intro";
import { nextStatus, transitionEventSchema } from "@/modules/case-study/domain/transition";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { ClientIntroRepository } from "@/modules/case-study/ports/client-intro-repository";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import { clientIntroGenerateJob, validateNewDocument, type ClientIntroGenerateJob } from "@/modules/generation";
import { err, ok, type Result } from "@/shared/result";
import { upgraded, type CaseStudyRevision } from "./revisions";

const introNotFound = (id: unknown) => err({ code: "NOT_FOUND", message: "No client intro with this id.", details: { id } });

/**
 * The client's intro (Story 3.11), or `null` when it has none. Unknown, malformed or
 * deleted clients are `CLIENT_NOT_FOUND`. The caller has authorized the actor.
 */
export function makeGetClientIntro(deps: { intros: ClientIntroRepository }) {
  return async function getClientIntro(clientId: unknown): Promise<Result<ClientIntro | null>> {
    const id = z.uuid().safeParse(clientId);
    if (!id.success) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { id: clientId } });
    return deps.intros.findByClientId(id.data.toLowerCase());
  };
}

/** One intro by its own id (the worker's read); `NOT_FOUND` when unknown, malformed or its client is deleted. */
export function makeGetClientIntroById(deps: { intros: ClientIntroRepository }) {
  return async function getClientIntroById(introId: unknown): Promise<Result<ClientIntro>> {
    const id = z.uuid().safeParse(introId);
    if (!id.success) return introNotFound(introId);
    const found = await deps.intros.findById(id.data.toLowerCase());
    if (!found.ok) return found;
    return found.value === null ? introNotFound(id.data) : ok(found.value);
  };
}

/**
 * The only way a client intro's status changes (AD-3): the case transition table and the
 * same events, compare-and-set, with a `transition` client event `{ event, from, to }`.
 * `approve` is refused (`INVALID_TRANSITION`): intro approval arrives with Story 4.11. The
 * caller has authorized the actor. Errors: `NOT_FOUND`, `INVALID_TRANSITION`,
 * `STALE_STATUS`; nothing is written on any of them.
 */
export function makeTransitionIntro(deps: { intros: ClientIntroRepository }) {
  return async function transitionIntro(introId: unknown, event: unknown, actor: Actor): Promise<Result<ClientIntro>> {
    const found = await makeGetClientIntroById(deps)(introId);
    if (!found.ok) return found;
    if (event === "approve") {
      return err({ code: "INVALID_TRANSITION", message: "A client intro is not approved this way.", details: { event } });
    }
    const from = found.value.status;
    const to = nextStatus(from, event);
    if (!to.ok) return to;
    return deps.intros.transition({
      clientIntroId: found.value.id,
      event: transitionEventSchema.parse(event),
      from,
      to: to.value,
      actorId: actor.id,
    });
  };
}

/**
 * Creates a `working` revision of a client intro and makes it the head (compare-and-set
 * on its `headVersion`), as `createWorkingRevision` does for a case. `doc` must pass
 * `generation.validateNewDocument` and be of kind `client_intro` (`DOCUMENT_INVALID`).
 */
export function makeCreateIntroWorkingRevision(deps: { intros: ClientIntroRepository }) {
  return async function createIntroWorkingRevision(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
    const parsed = parseInput(createIntroWorkingRevisionInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientIntroId, doc, manifest, meta, expectedHeadVersion } = parsed.value;
    const valid = validateNewDocument(doc);
    if (!valid.ok) return valid;
    if (valid.value.kind !== "client_intro") {
      return err({ code: "DOCUMENT_INVALID", message: "A client intro's revision holds a client_intro document.", details: { kind: valid.value.kind } });
    }
    const created = await deps.intros.createWorkingRevision({ clientIntroId, doc: valid.value, manifest, meta, expectedHeadVersion, actorId: actor.id });
    if (!created.ok) return created;
    return upgraded(created.value);
  };
}

/** `jobs.enqueue`, passed in by the caller (jobs imports this module, never the reverse). */
export type EnqueueGenerate = (job: ClientIntroGenerateJob) => Promise<Result<{ id: string; status: string }>>;

export interface StartClientIntroDeps {
  intros: ClientIntroRepository;
  clients: Pick<ClientRepository, "findById" | "listAssets">;
  enqueue: EnqueueGenerate;
}

const LIVE_JOB = new Set(["queued", "running"]);

/**
 * The start rule (Story 3.11, owner 2026-11-06), run after a client's save: a client with
 * no intro, or whose intro is in Bozza, gets a test-text draft. Checks the client has at
 * least `CLIENT_MATERIAL_MIN_IMAGES` images (`NO_CLIENT_IMAGES`: no intro, no job), gets
 * or creates its intro, enqueues one `generate` job for it (idempotent: a double click gets
 * the same live job) and moves it to `generating`. An intro in any other status is left
 * alone (`unchanged`). The caller has authorized the actor.
 */
export function makeStartClientIntro(deps: StartClientIntroDeps) {
  return async function startClientIntro(actor: Actor, input: unknown): Promise<Result<ClientIntroStart>> {
    const parsed = parseInput(startClientIntroInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId } = parsed.value;

    const client = await deps.clients.findById(clientId);
    if (!client.ok) return client;
    if (client.value === null) return err({ code: "CLIENT_NOT_FOUND", message: "No client with this id.", details: { clientId } });

    const existing = await deps.intros.findByClientId(clientId);
    if (!existing.ok) return existing;
    const startable = (intro: ClientIntro) => (INTRO_STARTABLE_STATUSES as readonly string[]).includes(intro.status);
    if (existing.value !== null && !startable(existing.value)) {
      return ok({ outcome: "unchanged", introId: existing.value.id, status: existing.value.status });
    }

    // The gate, on the server, before any intro row or job.
    const assets = await deps.clients.listAssets(clientId);
    if (!assets.ok) return assets;
    if (clientImageCount(assets.value) < CLIENT_MATERIAL_MIN_IMAGES) {
      return err({
        code: "NO_CLIENT_IMAGES",
        message: `The client needs at least ${CLIENT_MATERIAL_MIN_IMAGES} images for its intro.`,
        details: { clientId },
      });
    }

    let current = existing.value;
    if (current === null) {
      const created = await deps.intros.getOrCreate(clientId, actor.id);
      if (!created.ok) return created;
      current = created.value;
    }
    if (!startable(current)) return ok({ outcome: "unchanged", introId: current.id, status: current.status });

    const enqueued = await deps.enqueue(clientIntroGenerateJob(current.id, current.headVersion));
    if (!enqueued.ok) return enqueued;

    const moved = await makeTransitionIntro(deps)(current.id, "generate", actor);
    if (moved.ok) return ok({ outcome: "started", introId: current.id, jobId: enqueued.value.id });
    // A double click: the other save already moved the intro and the job it got is still live.
    if (moved.error.code === "INVALID_TRANSITION" || moved.error.code === "STALE_STATUS") {
      const again = await deps.intros.findById(current.id);
      if (again.ok && again.value?.status === "generating" && LIVE_JOB.has(enqueued.value.status)) {
        return ok({ outcome: "started", introId: current.id, jobId: enqueued.value.id });
      }
    }
    return moved;
  };
}
