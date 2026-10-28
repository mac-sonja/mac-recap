import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { buildTestDraft, validateNewDocument, type CaseStudyDocument } from "@/modules/generation";
import { err, ok } from "@/shared/result";
import { runTestDraft, TEST_DRAFT_USAGE, type TestDraftDeps, type TestDraftServices } from "./test-draft";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const IMAGE = "aaaaaaaa-0000-4000-8000-000000000001";
const PDF = "bbbbbbbb-0000-4000-8000-000000000001";
const VIDEO = "cccccccc-0000-4000-8000-000000000001";
const SYSTEM = { id: "00000000-0000-4000-8000-0000000000aa", role: "system" } as unknown as Actor;
const SECRET = "Testo riservato del cliente";

const services = (over: Partial<TestDraftServices> = {}): TestDraftServices => ({
  getSystemActor: vi.fn(async () => ok(SYSTEM)),
  authorize: vi.fn(() => ok(undefined)),
  getCase: vi.fn(async () => ok({ status: "draft" as const, headVersion: 3 })),
  hasMaterial: vi.fn(async () => ok(true)),
  listAssets: vi.fn(async () =>
    ok([
      { id: PDF, kind: "document" },
      { id: IMAGE, kind: "image" },
      { id: VIDEO, kind: "video" },
    ]),
  ),
  getDetailsForm: vi.fn(async () => ok({ context: SECRET, solution: "", results: [{ label: "a", value: "1" }], testimonialQuote: "" })),
  transition: vi.fn(async () => ok({})),
  createWorkingRevision: vi.fn(async () => ok({ id: "rev-1" })),
  buildTestDraft: vi.fn(buildTestDraft),
  newId: randomUUID,
  ...over,
});

const deps = (s: TestDraftServices, over: Partial<TestDraftDeps> = {}): TestDraftDeps => ({
  loadEnv: () => ({ SUPABASE_URL: "https://jydtnzbmzetbpyjppmxw.supabase.co" }),
  checkDevProject: vi.fn(() => ok("dev" as const)),
  services: vi.fn(async () => s),
  ...over,
});

const output = () =>
  vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .join("");
