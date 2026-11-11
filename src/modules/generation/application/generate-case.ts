import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@/modules/access";
import { buildClientIntroDocument } from "@/modules/generation/application/client-intro-draft";
import { buildCaseDocument, type FormatDraftTexts, type TestDraftForm } from "@/modules/generation/application/test-draft";
import {
  clientTestTextSource,
  testDraftTextSource,
  type ClientTextSource,
  type ClientTextSourceInput,
  type SourceAsset,
  type TextSource,
  type TextSourceMeta,
} from "@/modules/generation/application/text-source";
import { CLAIM_ASPECTS, type CaseStudyDocument, type ClaimAspect } from "@/modules/generation/domain/document";
import type { CaseStatus } from "@/shared/case-status";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";

/** The case event written when a generate job succeeds; `data` is `{ jobId, kind, missingAspect? }`, `revisionId` the new head. */
export const JOB_OK = "job_ok";

/** The material manifest a generate job carries and its revision stores (see `material.buildManifest`). */
export const generateManifestSchema = z.object({
  assets: z.array(z.object({ id: z.uuid(), sizeBytes: z.number().int(), contentType: z.string() })),
  formHash: z.string().min(1),
});
export type GenerateManifest = z.infer<typeof generateManifestSchema>;

/** What a generate job drafts (Story 3.11): a case, or a client's intro and outro. */
export const GENERATE_SUBJECTS = ["case", "client_intro"] as const;
export type GenerateSubject = (typeof GENERATE_SUBJECTS)[number];

/**
 * A case's generate job payload: the head version the action read and the manifest.
 * `subject` defaults to `case`, so jobs queued before Story 3.11 still read.
 */
export const generatePayloadSchema = z.object({
  subject: z.literal("case").default("case"),
  baseHeadVersion: z.number().int().nonnegative(),
  manifest: generateManifestSchema,
});
export type GeneratePayload = z.infer<typeof generatePayloadSchema>;

/** A client intro's generate job payload (Story 3.11): the intro's head version when the save started it. */
export const clientIntroPayloadSchema = z.object({
  subject: z.literal("client_intro"),
  baseHeadVersion: z.number().int().nonnegative(),
});
export type ClientIntroPayload = z.infer<typeof clientIntroPayloadSchema>;

/** Either payload, by `subject` (absent: a case). */
function parsePayload(payload: Record<string, unknown>): GeneratePayload | ClientIntroPayload | null {
  const parsed = payload.subject === "client_intro" ? clientIntroPayloadSchema.safeParse(payload) : generatePayloadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** What `jobs.enqueue` takes for a client intro's draft. */
export interface ClientIntroGenerateJob {
  kind: "generate";
  subjectId: string;
  inputHash: string;
  payload: ClientIntroPayload;
}

/**
 * The generate job of a client's intro (Story 3.11): subject the intro, input hash sha256
 * of the subject kind, the intro id and its head version, so saving twice while the job is
 * live gets that job (idempotent enqueue).
 */
export function clientIntroGenerateJob(introId: string, baseHeadVersion: number): ClientIntroGenerateJob {
  const id = introId.toLowerCase();
  const inputHash = createHash("sha256").update(JSON.stringify(["client_intro", id, baseHeadVersion])).digest("hex");
  return { kind: "generate", subjectId: id, inputHash, payload: { subject: "client_intro", baseHeadVersion } };
}

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
  /** The case's live assets now (oldest first, with the favourite flag); only those also in the job's manifest are read. */
  listGenerationAssets(caseId: string): Promise<Result<readonly SourceAsset[]>>;
  getDetailsForm(input: { caseId: string }): Promise<Result<TestDraftForm>>;
  transition(caseId: string, event: "generation_succeeded" | "generation_failed", actor: Actor): Promise<Result<unknown>>;
  createWorkingRevision(
    actor: Actor,
    input: {
      caseId: string;
      doc: CaseStudyDocument;
      manifest: GenerateManifest;
      meta: TextSourceMeta;
      expectedHeadVersion: number;
    },
  ): Promise<Result<{ id: string }>>;
  recordEvent(
    actor: Actor,
    input: { caseId: string; type: string; revisionId: string; data: Record<string, string> },
  ): Promise<Result<unknown>>;
  textSource?: TextSource;
  newId: () => string;
  /** The client intro side (Story 3.11); without it a `client_intro` job fails for good. */
  intro?: ClientIntroGenerateDeps;
}

