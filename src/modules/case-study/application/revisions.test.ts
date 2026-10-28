import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import type { Revision } from "@/modules/case-study/domain/revision";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { RevisionRepository } from "@/modules/case-study/ports/revision-repository";
import { caseHistoryV0, caseHistoryV1, caseHistoryV2 } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";
import { err, ok } from "@/shared/result";
import { makeCreateWorkingRevision, makeGetEditableRevision, makeGetLiveRevision } from "./revisions";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const CASE_ID = "11111111-0000-4000-8000-000000000001";
const HEAD_ID = "22222222-0000-4000-8000-000000000001";
const APPROVED_ID = "22222222-0000-4000-8000-000000000002";
const now = "2026-10-21T10:00:00.000000+00:00";

const caseStudy = (over: Partial<CaseStudy> = {}): CaseStudy => ({
  id: CASE_ID,
  code: "ACM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Acme", code: "ACM" },
  year: 2026,
  locale: "it",
  businessLines: ["branding"],
  status: "in_review",
  projectOrderRef: null,
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: actor.id,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...over,
});

const stored = (id: string, doc: unknown, over: Partial<Revision> = {}): Revision => ({
  id,
  caseId: CASE_ID,
  clientIntroId: null,
  status: "working",
  version: 0,
  generatedDoc: doc,
  doc,
  manifest: {},
  model: null,
  fellBack: false,
  promptVersion: null,
  schemaVersion: (doc as { schemaVersion: number }).schemaVersion,
  createdBy: actor.id,
  createdAt: now,
  updatedAt: now,
  ...over,
});

function fakes(found: CaseStudy | null, rows: Revision[] = []) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cases = { findById: vi.fn<CaseStudyRepository["findById"]>(async () => ok(found)) } as unknown as CaseStudyRepository & {
    findById: ReturnType<typeof vi.fn>;
  };
  const revisions = {
    findById: vi.fn<RevisionRepository["findById"]>(async (id) => ok(byId.get(id) ?? null)),
    createWorking: vi.fn<RevisionRepository["createWorking"]>(async (input) =>
      ok(stored(HEAD_ID, input.doc, { manifest: input.manifest, model: input.meta.model, fellBack: input.meta.fellBack, promptVersion: input.meta.promptVersion })),
    ),
  };
  return { cases, revisions };
}

describe("createWorkingRevision", () => {
  const input = () => ({ caseId: CASE_ID, doc: caseHistoryV2(FORMAT_IDS), expectedHeadVersion: 0 });

  it("validates the document, then writes it once with the actor and defaults", async () => {
    const deps = fakes(caseStudy());
    const result = await makeCreateWorkingRevision(deps)(actor, input());
    expect(result.ok).toBe(true);
    expect(deps.revisions.createWorking).toHaveBeenCalledTimes(1);
    expect(deps.revisions.createWorking).toHaveBeenCalledWith({
      caseId: CASE_ID,
      doc: caseHistoryV2(FORMAT_IDS),
      manifest: {},
      meta: { model: null, fellBack: false, promptVersion: null },
      expectedHeadVersion: 0,
      actorId: actor.id,
    });
    if (result.ok) expect(result.value.doc).toEqual(caseHistoryV2(FORMAT_IDS));
  });

  it("passes manifest and meta through", async () => {
    const deps = fakes(caseStudy());
    const meta = { model: "claude-opus-5-5", fellBack: true, promptVersion: "narrative@1" };
    const result = await makeCreateWorkingRevision(deps)(actor, { ...input(), manifest: { assets: ["a"] }, meta });
    expect(result).toMatchObject({ ok: true, value: { manifest: { assets: ["a"] }, ...meta } });
  });

  it.each([
    ["formats missing video_9_16", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      delete doc.formats.video_9_16;
      return doc;
    }, "FORMAT_NOT_IN_REVISION"],
    ["formats with story_9_16", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      doc.formats.story_9_16 = doc.formats.video_9_16;
      return doc;
    }, "FORMAT_NOT_IN_REVISION"],
    ["a client value", () => ({ ...caseHistoryV2(FORMAT_IDS), about: { name: "Acme" } }), "DOCUMENT_INVALID"],
    ["a future version", () => ({ ...caseHistoryV2(FORMAT_IDS), schemaVersion: 99 }), "DOCUMENT_SCHEMA_UNSUPPORTED"],
    ["a v1 document", () => caseHistoryV1(), "DOCUMENT_SCHEMA_UNSUPPORTED"],
    ["a v1 document keyed by the registry", () => caseHistoryV1(FORMAT_IDS), "DOCUMENT_SCHEMA_UNSUPPORTED"],
    ["a v0 document", () => caseHistoryV0(), "DOCUMENT_SCHEMA_UNSUPPORTED"],
  ])("refuses %s before any write", async (_name, doc, code) => {
    const deps = fakes(caseStudy());
    const result = await makeCreateWorkingRevision(deps)(actor, { ...input(), doc: doc() });
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(deps.revisions.createWorking).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed case id", { caseId: "x" }],
    ["a negative head version", { expectedHeadVersion: -1 }],
    ["an unknown key", { status: "approved" }],
    ["a client value in meta", { meta: { model: null, clientName: "Acme" } }],
    ["a head version past the Postgres integer range", { expectedHeadVersion: 2_147_483_648 }],
    ["an empty model", { meta: { model: "", fellBack: false, promptVersion: null } }],
    ["a model over 200 characters", { meta: { model: "m".repeat(201), fellBack: false, promptVersion: null } }],
    ["an empty prompt version", { meta: { model: null, fellBack: false, promptVersion: "" } }],
    ["a prompt version over 200 characters", { meta: { model: null, fellBack: false, promptVersion: "p".repeat(201) } }],
  ])("refuses %s with INVALID_INPUT", async (_name, over) => {
    const deps = fakes(caseStudy());
    const result = await makeCreateWorkingRevision(deps)(actor, { ...input(), ...over });
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(deps.revisions.createWorking).not.toHaveBeenCalled();
  });

  it("accepts the bounds themselves", async () => {
    const deps = fakes(caseStudy());
    const meta = { model: "m".repeat(200), fellBack: false, promptVersion: "p".repeat(200) };
    expect((await makeCreateWorkingRevision(deps)(actor, { ...input(), expectedHeadVersion: 2_147_483_647, meta })).ok).toBe(true);
  });

  it("returns the repository's STALE_HEAD", async () => {
    const deps = fakes(caseStudy());
    deps.revisions.createWorking.mockResolvedValueOnce(err({ code: "STALE_HEAD", message: "moved" }));
    expect(await makeCreateWorkingRevision(deps)(actor, input())).toMatchObject({ ok: false, error: { code: "STALE_HEAD" } });
  });
});

