import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import { buildTestDraft, type CaseStudyDocument, type TestDraftForm, type TestDraftInput } from "@/modules/generation";
import { getEnv } from "@/shared/env";
import type { CaseStatus } from "@/shared/case-status";
import { log } from "@/shared/log";
import { err, type Result } from "@/shared/result";

export const TEST_DRAFT_USAGE = "Usage: npm run dev:test-draft -- <caseId>";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The use cases the command calls, loaded only after the project check passed. */
export interface TestDraftServices {
  getSystemActor: () => Promise<Result<Actor>>;
  authorize: (actor: Actor, action: "job work") => Result<void>;
  getCase: (caseId: string) => Promise<Result<{ status: CaseStatus; headVersion: number }>>;
  hasMaterial: (caseId: string) => Promise<Result<boolean>>;
  listAssets: (input: { caseId: string }) => Promise<Result<readonly { id: string; kind: string }[]>>;
  getDetailsForm: (input: { caseId: string }) => Promise<Result<TestDraftForm>>;
  transition: (caseId: string, event: "generate" | "generation_succeeded" | "generation_failed", actor: Actor) => Promise<Result<unknown>>;
  createWorkingRevision: (
    actor: Actor,
    input: {
      caseId: string;
      doc: CaseStudyDocument;
      manifest: { testDraft: true; assetIds: string[] };
      meta: { model: null; fellBack: false; promptVersion: null };
      expectedHeadVersion: number;
    },
  ) => Promise<Result<{ id: string }>>;
  buildTestDraft: (input: TestDraftInput) => CaseStudyDocument;
  newId: () => string;
}

/** What the test-draft command needs, injected so tests touch no database. */
export interface TestDraftDeps {
  loadEnv: () => { SUPABASE_URL: string };
  checkDevProject: (supabaseUrl: string) => Result<"dev" | "local">;
  services: () => Promise<TestDraftServices>;
}

const refused = (code: string, caseId: string) => {
  log.error(`test draft refused: ${code}`, { caseId });
  return 1;
};

/** Runs a use case; a throw becomes a failed result, so the flow can still roll back. */
async function attempt<T>(code: Uppercase<string>, run: () => Promise<Result<T>> | Result<T>): Promise<Result<T>> {
  try {
    return await run();
  } catch (error) {
    // The error's name and message only: never texts.
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : "";
    log.error(`test draft call threw (${code}): ${name}: ${message}`);
    return err({ code, message: "The call threw." });
  }
}

/**
 * `npm run dev:test-draft -- <caseId>` (Story 3.10, dev only): refuses anything but
 * mac-recap-dev or a local stack before reading anything, then, as the `system`
 * actor, builds a test draft of a `draft` case with material (each format's starter
 * pages, texts marked "[bozza di prova]"), writes it as a new working revision and
 * moves the case to Da approvare (`generate`, then `generation_succeeded`). A failed
 * revision write puts the case back to Bozza (`generation_failed`). No LLM is called.
 * Resolves to the exit code: 0 done, 1 refused or failed. Logs error codes, never texts.
 */
