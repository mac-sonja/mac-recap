import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@/modules/access";
import { buildCaseDocument, type TestDraftForm } from "@/modules/generation/application/test-draft";
import { testDraftTextSource, type TextSource } from "@/modules/generation/application/text-source";
import type { CaseStudyDocument } from "@/modules/generation/domain/document";
import type { CaseStatus } from "@/shared/case-status";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";

/** The case event written when a generate job succeeds; `data` is `{ jobId, kind }`, `revisionId` the new head. */
export const JOB_OK = "job_ok";

/** The material manifest a generate job carries and its revision stores (see `material.buildManifest`). */
export const generateManifestSchema = z.object({
  assets: z.array(z.object({ id: z.uuid(), sizeBytes: z.number().int(), contentType: z.string() })),
  formHash: z.string().min(1),
});
export type GenerateManifest = z.infer<typeof generateManifestSchema>;

/** A generate job's payload: the head version the action read and the manifest. */
export const generatePayloadSchema = z.object({
  baseHeadVersion: z.number().int().nonnegative(),
  manifest: generateManifestSchema,
});
export type GeneratePayload = z.infer<typeof generatePayloadSchema>;

/**
 * The job's input hash: sha256 of the case id, the head version and the manifest, so a
 * second press with the same material and form returns the live job (idempotent enqueue).
 */
