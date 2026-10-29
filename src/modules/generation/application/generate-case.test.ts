import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { makeGenerateHandler, generateInputHash, JOB_OK, missingAspect, type GenerateDeps, type GenerateManifest } from "@/modules/generation/application/generate-case";
import { sameInEveryFormat, TEST_DRAFT_MARKER, testDraftTexts, type DraftTexts } from "@/modules/generation/application/test-draft";
import { testDraftTextSource, type SourceAsset, type TextSource } from "@/modules/generation/application/text-source";
import { validateNewDocument } from "@/modules/generation";
import { err, ok } from "@/shared/result";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE = "aaaaaaaa-0000-4000-8000-000000000001";
const PDF = "bbbbbbbb-0000-4000-8000-000000000001";
const LATE = "cccccccc-0000-4000-8000-000000000001";
const SYSTEM = { id: "00000000-0000-4000-8000-0000000000aa", role: "system" } as unknown as Actor;
const SECRET = "Testo riservato del cliente";
const manifest: GenerateManifest = {
  assets: [
    { id: IMAGE, sizeBytes: 10, contentType: "image/png" },
    { id: PDF, sizeBytes: 20, contentType: "application/pdf" },
  ],
  formHash: "abc",
};
const asSource = (id: string, contentType: string, kind: SourceAsset["kind"]): SourceAsset => ({ id, contentType, kind, sizeBytes: 10, isFavourite: false });
const job = { id: "dddddddd-0000-4000-8000-000000000001", subjectId: CASE_ID, payload: { baseHeadVersion: 3, manifest } as Record<string, unknown> };
const live = new AbortController().signal;

function make(over: Partial<GenerateDeps> = {}) {
  const deps = {
    getSystemActor: vi.fn(async () => ok(SYSTEM)),
    getCase: vi.fn(async () => ok({ status: "generating" as const, headVersion: 3 })),
    hasMaterial: vi.fn(async () => ok(true)),
    listGenerationAssets: vi.fn(async () =>
      ok([asSource(IMAGE, "image/png", "image"), asSource(PDF, "application/pdf", "document"), asSource(LATE, "image/png", "image")]),
    ),
    getDetailsForm: vi.fn(async () => ok({ context: SECRET, solution: "", results: [{ label: "a", value: "1" }], testimonialQuote: "" })),
    transition: vi.fn(async () => ok({})),
    createWorkingRevision: vi.fn(async () => ok({ id: "rev-1" })),
    recordEvent: vi.fn(async () => ok({})),
    newId: randomUUID,
    ...over,
  } satisfies GenerateDeps;
  return { deps, handler: makeGenerateHandler(deps) };
}
const events = (d: ReturnType<typeof make>["deps"]) => vi.mocked(d.transition).mock.calls.map((c) => c[1]);

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