export async function runTestDraft(deps: TestDraftDeps, argv: readonly string[]): Promise<number> {
  const args = argv.filter((a) => a !== "--");
  if (args.length !== 1 || !UUID.test(args[0])) {
    console.error(TEST_DRAFT_USAGE);
    return 1;
  }
  const caseId = args[0].toLowerCase();

  let url: string;
  try {
    url = deps.loadEnv().SUPABASE_URL;
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    return 1;
  }
  const project = deps.checkDevProject(url);
  if (!project.ok) return refused(project.error.code, caseId);

  const s = await deps.services();
  const actor = await attempt("SYSTEM_ACTOR_LOOKUP_THREW", () => s.getSystemActor());
  if (!actor.ok) return refused(actor.error.code, caseId);
  const allowed = s.authorize(actor.value, "job work");
  if (!allowed.ok) return refused(allowed.error.code, caseId);

  const found = await attempt("CASE_STUDY_LOOKUP_FAILED", () => s.getCase(caseId));
  if (!found.ok) return refused(found.error.code, caseId);
  if (found.value.status !== "draft") return refused("INVALID_TRANSITION", caseId);
  const material = await attempt("MATERIAL_LOOKUP_FAILED", () => s.hasMaterial(caseId));
  if (!material.ok) return refused(material.error.code, caseId);
  if (!material.value) return refused("NO_MATERIAL", caseId);

  const assets = await attempt("ASSET_LOOKUP_FAILED", () => s.listAssets({ caseId }));
  if (!assets.ok) return refused(assets.error.code, caseId);
  const form = await attempt("DETAILS_LOOKUP_FAILED", () => s.getDetailsForm({ caseId }));
  if (!form.ok) return refused(form.error.code, caseId);
  // `listAssets` lists non-deleted assets oldest first; favourites are ignored.
  const assetIds = assets.value.map((a) => a.id);
  const images = assets.value.filter((a) => a.kind === "image").map((a) => a.id);

  const generating = await attempt("TRANSITION_FAILED", () => s.transition(caseId, "generate", actor.value));
  if (!generating.ok) return refused(generating.error.code, caseId);

  const created = await attempt("TEST_DRAFT_FAILED", () => {
    const doc = s.buildTestDraft({ images, assetIds, form: form.value, newId: s.newId });
    return s.createWorkingRevision(actor.value, {
      caseId,
      doc,
      manifest: { testDraft: true, assetIds },
      meta: { model: null, fellBack: false, promptVersion: null },
      expectedHeadVersion: found.value.headVersion,
    });
  });
  let revisionId = "unknown";
  if (!created.ok) {
    log.error(`test draft failed: ${created.error.code}`, { caseId });
    // Some write errors (e.g. REVISION_WRITE_FAILED) may come after the write committed:
    // a moved head version means the revision landed, so the case goes on to in_review.
    const reread = await attempt("CASE_STUDY_LOOKUP_FAILED", () => s.getCase(caseId));
    const landed = reread.ok && reread.value.headVersion !== found.value.headVersion;
    if (!landed) {
      const back = await attempt("TRANSITION_FAILED", () => s.transition(caseId, "generation_failed", actor.value));
      if (!back.ok) log.error(`test draft rollback failed: ${back.error.code}; the case is stuck in generating`, { caseId });
      return 1;
    }
    log.warn("test draft revision write reported an error but the head moved: the revision landed", { caseId });
  } else {
    revisionId = created.value.id;
  }

  const done = await attempt("TRANSITION_FAILED", () => s.transition(caseId, "generation_succeeded", actor.value));
  if (!done.ok) {
    log.error(`test draft written but not moved to in_review: ${done.error.code}`, { caseId });
    return 1;
  }
  log.info(`test draft on ${project.value}: revision ${revisionId} written, case in review`, { caseId, actorId: actor.value.id });
  return 0;
}

/** The real dependencies; the use cases are loaded only after the project check. */
export const defaultTestDraftDeps = async (): Promise<TestDraftDeps> => {
  const { checkDevProject } = await import("@/modules/material/worker");
  return {
    loadEnv: getEnv,
    checkDevProject,
    services: async () => {
      const [access, caseStudy, material] = await Promise.all([
        import("@/modules/access"),
        import("@/modules/case-study"),
        import("@/modules/material"),
      ]);
      return {
        getSystemActor: access.getSystemActor,
        authorize: (actor, action) => access.authorize(actor, action),
        getCase: caseStudy.get,
        hasMaterial: material.hasMaterial,
        listAssets: material.listAssets,
        getDetailsForm: material.getDetailsForm,
        transition: caseStudy.transition,
        createWorkingRevision: caseStudy.createWorkingRevision,
        buildTestDraft,
        newId: randomUUID,
      };
    },
  };
};