export function generateInputHash(caseId: string, baseHeadVersion: number, manifest: GenerateManifest): string {
  const canonical = JSON.stringify([
    caseId.toLowerCase(),
    baseHeadVersion,
    manifest.assets.map((a) => [a.id, a.sizeBytes, a.contentType]),
    manifest.formHash,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** What the generate handler needs, injected so tests touch no database (wired in `worker.ts`). */
export interface GenerateDeps {
  getSystemActor(): Promise<Result<Actor>>;
  getCase(caseId: string): Promise<Result<{ status: CaseStatus; headVersion: number }>>;
  hasMaterial(caseId: string): Promise<Result<boolean>>;
  /** The case's manifest now; only assets also in the job's manifest are read. */
  buildManifest(caseId: string): Promise<Result<{ assets: readonly { id: string; contentType: string }[] }>>;
  getDetailsForm(input: { caseId: string }): Promise<Result<TestDraftForm>>;
  transition(caseId: string, event: "generation_succeeded" | "generation_failed", actor: Actor): Promise<Result<unknown>>;
  createWorkingRevision(
    actor: Actor,
    input: {
      caseId: string;
      doc: CaseStudyDocument;
      manifest: GenerateManifest;
      meta: { model: null; fellBack: false; promptVersion: null };
      expectedHeadVersion: number;
    },
  ): Promise<Result<{ id: string }>>;
  recordEvent(
    actor: Actor,
    input: { caseId: string; type: string; revisionId: string; data: Record<string, string> },
  ): Promise<Result<unknown>>;
  textSource?: TextSource;
  newId: () => string;
}

interface JobLike {
  id: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

type Outcome = Result<void, { code: Uppercase<string>; message: string; retryable?: boolean }>;

const fail = (code: Uppercase<string>, message: string, retryable = false): Outcome => err({ code, message, retryable });

/** A use case call that may throw; a throw becomes a failed result carrying the error name only (never texts). */
async function attempt<T>(code: Uppercase<string>, run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    log.error(`generate call threw (${code}): ${error instanceof Error ? error.name : typeof error}`);
    return err({ code, message: "The call threw." });
  }
}

/**
 * The `generate` job (Story 3.7), as the `system` actor. Re-checks the gate, builds the
 * document with `buildCaseDocument` from the text source (the marked test text until
 * Story 3.6), reads only the assets of the job's manifest, writes a new working revision
 * (head compare-and-set on `baseHeadVersion`) and moves the case to `in_review` with a
 * `job_ok` event. A moved head (`STALE_HEAD`) discards the result and returns the case to
 * `draft`; `onPermanentFailure` does the same after a failure for good. Logs ids and
 * error codes only. Never calls an LLM.
 */
export function makeGenerateHandler(deps: GenerateDeps) {
  const source = deps.textSource ?? testDraftTextSource;

  /** `generation_failed` when the case is still `generating`; a case in any other status is left alone. */
  async function backToDraft(caseId: string, actor: Actor): Promise<void> {
    const found = await attempt("CASE_STUDY_LOOKUP_FAILED", () => deps.getCase(caseId));
    if (!found.ok) {
      log.error(`generate rollback: case not read (${found.error.code})`, { caseId });
      return;
    }
    if (found.value.status !== "generating") return;
    const back = await attempt("TRANSITION_FAILED", () => deps.transition(caseId, "generation_failed", actor));
    if (!back.ok) log.error(`generate rollback failed: ${back.error.code}; the case is stuck in generating`, { caseId });
  }

  async function run(job: JobLike, signal: AbortSignal): Promise<Outcome> {
    const caseId = job.subjectId;
    const aborted = () => (signal.aborted ? fail("ABORTED", "The job was aborted.") : null);

    const payload = generatePayloadSchema.safeParse(job.payload);
    if (!payload.success) return fail("INVALID_PAYLOAD", "The job payload is not a generate payload.");
    const { baseHeadVersion, manifest } = payload.data;

    const actor = await attempt("SYSTEM_ACTOR_LOOKUP_THREW", () => deps.getSystemActor());
    if (!actor.ok) return fail("SYSTEM_ACTOR_LOOKUP_FAILED", actor.error.message, true);

    const found = await attempt("CASE_STUDY_LOOKUP_FAILED", () => deps.getCase(caseId));
    if (!found.ok) return fail(found.error.code === "NOT_FOUND" ? "NOT_FOUND" : "CASE_STUDY_LOOKUP_FAILED", found.error.message, found.error.code !== "NOT_FOUND");
    // The action moves the case to `generating` right after enqueueing: a draft may just be early.
    if (found.value.status === "draft") return fail("NOT_GENERATING", "The case is not generating yet.", true);
    if (found.value.status !== "generating") return fail("NOT_GENERATING", "The case is not generating.");

    // Gate (NFR6), again: the form alone is never enough.
    const material = await attempt("MATERIAL_LOOKUP_FAILED", () => deps.hasMaterial(caseId));
    if (!material.ok) return fail("MATERIAL_LOOKUP_FAILED", material.error.message, true);
    if (!material.value) return fail("NO_MATERIAL", "The case has no material.");
    const current = await attempt("MATERIAL_LOOKUP_FAILED", () => deps.buildManifest(caseId));
    if (!current.ok) return fail("MATERIAL_LOOKUP_FAILED", current.error.message, true);
    // Only the manifest's assets that are still live; material added after enqueue is ignored.
    const inManifest = new Set(manifest.assets.map((a) => a.id));
    const assets = current.value.assets.filter((a) => inManifest.has(a.id));
    if (assets.length === 0) return fail("NO_MATERIAL", "None of the job's material is left.");

    const form = await attempt("DETAILS_LOOKUP_FAILED", () => deps.getDetailsForm({ caseId }));
    if (!form.ok) return fail("DETAILS_LOOKUP_FAILED", form.error.message, true);

    const assetIds = assets.map((a) => a.id);
    const images = assets.filter((a) => a.contentType.startsWith("image/")).map((a) => a.id);
    const texts = await attempt("TEXT_SOURCE_FAILED", () => source.texts({ form: form.value, assetIds }));
    if (!texts.ok) return fail("TEXT_SOURCE_FAILED", texts.error.message, true);
    const doc = buildCaseDocument({
      texts: texts.value,
      images,
      resultRows: form.value.results.length,
      hasTestimonial: form.value.testimonialQuote.trim() !== "",
      newId: deps.newId,
    });

    const stopped = aborted();
    if (stopped) return stopped;

    const created = await attempt("REVISION_WRITE_FAILED", () =>
      deps.createWorkingRevision(actor.value, {
        caseId,
        doc,
        manifest,
        meta: { model: null, fellBack: false, promptVersion: null },
        expectedHeadVersion: baseHeadVersion,
      }),
    );
    let revisionId: string | null = null;
    if (created.ok) {
      revisionId = created.value.id;
    } else if (created.error.code === "STALE_HEAD") {
      // The head moved since the press: the result is discarded and the case goes back to draft.
      await backToDraft(caseId, actor.value);
      return fail("STALE_HEAD", "The case changed while it was generated.");
    } else {
      // An unclear write (e.g. REVISION_WRITE_FAILED) may have committed: a moved head means it landed.
      const reread = await attempt("CASE_STUDY_LOOKUP_FAILED", () => deps.getCase(caseId));
      if (!reread.ok || reread.value.headVersion === baseHeadVersion) {
        return fail("REVISION_WRITE_FAILED", created.error.message, true);
      }
      log.warn(`generate revision write reported ${created.error.code} but the head moved: the revision landed`, { caseId });
    }

    // From here the revision exists: no more retries that would hit STALE_HEAD.
    const done = await attempt("TRANSITION_FAILED", () => deps.transition(caseId, "generation_succeeded", actor.value));
    if (!done.ok) {
      const reread = await attempt("CASE_STUDY_LOOKUP_FAILED", () => deps.getCase(caseId));
      if (!(reread.ok && reread.value.status === "in_review")) {
        return fail("TRANSITION_FAILED", done.error.message);
      }
    }
    if (revisionId !== null) {
      const recorded = await attempt("EVENT_WRITE_FAILED", () =>
        deps.recordEvent(actor.value, { caseId, type: JOB_OK, revisionId: revisionId as string, data: { jobId: job.id, kind: "generate" } }),
      );
      if (!recorded.ok) log.error(`job_ok event not recorded: ${recorded.error.code}`, { jobId: job.id, caseId });
    }
    log.info("generated a draft", { jobId: job.id, caseId });
    return ok(undefined);
  }

  async function onPermanentFailure(job: JobLike): Promise<void> {
    const actor = await attempt("SYSTEM_ACTOR_LOOKUP_THREW", () => deps.getSystemActor());
    if (!actor.ok) {
      log.error(`generate rollback: no system actor (${actor.error.code})`, { jobId: job.id });
      return;
    }
    await backToDraft(job.subjectId, actor.value);
  }

  return { run, onPermanentFailure, caseIdOf: (job: JobLike) => job.subjectId };
}