describe("getLiveRevision and getEditableRevision", () => {
  const v2 = caseHistoryV2(FORMAT_IDS);
  const v1 = caseHistoryV1();
  const v0 = caseHistoryV0();
  /** What a stored v1 or v0 case history reads as, until Story 3.4 gives the templates default pages. */
  const upgradedV2 = {
    schemaVersion: 2,
    kind: "case_history",
    template: "mac-case@1",
    formats: { presentazione_16_9: { pages: [] }, carosello_1_1: { pages: [] }, video_9_16: { pages: [] } },
  };

  it("live is the approved revision, editable is the head", async () => {
    const deps = fakes(caseStudy({ headRevisionId: HEAD_ID, approvedRevisionId: APPROVED_ID, headVersion: 2 }), [
      stored(HEAD_ID, v2),
      stored(APPROVED_ID, v2, { status: "approved" }),
    ]);
    const live = await makeGetLiveRevision(deps)({ kind: "case", id: CASE_ID });
    const editable = await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID });
    expect(live).toMatchObject({ ok: true, value: { id: APPROVED_ID, status: "approved" } });
    expect(editable).toMatchObject({ ok: true, value: { id: HEAD_ID, status: "working" } });
  });

  it("live is null with only a working head; editable is that head", async () => {
    const deps = fakes(caseStudy({ headRevisionId: HEAD_ID, headVersion: 1 }), [stored(HEAD_ID, v2)]);
    expect(await makeGetLiveRevision(deps)({ kind: "case", id: CASE_ID })).toEqual({ ok: true, value: null });
    expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID })).toMatchObject({ ok: true, value: { id: HEAD_ID } });
  });

  it("both are null for a case with no revision", async () => {
    const deps = fakes(caseStudy());
    expect(await makeGetLiveRevision(deps)({ kind: "case", id: CASE_ID })).toEqual({ ok: true, value: null });
    expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID })).toEqual({ ok: true, value: null });
    expect(deps.revisions.findById).not.toHaveBeenCalled();
  });

  it("returns a stored v2 document as it is", async () => {
    const deps = fakes(caseStudy({ headRevisionId: HEAD_ID }), [stored(HEAD_ID, v2)]);
    expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID })).toMatchObject({ ok: true, value: { doc: v2, generatedDoc: v2, schemaVersion: 2 } });
  });

  it.each([
    ["v1", v1, 1],
    ["v0", v0, 0],
  ] as const)("upgrades a stored %s document to v2 on read and never writes it back", async (_name, doc, version) => {
    const row = stored(APPROVED_ID, doc, { status: "approved" });
    const before = structuredClone(row);
    const deps = fakes(caseStudy({ approvedRevisionId: APPROVED_ID }), [row]);
    const live = await makeGetLiveRevision(deps)({ kind: "case", id: CASE_ID });
    expect(live.ok).toBe(true);
    if (!live.ok || live.value === null) return;
    expect(live.value.doc).toEqual(upgradedV2);
    expect(live.value.generatedDoc).toEqual(upgradedV2);
    expect(live.value.schemaVersion).toBe(version);
    expect(row).toEqual(before);
    expect(deps.revisions.createWorking).not.toHaveBeenCalled();
  });

  it("upgrades a stored v1 head on the editable read too", async () => {
    const row = stored(HEAD_ID, v1);
    const before = structuredClone(row);
    const deps = fakes(caseStudy({ headRevisionId: HEAD_ID }), [row]);
    expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID })).toMatchObject({ ok: true, value: { id: HEAD_ID, doc: upgradedV2, schemaVersion: 1 } });
    expect(row).toEqual(before);
    expect(deps.revisions.createWorking).not.toHaveBeenCalled();
  });

  it("refuses a stored document of an unknown version", async () => {
    const deps = fakes(caseStudy({ headRevisionId: HEAD_ID }), [stored(HEAD_ID, { ...v2, schemaVersion: 99 })]);
    expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID })).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_SCHEMA_UNSUPPORTED", details: { revisionId: HEAD_ID, document: "doc" } },
    });
  });

  it.each([makeGetLiveRevision, makeGetEditableRevision])("skips a soft-deleted (or unknown) case: NOT_FOUND", async (make) => {
    // The repository's findById never returns soft-deleted cases.
    const deps = fakes(null, [stored(HEAD_ID, v2)]);
    expect(await make(deps)({ kind: "case", id: CASE_ID })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(deps.revisions.findById).not.toHaveBeenCalled();
  });

  it.each([makeGetLiveRevision, makeGetEditableRevision])("a client_intro subject is SUBJECT_NOT_SUPPORTED", async (make) => {
    const deps = fakes(caseStudy());
    expect(await make(deps)({ kind: "client_intro", id: CASE_ID })).toMatchObject({ ok: false, error: { code: "SUBJECT_NOT_SUPPORTED" } });
    expect(deps.cases.findById).not.toHaveBeenCalled();
  });

  it.each([{ kind: "case", id: "x" }, { kind: "client", id: CASE_ID }, CASE_ID, null])("a malformed subject %j is INVALID_INPUT", async (subject) => {
    expect(await makeGetLiveRevision(fakes(caseStudy()))(subject)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("matches an uppercase subject id", async () => {
    const deps = fakes(caseStudy({ headRevisionId: HEAD_ID }), [stored(HEAD_ID, v2)]);
    expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID.toUpperCase() })).toMatchObject({ ok: true, value: { id: HEAD_ID } });
    expect(deps.cases.findById).toHaveBeenCalledWith(CASE_ID);
  });

  it.each([
    ["the head is missing", makeGetEditableRevision, { headRevisionId: HEAD_ID }, []],
    ["the head is another case's", makeGetEditableRevision, { headRevisionId: HEAD_ID }, [stored(HEAD_ID, caseHistoryV2(FORMAT_IDS), { caseId: "11111111-0000-4000-8000-000000000009" })]],
    ["the approved revision is missing", makeGetLiveRevision, { approvedRevisionId: APPROVED_ID }, []],
    ["the approved revision is another case's", makeGetLiveRevision, { approvedRevisionId: APPROVED_ID }, [stored(APPROVED_ID, caseHistoryV2(FORMAT_IDS), { status: "approved", caseId: "11111111-0000-4000-8000-000000000009" })]],
    ["the approved pointer is at a working revision", makeGetLiveRevision, { approvedRevisionId: APPROVED_ID }, [stored(APPROVED_ID, caseHistoryV2(FORMAT_IDS))]],
    ["the approved pointer is at a superseded revision", makeGetLiveRevision, { approvedRevisionId: APPROVED_ID }, [stored(APPROVED_ID, caseHistoryV2(FORMAT_IDS), { status: "superseded" })]],
  ] as const)("REVISION_POINTER_INVALID when %s, logged with the case id", async (_name, make, pointers, rows) => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const deps = fakes(caseStudy(pointers), [...rows]);
      expect(await make(deps)({ kind: "case", id: CASE_ID })).toMatchObject({ ok: false, error: { code: "REVISION_POINTER_INVALID" } });
      const logged = write.mock.calls.map(([line]) => JSON.parse(String(line)));
      expect(logged).toEqual([expect.objectContaining({ level: "error", caseId: CASE_ID })]);
      expect(Object.keys(logged[0]).sort()).toEqual(["caseId", "level", "msg", "time"]);
      expect(logged[0].msg).toContain(Object.values(pointers)[0]);
    } finally {
      write.mockRestore();
    }
  });

  it("editable may be a working, approved or superseded head", async () => {
    for (const status of ["working", "approved", "superseded"] as const) {
      const deps = fakes(caseStudy({ headRevisionId: HEAD_ID }), [stored(HEAD_ID, v2, { status })]);
      expect(await makeGetEditableRevision(deps)({ kind: "case", id: CASE_ID })).toMatchObject({ ok: true, value: { status } });
    }
  });
});