describe("generate handler: success", () => {
  it("writes a valid working revision with the manifest, moves the case to in_review and records job_ok", async () => {
    const { deps, handler } = make();
    expect(await handler.run(job, live)).toEqual(ok(undefined));
    expect(deps.createWorkingRevision).toHaveBeenCalledTimes(1);
    const [actor, input] = vi.mocked(deps.createWorkingRevision).mock.calls[0] as unknown as [Actor, { doc: unknown; manifest: unknown; expectedHeadVersion: number; meta: unknown; caseId: string }];
    expect(actor).toBe(SYSTEM);
    expect(input).toMatchObject({ caseId: CASE_ID, manifest, expectedHeadVersion: 3, meta: { model: null, fellBack: false, promptVersion: null } });
    expect(validateNewDocument(input.doc).ok).toBe(true);
    expect(events(deps)).toEqual(["generation_succeeded"]);
    expect(deps.recordEvent).toHaveBeenCalledWith(SYSTEM, { caseId: CASE_ID, type: JOB_OK, revisionId: "rev-1", data: { jobId: job.id, kind: "generate" } });
    expect(JOB_OK).toBe("job_ok");
  });

  it("fills the document with the marked test text, and only the manifest's assets are cited or placed (late material is ignored)", async () => {
    const { deps, handler } = make();
    await handler.run(job, live);
    const doc = JSON.stringify((vi.mocked(deps.createWorkingRevision).mock.calls[0] as unknown as [Actor, { doc: unknown }])[1].doc);
    expect(doc).toContain(TEST_DRAFT_MARKER);
    expect(doc).toContain(IMAGE);
    expect(doc).not.toContain(LATE);
  });

  it("reads the texts through the text source seam", async () => {
    const texts = vi.fn(testDraftTextSource.texts);
    const { handler } = make({ textSource: { texts } });
    await handler.run(job, live);
    expect(texts).toHaveBeenCalledWith({
      caseId: CASE_ID,
      form: expect.objectContaining({ context: SECRET }),
      assets: [asSource(IMAGE, "image/png", "image"), asSource(PDF, "application/pdf", "document")],
    });
  });

  it("writes the source's meta and, for an AI draft, the missing aspect on job_ok; each format gets its own texts", async () => {
    const base = testDraftTexts({ context: "", solution: "" }, [IMAGE]);
    const tagged = (prefix: string, aspect?: "technical" | "graphic"): DraftTexts =>
      Object.fromEntries(Object.entries(base).map(([k, t]) => [k, { text: `${prefix} ${k}`, sourceRefs: t.sourceRefs, ...(aspect ? { aspect } : {}) }])) as unknown as DraftTexts;
    const source: TextSource = {
      texts: async () =>
        ok({
          texts: { presentazione_16_9: tagged("P", "technical"), carosello_1_1: tagged("C", "technical"), video_9_16: tagged("V") },
          meta: { model: "claude-opus-5-5", fellBack: true, promptVersion: "case-narrative@1" },
        }),
    };
    const { deps, handler } = make({ textSource: source });
    expect((await handler.run(job, live)).ok).toBe(true);
    const input = (vi.mocked(deps.createWorkingRevision).mock.calls[0] as unknown as [Actor, { doc: { formats: Record<string, unknown> }; meta: unknown }])[1];
    expect(input.meta).toEqual({ model: "claude-opus-5-5", fellBack: true, promptVersion: "case-narrative@1" });
    expect(JSON.stringify(input.doc.formats.video_9_16)).toContain("V title");
    expect(JSON.stringify(input.doc.formats.video_9_16)).not.toContain("P title");
    expect(JSON.stringify(input.doc.formats.presentazione_16_9)).toContain('"aspect":"technical"');
    expect(deps.recordEvent).toHaveBeenCalledWith(SYSTEM, expect.objectContaining({ data: { jobId: job.id, kind: "generate", missingAspect: "graphic" } }));
  });

  it("a source failure keeps its code and retry flag; a throw is a retryable TEXT_SOURCE_FAILED", async () => {
    const refused = make({ textSource: { texts: async () => err({ code: "LLM_REFUSAL", message: "m", retryable: false }) } });
    expect(await refused.handler.run(job, live)).toMatchObject({ ok: false, error: { code: "LLM_REFUSAL", retryable: false } });
    expect(refused.deps.createWorkingRevision).not.toHaveBeenCalled();
    const down = make({ textSource: { texts: async () => err({ code: "LLM_UNAVAILABLE", message: "m", retryable: true }) } });
    expect(await down.handler.run(job, live)).toMatchObject({ ok: false, error: { code: "LLM_UNAVAILABLE", retryable: true } });
    const threw = make({ textSource: { texts: async () => { throw new Error(SECRET); } } });
    expect(await threw.handler.run(job, live)).toMatchObject({ ok: false, error: { code: "TEXT_SOURCE_FAILED", retryable: true } });
  });

  it("missingAspect names the uncovered sides", () => {
    const t = testDraftTexts({ context: "", solution: "" }, []);
    expect(missingAspect(sameInEveryFormat(t))).toBe("both");
    const one = { ...t, title: { ...t.title, aspect: "graphic" as const }, subtitle: { ...t.subtitle, aspect: "technical" as const } };
    expect(missingAspect(sameInEveryFormat(one))).toBeNull();
  });

  it("a failing job_ok event does not fail the job", async () => {
    const { handler } = make({ recordEvent: vi.fn(async () => err({ code: "CASE_EVENT_WRITE_FAILED", message: "m" })) });
    expect((await handler.run(job, live)).ok).toBe(true);
  });

  it("a transition error after the revision landed is success when the case is already in_review", async () => {
    const getCase = vi.fn().mockResolvedValueOnce(ok({ status: "generating", headVersion: 3 })).mockResolvedValue(ok({ status: "in_review", headVersion: 4 }));
    const { handler } = make({ getCase, transition: vi.fn(async () => err({ code: "STALE_STATUS", message: "m" })) });
    expect((await handler.run(job, live)).ok).toBe(true);
  });

  it("a transition error after the revision landed, with the case still generating, fails without retry", async () => {
    const { handler } = make({ transition: vi.fn(async () => err({ code: "TRANSITION_FAILED", message: "m" })) });
    const out = await handler.run(job, live);
    expect(out).toMatchObject({ ok: false, error: { code: "TRANSITION_FAILED", retryable: false } });
  });

  it("an unclear revision write whose head moved counts as landed", async () => {
    const getCase = vi.fn().mockResolvedValueOnce(ok({ status: "generating", headVersion: 3 })).mockResolvedValue(ok({ status: "generating", headVersion: 4 }));
    const { deps, handler } = make({ getCase, createWorkingRevision: vi.fn(async () => err({ code: "REVISION_WRITE_FAILED", message: "m" })) });
    expect((await handler.run(job, live)).ok).toBe(true);
    expect(events(deps)).toEqual(["generation_succeeded"]);
    expect(deps.recordEvent).not.toHaveBeenCalled();
  });

  it("an unclear revision write whose head did not move is a retryable failure", async () => {
    const { deps, handler } = make({ createWorkingRevision: vi.fn(async () => err({ code: "REVISION_WRITE_FAILED", message: "m" })) });
    expect(await handler.run(job, live)).toMatchObject({ ok: false, error: { code: "REVISION_WRITE_FAILED", retryable: true } });
    expect(deps.transition).not.toHaveBeenCalled();
  });
});