const events = (s: TestDraftServices) => vi.mocked(s.transition).mock.calls.map(([, event]) => event);

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("runTestDraft (Story 3.10)", () => {
  it("happy path: authorizes job work, writes a working revision and moves the case to in_review", async () => {
    const s = services();
    expect(await runTestDraft(deps(s), ["--", CASE_ID])).toBe(0);
    expect(s.authorize).toHaveBeenCalledWith(SYSTEM, "job work");
    expect(events(s)).toEqual(["generate", "generation_succeeded"]);
    const [actor, input] = vi.mocked(s.createWorkingRevision).mock.calls[0];
    expect(actor).toBe(SYSTEM);
    expect(input).toMatchObject({
      caseId: CASE_ID,
      manifest: { testDraft: true, assetIds: [PDF, IMAGE, VIDEO] },
      meta: { model: null, fellBack: false, promptVersion: null },
      expectedHeadVersion: 3,
    });
    expect(validateNewDocument(input.doc).ok).toBe(true);
    // Images only, oldest first: videos and documents are left out.
    expect(vi.mocked(s.buildTestDraft).mock.calls[0][0]).toMatchObject({ images: [IMAGE], assetIds: [PDF, IMAGE, VIDEO] });
    // Texts are never logged.
    expect(output()).not.toContain(SECRET);
    expect(output()).toContain("in review");
  });

  it("the revision is written between generate and generation_succeeded", async () => {
    const order: string[] = [];
    const s = services({
      transition: vi.fn(async (_id, event) => (order.push(event), ok({}))),
      createWorkingRevision: vi.fn(async () => (order.push("revision"), ok({ id: "rev-1" }))),
    });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(0);
    expect(order).toEqual(["generate", "revision", "generation_succeeded"]);
  });

  it("no material: nothing written, exit 1 with NO_MATERIAL", async () => {
    const s = services({ hasMaterial: vi.fn(async () => ok(false)) });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(s.transition).not.toHaveBeenCalled();
    expect(s.createWorkingRevision).not.toHaveBeenCalled();
    expect(output()).toContain("NO_MATERIAL");
  });

  it("not a draft: nothing written, exit 1 with INVALID_TRANSITION", async () => {
    const s = services({ getCase: vi.fn(async () => ok({ status: "in_review" as const, headVersion: 1 })) });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(s.transition).not.toHaveBeenCalled();
    expect(s.createWorkingRevision).not.toHaveBeenCalled();
    expect(output()).toContain("INVALID_TRANSITION");
  });

  it("production: nothing read or written, exit 1 with PRODUCTION_REFUSED", async () => {
    const s = services();
    const d = deps(s, { checkDevProject: vi.fn(() => err({ code: "PRODUCTION_REFUSED", message: "no" })) });
    expect(await runTestDraft(d, [CASE_ID])).toBe(1);
    expect(d.services).not.toHaveBeenCalled();
    expect(output()).toContain("PRODUCTION_REFUSED");
  });

  it("an invalid environment exits 1 without loading anything", async () => {
    const s = services();
    const d = deps(s, {
      loadEnv: () => {
        throw new Error("SUPABASE_URL missing");
      },
    });
    expect(await runTestDraft(d, [CASE_ID])).toBe(1);
    expect(d.services).not.toHaveBeenCalled();
  });

  it("revision fails: the case goes back to draft, exit 1 with its code", async () => {
    const s = services({ createWorkingRevision: vi.fn(async () => err({ code: "STALE_HEAD", message: "moved" })) });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(events(s)).toEqual(["generate", "generation_failed"]);
    expect(output()).toContain("STALE_HEAD");
  });

  it("a revision write that throws also rolls back", async () => {
    const s = services({
      createWorkingRevision: vi.fn(async (): Promise<never> => {
        throw new Error("network");
      }),
    });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(events(s)).toEqual(["generate", "generation_failed"]);
  });

  it("generation_succeeded fails: exit 1 with its code, no rollback", async () => {
    const s = services({
      transition: vi.fn(async (_id, event) => (event === "generation_succeeded" ? err({ code: "STALE_STATUS", message: "moved" }) : ok({}))),
    });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(events(s)).toEqual(["generate", "generation_succeeded"]);
    expect(output()).toContain("STALE_STATUS");
  });

  it("revision fails and the rollback fails too: exit 1, rollback failed logged", async () => {
    const s = services({
      createWorkingRevision: vi.fn(async () => err({ code: "STALE_HEAD", message: "moved" })),
      transition: vi.fn(async (_id, event) => (event === "generation_failed" ? err({ code: "STALE_STATUS", message: "moved" }) : ok({}))),
    });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(events(s)).toEqual(["generate", "generation_failed"]);
    expect(output()).toContain("rollback failed");
  });

  it("revision reports an error but the head moved: the write landed, no rollback, generation_succeeded runs", async () => {
    const getCase = vi
      .fn<TestDraftServices["getCase"]>()
      .mockResolvedValueOnce(ok({ status: "draft", headVersion: 3 }))
      .mockResolvedValue(ok({ status: "generating", headVersion: 4 }));
    const s = services({ getCase, createWorkingRevision: vi.fn(async () => err({ code: "REVISION_WRITE_FAILED", message: "lost" })) });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(0);
    expect(events(s)).toEqual(["generate", "generation_succeeded"]);
    expect(output()).toContain("REVISION_WRITE_FAILED");
  });

  it("a thrown call logs the error's name and message", async () => {
    const s = services({
      createWorkingRevision: vi.fn(async (): Promise<never> => {
        throw new TypeError("socket closed");
      }),
    });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(output()).toContain("TypeError: socket closed");
  });

  it("happy path: the doc holds the context-derived Sfida text citing the context answer", async () => {
    const s = services();
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(0);
    const doc = vi.mocked(s.createWorkingRevision).mock.calls[0][1].doc;
    const json = JSON.stringify(doc);
    const texts: { text?: string; sourceRefs?: unknown }[] = [];
    JSON.parse(json, (_k, v: unknown) => {
      if (v !== null && typeof v === "object" && (v as { type?: string }).type === "text") texts.push(v as { text?: string; sourceRefs?: unknown });
      return v;
    });
    const sfida = texts.filter((t) => t.text?.startsWith("[bozza di prova] Sfida") && t.text.includes(SECRET));
    expect(sfida.length).toBeGreaterThan(0);
    for (const t of sfida) expect(t.sourceRefs).toEqual([{ kind: "form_field", id: "context" }]);
  });

  it("a failed generate writes nothing", async () => {
    const s = services({ transition: vi.fn(async () => err({ code: "STALE_STATUS", message: "moved" })) });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(1);
    expect(s.createWorkingRevision).not.toHaveBeenCalled();
    expect(events(s)).toEqual(["generate"]);
  });

  it("refuses without the system actor or job work", async () => {
    const noActor = services({ getSystemActor: vi.fn(async () => err({ code: "UNAUTHENTICATED", message: "no" })) });
    expect(await runTestDraft(deps(noActor), [CASE_ID])).toBe(1);
    expect(noActor.getCase).not.toHaveBeenCalled();
    const forbidden = services({ authorize: vi.fn(() => err({ code: "FORBIDDEN", message: "no" })) });
    expect(await runTestDraft(deps(forbidden), [CASE_ID])).toBe(1);
    expect(forbidden.getCase).not.toHaveBeenCalled();
    expect(forbidden.transition).not.toHaveBeenCalled();
  });

  it.each([[[]], [["not-a-uuid"]], [[CASE_ID, CASE_ID]], [["--"]]])("bad argument %j: usage message, nothing done", async (argv) => {
    const s = services();
    const d = deps(s);
    expect(await runTestDraft(d, argv)).toBe(1);
    expect(console.error).toHaveBeenCalledWith(TEST_DRAFT_USAGE);
    expect(d.checkDevProject).not.toHaveBeenCalled();
    expect(d.services).not.toHaveBeenCalled();
  });

  it("a build with the fake deps' document stays a CaseStudyDocument", async () => {
    let built: CaseStudyDocument | undefined;
    const s = services({ buildTestDraft: vi.fn((input) => (built = buildTestDraft(input))) });
    expect(await runTestDraft(deps(s), [CASE_ID])).toBe(0);
    expect(built?.formats.carosello_1_1.pages.map((p) => p.pageKey)).toEqual(["intro", "intro-sfida", "intro-idea", "content", "results", "closing"]);
  });
});