/** What the generate handler needs for a client intro (Story 3.11), wired in `worker.ts`. */
export interface ClientIntroGenerateDeps {
  getIntro(introId: string): Promise<Result<{ clientId: string; status: CaseStatus; headVersion: number }>>;
  /** The client's current record and brief (Story 3.9: what the AI reads). */
  getClient(clientId: string): Promise<Result<ClientTextSourceInput["client"]>>;
  /** The client's live files in `position` order. */
  listClientAssets(clientId: string): Promise<Result<ClientTextSourceInput["assets"]>>;
  transitionIntro(introId: string, event: "generation_succeeded" | "generation_failed", actor: Actor): Promise<Result<unknown>>;
  createIntroWorkingRevision(
    actor: Actor,
    input: {
      clientIntroId: string;
      doc: CaseStudyDocument;
      manifest: ClientIntroManifest;
      meta: TextSourceMeta;
      expectedHeadVersion: number;
    },
  ): Promise<Result<{ id: string }>>;
  /**
   * Writes the four texts (Story 3.9): the AI when `ANTHROPIC_API_KEY` is set, else the
   * marked test text (the default).
   */
  textSource?: ClientTextSource;
}

/** What an intro revision records of its input: the images it shows; the test text is flagged. */
export type ClientIntroManifest = { assetIds: string[]; testDraft?: true };

/** The intro needs this many client images: case-study's `CLIENT_MATERIAL_MIN_IMAGES` (kept equal by `generation/index.test.ts`). */
export const MIN_CLIENT_IMAGES = 2;
/** The client template shows the first three. */
const CLIENT_INTRO_IMAGES = 3;

interface JobLike {
  id: string;
  subjectId: string;
  payload: Record<string, unknown>;
}

type Outcome = Result<void, { code: Uppercase<string>; message: string; retryable?: boolean }>;

const fail = (code: Uppercase<string>, message: string, retryable = false): Outcome => err({ code, message, retryable });

/**
 * The sides of the work no text covers (Story 3.6, AR6): `technical`, `graphic` or `both`,
 * or null when every side has a text. Recorded on `job_ok`, never blocking (IR-A3).
 */