describe("generate handler: gate and discarded results", () => {
  it("no material: NO_MATERIAL, not retryable, nothing written", async () => {
    const { deps, handler } = make({ hasMaterial: vi.fn(async () => ok(false)) });
    expect(await handler.run(job, live)).toMatchObject({ ok: false, error: { code: "NO_MATERIAL", retryable: false } });
    expect(deps.createWorkingRevision).not.toHaveBeenCalled();
  });

  it("all of the manifest's assets removed since: NO_MATERIAL even though newer files exist", async () => {
    const { deps, handler } = make({ listGenerationAssets: vi.fn(async () => ok([asSource(LATE, "image/png", "image")])) });
    expect(await handler.run(job, live)).toMatchObject({ ok: false, error: { code: "NO_MATERIAL" } });
    expect(deps.createWorkingRevision).not.toHaveBeenCalled();
  });

  it("head moved: STALE_HEAD discards the result and returns the case to draft", async () => {
    const { deps, handler } = make({ createWorkingRevision: vi.fn(async () => err({ code: "STALE_HEAD", message: "m" })) });
    expect(await handler.run(job, live)).toMatchObject({ ok: false, error: { code: "STALE_HEAD", retryable: false } });
    expect(events(deps)).toEqual(["generation_failed"]);
    expect(deps.recordEvent).not.toHaveBeenCalled();
  });

  it("a case that is still draft is retried; any other status is final; an unknown case is final", async () => {
    const draft = make({ getCase: vi.fn(async () => ok({ status: "draft" as const, headVersion: 3 })) });
    expect(await draft.handler.run(job, live)).toMatchObject({ ok: false, error: { code: "NOT_GENERATING", retryable: true } });
    for (const status of ["in_review", "approved"] as const) {
      const other = make({ getCase: vi.fn(async () => ok({ status, headVersion: 3 })) });
      expect(await other.handler.run(job, live)).toMatchObject({ ok: false, error: { code: "NOT_GENERATING", retryable: false } });
      expect(other.deps.createWorkingRevision).not.toHaveBeenCalled();
    }
    const gone = make({ getCase: vi.fn(async () => err({ code: "NOT_FOUND", message: "m" })) });
    expect(await gone.handler.run(job, live)).toMatchObject({ ok: false, error: { code: "NOT_FOUND", retryable: false } });
  });

  it("a bad payload is final", async () => {
    const { handler } = make();
    expect(await handler.run({ ...job, payload: {} }, live)).toMatchObject({ ok: false, error: { code: "INVALID_PAYLOAD", retryable: false } });
  });

  it("an aborted signal writes nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps, handler } = make();
    expect(await handler.run(job, controller.signal)).toMatchObject({ ok: false, error: { code: "ABORTED" } });
    expect(deps.createWorkingRevision).not.toHaveBeenCalled();
  });

  it("a thrown use case becomes a failed result without its message, and lookups are retryable", async () => {
    const { handler } = make({
      getDetailsForm: vi.fn(async () => {
        throw new Error(SECRET);
      }),
    });
    const out = await handler.run(job, live);
    expect(out).toMatchObject({ ok: false, error: { code: "DETAILS_LOOKUP_FAILED", retryable: true } });
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(JSON.stringify(vi.mocked(process.stdout.write).mock.calls)).not.toContain(SECRET);
  });
});

describe("generate handler: onPermanentFailure and caseIdOf", () => {
  it("returns a generating case to draft", async () => {
    const { deps, handler } = make();
    await handler.onPermanentFailure(job);
    expect(deps.transition).toHaveBeenCalledWith(CASE_ID, "generation_failed", SYSTEM);
  });

  it.each(["draft", "in_review", "approved"] as const)("leaves a %s case alone", async (status) => {
    const { deps, handler } = make({ getCase: vi.fn(async () => ok({ status, headVersion: 3 })) });
    await handler.onPermanentFailure(job);
    expect(deps.transition).not.toHaveBeenCalled();
  });

  it("does not throw when the rollback itself fails", async () => {
    const { handler } = make({ transition: vi.fn(async () => err({ code: "TRANSITION_FAILED", message: "m" })) });
    await expect(handler.onPermanentFailure(job)).resolves.toBeUndefined();
  });

  it("maps the job to its case", () => {
    expect(make().handler.caseIdOf(job)).toBe(CASE_ID);
  });
});

describe("generateInputHash", () => {
  it("is deterministic and depends on the case, head version, assets and form", () => {
    const base = generateInputHash(CASE_ID, 3, manifest);
    expect(generateInputHash(CASE_ID.toUpperCase(), 3, manifest)).toBe(base);
    expect(generateInputHash(CASE_ID, 4, manifest)).not.toBe(base);
    expect(generateInputHash(CASE_ID, 3, { ...manifest, formHash: "x" })).not.toBe(base);
    expect(generateInputHash(CASE_ID, 3, { ...manifest, assets: manifest.assets.slice(1) })).not.toBe(base);
    expect(generateInputHash("22222222-2222-4222-8222-222222222222", 3, manifest)).not.toBe(base);
  });
});