export function missingAspect(texts: FormatDraftTexts): "technical" | "graphic" | "both" | null {
  const seen = new Set<ClaimAspect>();
  for (const byKey of Object.values(texts)) for (const t of Object.values(byKey)) if (t.aspect !== undefined) seen.add(t.aspect);
  const missing = CLAIM_ASPECTS.filter((a) => !seen.has(a));
  return missing.length === 0 ? null : missing.length === 2 ? "both" : missing[0];
}

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
 * document with `buildCaseDocument` from the text source (the AI's texts, Story 3.6, or
 * the marked test text), reads only the assets of the job's manifest, writes a new working revision
 * (head compare-and-set on `baseHeadVersion`) and moves the case to `in_review` with a
 * `job_ok` event. A moved head (`STALE_HEAD`) discards the result and returns the case to
 * `draft`; `onPermanentFailure` does the same after a failure for good. Logs ids and
 * error codes only. Calls an LLM only through the injected text source.
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
    const payload = parsePayload(job.payload);
    if (payload === null) return fail("INVALID_PAYLOAD", "The job payload is not a generate payload.");
    if (payload.subject === "client_intro") return runIntro(job, payload, signal);
    return runCase(job, payload, signal);
  }

  async function runCase(job: JobLike, payload: GeneratePayload, signal: AbortSignal): Promise<Outcome> {
    const caseId = job.subjectId;
    const aborted = () => (signal.aborted ? fail("ABORTED", "The job was aborted.") : null);
    const { baseHeadVersion, manifest } = payload;

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
    const current = await attempt("MATERIAL_LOOKUP_FAILED", () => deps.listGenerationAssets(caseId));
    if (!current.ok) return fail("MATERIAL_LOOKUP_FAILED", current.error.message, true);
    // Only the manifest's assets that are still live; material added after enqueue is ignored.
    const inManifest = new Set(manifest.assets.map((a) => a.id));
    const assets = current.value.filter((a) => inManifest.has(a.id));
    if (assets.length === 0) return fail("NO_MATERIAL", "None of the job's material is left.");

    const form = await attempt("DETAILS_LOOKUP_FAILED", () => deps.getDetailsForm({ caseId }));
    if (!form.ok) return fail("DETAILS_LOOKUP_FAILED", form.error.message, true);

    const images = assets.filter((a) => a.kind === "image").map((a) => a.id);
    let written;
    try {
      written = await source.texts({ caseId, form: form.value, assets });
    } catch (error) {
      log.error(`generate text source threw: ${error instanceof Error ? error.name : typeof error}`, { caseId });
      return fail("TEXT_SOURCE_FAILED", "The text source threw.", true);
    }
    if (!written.ok) return fail(written.error.code, written.error.message, written.error.retryable);
    const { texts, meta } = written.value;
    const doc = buildCaseDocument({
      texts,
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
        meta,
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
      // The test text tags no aspect: only an AI draft records a missing one.
      const missing = meta.promptVersion === null ? null : missingAspect(texts);
      const data: Record<string, string> = { jobId: job.id, kind: "generate", ...(missing === null ? {} : { missingAspect: missing }) };
      const recorded = await attempt("EVENT_WRITE_FAILED", () =>
        deps.recordEvent(actor.value, { caseId, type: JOB_OK, revisionId: revisionId as string, data }),
      );
      if (!recorded.ok) log.error(`job_ok event not recorded: ${recorded.error.code}`, { jobId: job.id, caseId });
    }
    log.info("generated a draft", { jobId: job.id, caseId });
    return ok(undefined);
  }

  /** `generation_failed` when the intro is still `generating`; an intro in any other status is left alone. */
  async function introBackToDraft(intro: ClientIntroGenerateDeps, introId: string, actor: Actor): Promise<void> {
    const found = await attempt("CLIENT_INTRO_LOOKUP_FAILED", () => intro.getIntro(introId));
    if (!found.ok) {
      log.error(`generate rollback: intro not read (${found.error.code})`, { clientIntroId: introId });
      return;
    }
    if (found.value.status !== "generating") return;
    const back = await attempt("TRANSITION_FAILED", () => intro.transitionIntro(introId, "generation_failed", actor));
    if (!back.ok) log.error(`generate rollback failed: ${back.error.code}; the intro is stuck in generating`, { clientIntroId: introId });
  }

  /**
   * A client intro's draft (Story 3.11, 3.9). Re-checks the gate (2 client images), asks the
   * intro's text source for the four texts (the AI's from the client's current data and PDFs
   * when `ANTHROPIC_API_KEY` is set, else the marked test text; never the case text source),
   * builds the document from the client template with the client's first three images in
   * `position` order, writes a working revision with the source's meta (head compare-and-set
   * on `baseHeadVersion`) and moves the intro to `in_review`. A moved head returns it to
   * `draft`; `onPermanentFailure` does the same after a failure for good.
   */
  async function runIntro(job: JobLike, payload: ClientIntroPayload, signal: AbortSignal): Promise<Outcome> {
    const intro = deps.intro;
    if (intro === undefined) return fail("SUBJECT_NOT_SUPPORTED", "This worker drafts no client intros.");
    const introId = job.subjectId;
    const { baseHeadVersion } = payload;

    const actor = await attempt("SYSTEM_ACTOR_LOOKUP_THREW", () => deps.getSystemActor());
    if (!actor.ok) return fail("SYSTEM_ACTOR_LOOKUP_FAILED", actor.error.message, true);

    const found = await attempt("CLIENT_INTRO_LOOKUP_FAILED", () => intro.getIntro(introId));
    if (!found.ok) return fail(found.error.code === "NOT_FOUND" ? "NOT_FOUND" : "CLIENT_INTRO_LOOKUP_FAILED", found.error.message, found.error.code !== "NOT_FOUND");
    // The save moves the intro to `generating` right after enqueueing: a draft may just be early.
    if (found.value.status === "draft") return fail("NOT_GENERATING", "The client intro is not generating yet.", true);
    if (found.value.status !== "generating") return fail("NOT_GENERATING", "The client intro is not generating.");
    const { clientId } = found.value;

    const client = await attempt("CLIENT_LOOKUP_FAILED", () => intro.getClient(clientId));
    if (!client.ok) return fail(client.error.code === "CLIENT_NOT_FOUND" ? "CLIENT_NOT_FOUND" : "CLIENT_LOOKUP_FAILED", client.error.message, client.error.code !== "CLIENT_NOT_FOUND");
    const assets = await attempt("CLIENT_LOOKUP_FAILED", () => intro.listClientAssets(clientId));
    if (!assets.ok) return fail("CLIENT_LOOKUP_FAILED", assets.error.message, true);
    const images = assets.value.filter((a) => a.kind === "image").map((a) => a.id);
    // Gate, again: the server checked it at the save; a file may have gone since.
    if (images.length < MIN_CLIENT_IMAGES) return fail("NO_CLIENT_IMAGES", `The client has fewer than ${MIN_CLIENT_IMAGES} images.`);

    const source = intro.textSource ?? clientTestTextSource;
    let written;
    try {
      written = await source.texts({ clientId, client: client.value, assets: assets.value });
    } catch (error) {
      log.error(`generate client text source threw: ${error instanceof Error ? error.name : typeof error}`, { clientIntroId: introId });
      return fail("TEXT_SOURCE_FAILED", "The text source threw.", true);
    }
    if (!written.ok) return fail(written.error.code, written.error.message, written.error.retryable);
    const { texts, meta } = written.value;

    const { brief } = client.value;
    const doc = buildClientIntroDocument({
      texts,
      images,
      resultRows: brief.results.length,
      hasTestimonial: brief.testimonialQuote.trim() !== "",
      newId: deps.newId,
    });

    if (signal.aborted) return fail("ABORTED", "The job was aborted.");

    const created = await attempt("REVISION_WRITE_FAILED", () =>
      intro.createIntroWorkingRevision(actor.value, {
        clientIntroId: introId,
        doc,
        manifest: { assetIds: images.slice(0, CLIENT_INTRO_IMAGES), ...(meta.promptVersion === null ? { testDraft: true as const } : {}) },
        meta,
        expectedHeadVersion: baseHeadVersion,
      }),
    );
    if (!created.ok) {
      if (created.error.code === "STALE_HEAD") {
        await introBackToDraft(intro, introId, actor.value);
        return fail("STALE_HEAD", "The client intro changed while it was drafted.");
      }
      // An unclear write may have committed: a moved head means it landed.
      const reread = await attempt("CLIENT_INTRO_LOOKUP_FAILED", () => intro.getIntro(introId));
      if (!reread.ok || reread.value.headVersion === baseHeadVersion) return fail("REVISION_WRITE_FAILED", created.error.message, true);
      log.warn(`intro revision write reported ${created.error.code} but the head moved: the revision landed`, { clientIntroId: introId });
    }

    const done = await attempt("TRANSITION_FAILED", () => intro.transitionIntro(introId, "generation_succeeded", actor.value));
    if (!done.ok) {
      const reread = await attempt("CLIENT_INTRO_LOOKUP_FAILED", () => intro.getIntro(introId));
      if (!(reread.ok && reread.value.status === "in_review")) return fail("TRANSITION_FAILED", done.error.message);
    }
    log.info("drafted a client intro", { jobId: job.id, clientIntroId: introId });
    return ok(undefined);
  }

  async function onPermanentFailure(job: JobLike): Promise<void> {
    const actor = await attempt("SYSTEM_ACTOR_LOOKUP_THREW", () => deps.getSystemActor());
    if (!actor.ok) {
      log.error(`generate rollback: no system actor (${actor.error.code})`, { jobId: job.id });
      return;
    }
    const payload = parsePayload(job.payload);
    if (payload?.subject === "client_intro") {
      if (deps.intro !== undefined) await introBackToDraft(deps.intro, job.subjectId, actor.value);
      return;
    }
    await backToDraft(job.subjectId, actor.value);
  }

  /** A case job's `job_failed` goes on its case; a client intro has no case. */
  const caseIdOf = (job: JobLike) => (job.payload.subject === "client_intro" ? null : job.subjectId);

  return { run, onPermanentFailure, caseIdOf };
}
