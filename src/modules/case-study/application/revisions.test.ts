import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { ClientAsset } from "@/modules/case-study/domain/client-material";
import type { ClientIntro } from "@/modules/case-study/domain/client-intro";
import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import type { Revision } from "@/modules/case-study/domain/revision";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientIntroRepository } from "@/modules/case-study/ports/client-intro-repository";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";
import type { RevisionRepository } from "@/modules/case-study/ports/revision-repository";
import { caseHistoryV0, caseHistoryV1, caseHistoryV2, clientIntroV2, UPGRADE_ID_PREFIX } from "@/modules/generation";
import { FORMAT_IDS, starterPages } from "@/modules/rendering";
import { err, ok } from "@/shared/result";
import {
  makeApprove,
  makeApproveIntro,
  makeCreateWorkingRevision,
  makeDiscardHead,
  makeForkHead,
  makeGetEditableRevision,
  makeGetLiveRevision,
  makeSaveIntroRevisionDoc,
  makeSaveRevisionDoc,
  referencedAssetIds,
  type CaseAssetIds,
} from "./revisions";

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

function fakes(found: CaseStudy | null, rows: Revision[] = [], intro: ClientIntro | null = null) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cases = { findById: vi.fn<CaseStudyRepository["findById"]>(async () => ok(found)) } as unknown as CaseStudyRepository & {
    findById: ReturnType<typeof vi.fn>;
  };
  const revisions = {
    findById: vi.fn<RevisionRepository["findById"]>(async (id) => ok(byId.get(id) ?? null)),
    createWorking: vi.fn<RevisionRepository["createWorking"]>(async (input) =>
      ok(stored(HEAD_ID, input.doc, { manifest: input.manifest, model: input.meta.model, fellBack: input.meta.fellBack, promptVersion: input.meta.promptVersion })),
    ),
    saveDoc: vi.fn<RevisionRepository["saveDoc"]>(async (input) => {
      const row = byId.get(input.revisionId)!;
      return ok({ ...row, doc: input.doc, version: input.expectedVersion + 1 });
    }),
    approve: vi.fn<RevisionRepository["approve"]>(async (input) => ok({ ...byId.get(input.revisionId)!, status: "approved" })),
    updateApproved: vi.fn<RevisionRepository["updateApproved"]>(async (input) => ok({ ...byId.get(input.revisionId)!, status: "approved" })),
    forkHead: vi.fn<RevisionRepository["forkHead"]>(async (input) => ok({ revision: stored(HEAD_ID, caseHistoryV2(FORMAT_IDS)), headVersion: input.expectedHeadVersion + 1 })),
    discardHead: vi.fn<RevisionRepository["discardHead"]>(async () => ok(stored(APPROVED_ID, caseHistoryV2(FORMAT_IDS), { status: "approved" }))),
  };
  const intros = { findById: vi.fn<ClientIntroRepository["findById"]>(async () => ok(intro)) };
  return { cases, revisions, intros };
}

const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const clientIntro = (over: Partial<ClientIntro> = {}): ClientIntro => ({
  id: INTRO_ID,
  clientId: "cccccccc-0000-4000-8000-000000000001",
  status: "in_review",
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 1,
  createdBy: actor.id,
  createdAt: now,
  updatedAt: now,
  ...over,
});

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
  /** What a stored v1 or v0 case history reads as: the template's starter pages, built with no texts, images or results and counter ids. */
  const upgradedV2 = {
    schemaVersion: 2,
    kind: "case_history",
    template: "mac-case@1",
    formats: Object.fromEntries(
      FORMAT_IDS.map((id) => {
        let n = 0;
        const newId = () => `${UPGRADE_ID_PREFIX}${String(++n).padStart(12, "0")}`;
        return [id, { pages: starterPages("mac-case@1", "case_history", id, { newId, texts: {}, images: [], resultRows: 0, hasTestimonial: false }) }];
      }),
    ),
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

  describe("a client_intro subject (Story 3.11)", () => {
    const introDoc = () => clientIntroV2(FORMAT_IDS);
    const introRow = (id: string, over: Partial<Revision> = {}) => stored(id, introDoc(), { caseId: null, clientIntroId: INTRO_ID, ...over });

    it("reads the intro's head, never the cases", async () => {
      const deps = fakes(caseStudy(), [introRow(HEAD_ID)], clientIntro({ headRevisionId: HEAD_ID }));
      expect(await makeGetEditableRevision(deps)({ kind: "client_intro", id: INTRO_ID })).toMatchObject({ ok: true, value: { id: HEAD_ID, doc: introDoc() } });
      expect(deps.intros.findById).toHaveBeenCalledWith(INTRO_ID);
      expect(deps.cases.findById).not.toHaveBeenCalled();
    });

    it("reads the approved one as live, or null when none is approved", async () => {
      const approved = fakes(caseStudy(), [introRow(APPROVED_ID, { status: "approved" })], clientIntro({ approvedRevisionId: APPROVED_ID }));
      expect(await makeGetLiveRevision(approved)({ kind: "client_intro", id: INTRO_ID })).toMatchObject({ ok: true, value: { id: APPROVED_ID } });
      expect(await makeGetLiveRevision(fakes(caseStudy(), [], clientIntro()))({ kind: "client_intro", id: INTRO_ID })).toEqual({ ok: true, value: null });
    });

    it.each([makeGetLiveRevision, makeGetEditableRevision])("an unknown intro is NOT_FOUND", async (make) => {
      expect(await make(fakes(caseStudy()))({ kind: "client_intro", id: INTRO_ID })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });

    it("refuses a head that is a case's revision: REVISION_POINTER_INVALID", async () => {
      const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      try {
        const deps = fakes(caseStudy(), [stored(HEAD_ID, introDoc())], clientIntro({ headRevisionId: HEAD_ID }));
        expect(await makeGetEditableRevision(deps)({ kind: "client_intro", id: INTRO_ID })).toMatchObject({ ok: false, error: { code: "REVISION_POINTER_INVALID" } });
      } finally {
        write.mockRestore();
      }
    });
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

describe("saveRevisionDoc", () => {
  const edited = () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    doc.formats.presentazione_16_9!.pages[0]!.name = "Copertina nuova";
    return doc;
  };
  const input = (over: Record<string, unknown> = {}) => ({ caseId: CASE_ID, revisionId: HEAD_ID, doc: edited(), expectedVersion: 3, ...over });
  const head = () => stored(HEAD_ID, caseHistoryV2(FORMAT_IDS), { version: 3 });

  it("validates the document, then saves it once with the actor and the expected version", async () => {
    const deps = guarded([head()]);
    const result = await makeSaveRevisionDoc(deps)(actor, input());
    expect(deps.revisions.saveDoc).toHaveBeenCalledTimes(1);
    expect(deps.revisions.saveDoc).toHaveBeenCalledWith({ revisionId: HEAD_ID, doc: edited(), expectedVersion: 3, actorId: actor.id });
    expect(result).toMatchObject({ ok: true, value: { version: 4, doc: edited() } });
  });

  it("lowercases the ids it is given", async () => {
    const deps = guarded([head()]);
    const result = await makeSaveRevisionDoc(deps)(actor, input({ caseId: CASE_ID.toUpperCase(), revisionId: HEAD_ID.toUpperCase() }));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["an unknown revision", [] as Revision[]],
    ["another case's revision", [stored(HEAD_ID, caseHistoryV2(FORMAT_IDS), { caseId: "11111111-0000-4000-8000-000000000009" })]],
  ])("refuses %s with NOT_FOUND before any write", async (_name, rows) => {
    const deps = guarded(rows);
    expect(await makeSaveRevisionDoc(deps)(actor, input())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(deps.revisions.saveDoc).not.toHaveBeenCalled();
  });

  it.each([
    ["a client value", () => ({ ...caseHistoryV2(FORMAT_IDS), about: { name: "Acme" } }), "DOCUMENT_INVALID"],
    ["a v1 document", () => caseHistoryV1(), "DOCUMENT_SCHEMA_UNSUPPORTED"],
    ["a missing format", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      delete doc.formats.video_9_16;
      return doc;
    }, "FORMAT_NOT_IN_REVISION"],
  ])("refuses %s before any write", async (_name, doc, code) => {
    const deps = guarded([head()]);
    expect(await makeSaveRevisionDoc(deps)(actor, input({ doc: doc() }))).toMatchObject({ ok: false, error: { code } });
    expect(deps.revisions.saveDoc).not.toHaveBeenCalled();
  });

  it.each([
    ["a negative version", { expectedVersion: -1 }],
    ["a version past the Postgres integer range", { expectedVersion: 2_147_483_648 }],
    ["a malformed revision id", { revisionId: "x" }],
    ["an unknown key", { status: "approved" }],
  ])("refuses %s with INVALID_INPUT", async (_name, over) => {
    const deps = guarded([head()]);
    expect(await makeSaveRevisionDoc(deps)(actor, input(over))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(deps.revisions.saveDoc).not.toHaveBeenCalled();
  });

  const CASE_ASSET = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const CLIENT_ASSET = "aaaaaaaa-0000-4000-8000-0000000000c1";
  const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
  /** `fakes` plus the guardrail's lookups: the case's live files and its client's files. */
  const guarded = (rows: Revision[], live: string[] = [CASE_ASSET], clientFiles: string[] = [CLIENT_ASSET]) => {
    const base = fakes(caseStudy(), rows);
    const caseAssetIds = vi.fn<CaseAssetIds>(async () => ok(live));
    const clients = {
      listAssets: vi.fn<ClientRepository["listAssets"]>(async () => ok(clientFiles.map((id) => ({ id }) as ClientAsset))),
    };
    return { ...base, caseAssetIds, clients };
  };
  const withBackground = (assetId: string) => {
    const doc = edited();
    doc.formats.presentazione_16_9!.pages[0]!.background = { kind: "image", assetId };
    return doc;
  };

  it("saves a text edit without looking any asset up", async () => {
    const deps = guarded([head()]);
    expect((await makeSaveRevisionDoc(deps)(actor, input())).ok).toBe(true);
    expect(deps.caseAssetIds).not.toHaveBeenCalled();
    expect(deps.clients.listAssets).not.toHaveBeenCalled();
    expect(deps.cases.findById).not.toHaveBeenCalled();
  });

  it.each([
    ["a live file of this case", CASE_ASSET.toUpperCase()],
    ["a file of its client", CLIENT_ASSET],
  ])("allows a new reference to %s", async (_name, assetId) => {
    const deps = guarded([head()]);
    expect((await makeSaveRevisionDoc(deps)(actor, input({ doc: withBackground(assetId) }))).ok).toBe(true);
    expect(deps.caseAssetIds).toHaveBeenCalledWith(CASE_ID);
    expect(deps.clients.listAssets).toHaveBeenCalledWith(CLIENT_ID);
    expect(deps.revisions.saveDoc).toHaveBeenCalledTimes(1);
  });

  it("refuses a new reference to another case's, a deleted or an unknown file with ASSET_NOT_ALLOWED before any write", async () => {
    const foreign = "99999999-0000-4000-8000-000000000001";
    const deps = guarded([head()]);
    const result = await makeSaveRevisionDoc(deps)(actor, input({ doc: withBackground(foreign) }));
    expect(result).toMatchObject({ ok: false, error: { code: "ASSET_NOT_ALLOWED", details: { assetIds: [foreign] } } });
    expect(deps.revisions.saveDoc).not.toHaveBeenCalled();
  });

  it("keeps a reference the stored document already has, even once its file is deleted", async () => {
    const deleted = "99999999-0000-4000-8000-000000000003";
    const kept = stored(HEAD_ID, withBackground(deleted), { version: 3 });
    const deps = guarded([kept], []);
    expect((await makeSaveRevisionDoc(deps)(actor, input({ doc: withBackground(deleted) }))).ok).toBe(true);
    expect(deps.caseAssetIds).not.toHaveBeenCalled();
  });

  it("keeps a reference only the generated document has (an undo or Pagine di default bringing it back), even once its file is deleted", async () => {
    const removed = "99999999-0000-4000-8000-000000000002";
    const kept = stored(HEAD_ID, caseHistoryV2(FORMAT_IDS), { version: 3, generatedDoc: withBackground(removed) });
    const deps = guarded([kept], []);
    expect((await makeSaveRevisionDoc(deps)(actor, input({ doc: withBackground(removed) }))).ok).toBe(true);
    expect(deps.caseAssetIds).not.toHaveBeenCalled();
  });

  it("names only the foreign assets when a save adds an allowed and a foreign one", async () => {
    const foreign = "99999999-0000-4000-8000-000000000004";
    const deps = guarded([head()]);
    const doc = withBackground(CASE_ASSET);
    doc.formats.carosello_1_1!.pages[0]!.background = { kind: "image", assetId: foreign };
    expect(await makeSaveRevisionDoc(deps)(actor, input({ doc }))).toMatchObject({ ok: false, error: { code: "ASSET_NOT_ALLOWED", details: { assetIds: [foreign] } } });
  });

  it.each([
    ["the case's files", (deps: ReturnType<typeof guarded>) => deps.caseAssetIds.mockResolvedValueOnce(err({ code: "ASSET_LOOKUP_FAILED", message: "down" })), "ASSET_LOOKUP_FAILED"],
    ["the client's files", (deps: ReturnType<typeof guarded>) => deps.clients.listAssets.mockResolvedValueOnce(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" })), "CLIENT_LOOKUP_FAILED"],
    ["the case", (deps: ReturnType<typeof guarded>) => deps.cases.findById.mockResolvedValueOnce(ok(null)), "NOT_FOUND"],
  ])("passes a failed lookup of %s through, writing nothing", async (_name, fail, code) => {
    const deps = guarded([head()]);
    fail(deps);
    expect(await makeSaveRevisionDoc(deps)(actor, input({ doc: withBackground(CASE_ASSET) }))).toMatchObject({ ok: false, error: { code } });
    expect(deps.revisions.saveDoc).not.toHaveBeenCalled();
  });

  it("allows removing assets", async () => {
    const deps = guarded([head()]);
    const doc = edited();
    for (const format of Object.values(doc.formats)) for (const page of format.pages) page.blocks = [];
    expect((await makeSaveRevisionDoc(deps)(actor, input({ doc }))).ok).toBe(true);
  });

  it("passes a refusal from the repository through", async () => {
    const deps = guarded([head()]);
    deps.revisions.saveDoc.mockResolvedValueOnce(err({ code: "STALE_REVISION", message: "m" }));
    expect(await makeSaveRevisionDoc(deps)(actor, input())).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
  });
});

describe("referencedAssetIds", () => {
  it("finds media, backgrounds, animations and asset source refs, lowercased", () => {
    const ids = referencedAssetIds({
      a: { kind: "image", assetId: "AAAA" },
      b: [{ type: "animation", assetIds: ["bbbb", "cccc"] }],
      c: { sourceRefs: [{ kind: "asset", id: "dddd" }, { kind: "form_field", id: "results" }] },
      d: { assetId: null },
    });
    expect([...ids].sort()).toEqual(["aaaa", "bbbb", "cccc", "dddd"]);
  });
});

describe("approve (Story 4.8)", () => {
  const doc = () => caseHistoryV2(FORMAT_IDS);
  const refs = () => [...referencedAssetIds(doc())];
  const clear = () => Object.fromEntries(Object.keys(doc().formats).map((id) => [id, false]));
  const input = (over: Record<string, unknown> = {}) => ({
    caseId: CASE_ID,
    revisionId: HEAD_ID,
    expectedRevisionVersion: 3,
    expectedHeadVersion: 2,
    overflow: clear(),
    ...over,
  });
  const head = () => stored(HEAD_ID, doc(), { version: 3 });
  const deps = (rows: Revision[] = [head()], live: string[] = refs(), clientFiles: string[] = []) => ({
    ...fakes(caseStudy(), rows),
    caseAssetIds: vi.fn<CaseAssetIds>(async () => ok(live)),
    clients: { listAssets: vi.fn<ClientRepository["listAssets"]>(async () => ok(clientFiles.map((id) => ({ id }) as ClientAsset))) },
  });

  it("approves once, with the actor and both expected versions, when every format is clear and the material is all there", async () => {
    const d = deps();
    const result = await makeApprove(d)(actor, input());
    expect(result).toMatchObject({ ok: true, value: { id: HEAD_ID, status: "approved" } });
    expect(d.revisions.approve).toHaveBeenCalledWith({ caseId: CASE_ID, revisionId: HEAD_ID, expectedRevisionVersion: 3, expectedHeadVersion: 2, actorId: actor.id });
  });

  it("counts the client's files as present", async () => {
    const [first, ...rest] = refs();
    const d = deps([head()], rest, [first!]);
    expect((await makeApprove(d)(actor, input())).ok).toBe(true);
  });

  it.each([
    ["a format overflowing", (o: Record<string, boolean>) => ({ ...o, carosello_1_1: true })],
    ["a format not measured", (o: Record<string, boolean>) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== "video_9_16"))],
  ])("refuses %s with OVERFLOW_NOT_CLEARED, writing nothing", async (_name, change) => {
    const d = deps();
    const result = await makeApprove(d)(actor, input({ overflow: change(clear()) }));
    expect(result).toMatchObject({ ok: false, error: { code: "OVERFLOW_NOT_CLEARED" } });
    expect(d.revisions.approve).not.toHaveBeenCalled();
  });

  it("refuses a deleted referenced file with MATERIAL_MISSING, naming it, writing nothing", async () => {
    const [gone, ...live] = refs();
    const d = deps([head()], live);
    const result = await makeApprove(d)(actor, input());
    expect(result).toMatchObject({ ok: false, error: { code: "MATERIAL_MISSING", details: { assetIds: [gone] } } });
    expect(d.revisions.approve).not.toHaveBeenCalled();
  });

  it("refuses a revision newer than the one measured with STALE_REVISION, before any check", async () => {
    const d = deps([stored(HEAD_ID, doc(), { version: 4 })]);
    const result = await makeApprove(d)(actor, input({ overflow: {} }));
    expect(result).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
    expect(d.caseAssetIds).not.toHaveBeenCalled();
    expect(d.revisions.approve).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown revision", [] as Revision[]],
    ["another case's revision", [stored(HEAD_ID, caseHistoryV2(FORMAT_IDS), { caseId: "11111111-0000-4000-8000-000000000009" })]],
  ])("refuses %s with NOT_FOUND", async (_name, rows) => {
    const d = deps(rows);
    expect(await makeApprove(d)(actor, input())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(d.revisions.approve).not.toHaveBeenCalled();
  });

  it("passes the database's refusal through", async () => {
    const d = deps();
    d.revisions.approve.mockResolvedValue(err({ code: "STALE_HEAD", message: "m" }));
    expect(await makeApprove(d)(actor, input())).toMatchObject({ ok: false, error: { code: "STALE_HEAD" } });
  });

  it("refuses bad input", async () => {
    const d = deps();
    expect(await makeApprove(d)(actor, input({ overflow: "none" }))).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });
});

describe("editing an approved case (Story 4.9)", () => {
  const FORK_ID = "22222222-0000-4000-8000-000000000003";
  const approvedDoc = () => caseHistoryV2(FORMAT_IDS);
  const editedDoc = () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    doc.formats.presentazione_16_9!.pages[0]!.name = "Copertina corretta";
    return doc;
  };
  const clear = () => Object.fromEntries(FORMAT_IDS.map((id) => [id, false]));

  /**
   * An in-memory database with the migration's rules: an approved case whose head is its
   * approved revision; fork, save, update and discard as `fork_head`, `save_revision_doc`,
   * `update_approved_revision` and `discard_head` behave.
   */
  function world() {
    const rows = new Map<string, Revision>([[APPROVED_ID, stored(APPROVED_ID, approvedDoc(), { status: "approved", version: 2 })]]);
    let current = caseStudy({ status: "approved", headRevisionId: APPROVED_ID, approvedRevisionId: APPROVED_ID, headVersion: 1 });
    const stale = (code: Uppercase<string>) => err({ code, message: code });
    const cases = { findById: vi.fn(async () => ok(current)) } as unknown as CaseStudyRepository;
    const revisions: RevisionRepository = {
      findById: async (id) => ok(rows.get(id) ?? null),
      createWorking: async () => stale("NOT_USED"),
      approve: async () => stale("CASE_NOT_APPROVABLE"),
      forkHead: vi.fn<RevisionRepository["forkHead"]>(async ({ expectedHeadVersion, actorId }) => {
        if (current.status !== "approved") return stale("CASE_NOT_EDITABLE");
        if (current.headRevisionId !== current.approvedRevisionId) return ok({ revision: rows.get(current.headRevisionId!)!, headVersion: current.headVersion });
        if (current.headVersion !== expectedHeadVersion) return stale("STALE_HEAD");
        const from = rows.get(current.approvedRevisionId!)!;
        const copy = { ...from, id: FORK_ID, status: "working" as const, version: 0, createdBy: actorId };
        rows.set(FORK_ID, copy);
        current = { ...current, headRevisionId: FORK_ID, headVersion: current.headVersion + 1 };
        return ok({ revision: copy, headVersion: current.headVersion });
      }),
      saveDoc: async ({ revisionId, doc, expectedVersion }) => {
        const row = rows.get(revisionId)!;
        if (current.headRevisionId !== revisionId) return stale("STALE_HEAD");
        if (row.status !== "working") return stale("REVISION_NOT_WRITABLE");
        if (row.version !== expectedVersion) return stale("STALE_REVISION");
        const saved = { ...row, doc, version: row.version + 1 };
        rows.set(revisionId, saved);
        return ok(saved);
      },
      updateApproved: vi.fn<RevisionRepository["updateApproved"]>(async ({ revisionId, expectedRevisionVersion, expectedHeadVersion }) => {
        const row = rows.get(revisionId)!;
        if (current.headRevisionId !== revisionId || current.headVersion !== expectedHeadVersion) return stale("STALE_HEAD");
        if (row.status !== "working") return stale("REVISION_NOT_WRITABLE");
        if (row.version !== expectedRevisionVersion) return stale("STALE_REVISION");
        rows.set(current.approvedRevisionId!, { ...rows.get(current.approvedRevisionId!)!, status: "superseded" });
        const approved = { ...row, status: "approved" as const };
        rows.set(revisionId, approved);
        current = { ...current, approvedRevisionId: revisionId };
        return ok(approved);
      }),
      discardHead: vi.fn<RevisionRepository["discardHead"]>(async ({ revisionId, expectedHeadVersion }) => {
        if (current.headRevisionId !== revisionId || current.headVersion !== expectedHeadVersion) return stale("STALE_HEAD");
        if (revisionId === current.approvedRevisionId) return stale("REVISION_NOT_WRITABLE");
        rows.set(revisionId, { ...rows.get(revisionId)!, status: "superseded" });
        current = { ...current, headRevisionId: current.approvedRevisionId, headVersion: current.headVersion + 1 };
        return ok(rows.get(current.approvedRevisionId!)!);
      }),
    };
    const refs = [...referencedAssetIds(approvedDoc())];
    const deps = {
      cases,
      revisions,
      caseAssetIds: vi.fn<CaseAssetIds>(async () => ok(refs)),
      clients: { listAssets: vi.fn<ClientRepository["listAssets"]>(async () => ok([])) },
      intros: { findById: vi.fn<ClientIntroRepository["findById"]>(async () => ok(null)) },
    };
    return { deps, rows, now: () => current };
  }

  const live = async (w: ReturnType<typeof world>) => {
    const read = await makeGetLiveRevision(w.deps)({ kind: "case", id: CASE_ID });
    return read.ok ? read.value : null;
  };

  it("forkHead creates one working copy of the approved revision, and is idempotent", async () => {
    const w = world();
    const first = await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 1 });
    expect(first).toEqual({ ok: true, value: { revisionId: FORK_ID, version: 0, headVersion: 2 } });
    expect(w.rows.get(FORK_ID)).toMatchObject({ status: "working", doc: approvedDoc(), generatedDoc: approvedDoc() });
    // Called again (a retry, another tab with the old head version): the same copy, nothing new.
    const again = await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 1 });
    expect(again).toEqual(first);
    expect(w.rows.size).toBe(2);
    expect(w.deps.revisions.forkHead).toHaveBeenCalledWith({ caseId: CASE_ID, expectedHeadVersion: 1, actorId: actor.id });
  });

  it("forkHead refuses bad input before the repository, and passes STALE_HEAD through", async () => {
    const w = world();
    expect(await makeForkHead(w.deps)(actor, { caseId: "nope", expectedHeadVersion: 1 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(w.deps.revisions.forkHead).not.toHaveBeenCalled();
    expect(await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 0 })).toMatchObject({ ok: false, error: { code: "STALE_HEAD" } });
  });

  it("the live read returns the approved revision while the copy is edited, and the copy once updated; the old one is superseded", async () => {
    const w = world();
    await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 1 });
    const saved = await makeSaveRevisionDoc(w.deps)(actor, { caseId: CASE_ID, revisionId: FORK_ID, doc: editedDoc(), expectedVersion: 0 });
    expect(saved).toMatchObject({ ok: true, value: { id: FORK_ID, version: 1 } });
    expect(await live(w)).toMatchObject({ id: APPROVED_ID, doc: approvedDoc() });
    const editable = await makeGetEditableRevision(w.deps)({ kind: "case", id: CASE_ID });
    expect(editable).toMatchObject({ ok: true, value: { id: FORK_ID, doc: editedDoc() } });

    const updated = await makeApprove(w.deps)(actor, { caseId: CASE_ID, revisionId: FORK_ID, expectedRevisionVersion: 1, expectedHeadVersion: 2, overflow: clear() });
    expect(updated).toMatchObject({ ok: true, value: { id: FORK_ID, status: "approved" } });
    expect(w.deps.revisions.updateApproved).toHaveBeenCalledTimes(1);
    expect(await live(w)).toMatchObject({ id: FORK_ID, doc: editedDoc() });
    expect(w.rows.get(APPROVED_ID)?.status).toBe("superseded");
    expect(w.now()).toMatchObject({ status: "approved", approvedRevisionId: FORK_ID, headRevisionId: FORK_ID });
  });

  it.each([
    ["an overflowing format", { overflow: { ...clear(), carosello_1_1: true } }, "OVERFLOW_NOT_CLEARED"],
    ["a version newer than the one measured", { expectedRevisionVersion: 0 }, "STALE_REVISION"],
    ["a head version that moved", { expectedHeadVersion: 1 }, "STALE_HEAD"],
  ] as const)("update refuses %s and nothing changes", async (_name, over, code) => {
    const w = world();
    await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 1 });
    await makeSaveRevisionDoc(w.deps)(actor, { caseId: CASE_ID, revisionId: FORK_ID, doc: editedDoc(), expectedVersion: 0 });
    const input = { caseId: CASE_ID, revisionId: FORK_ID, expectedRevisionVersion: 1, expectedHeadVersion: 2, overflow: clear(), ...over };
    expect(await makeApprove(w.deps)(actor, input)).toMatchObject({ ok: false, error: { code } });
    expect(await live(w)).toMatchObject({ id: APPROVED_ID, doc: approvedDoc() });
    expect(w.now()).toMatchObject({ status: "approved", approvedRevisionId: APPROVED_ID });
  });

  it("update refuses a deleted referenced file with MATERIAL_MISSING, writing nothing", async () => {
    const w = world();
    await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 1 });
    w.deps.caseAssetIds.mockResolvedValue(ok([]));
    const input = { caseId: CASE_ID, revisionId: FORK_ID, expectedRevisionVersion: 0, expectedHeadVersion: 2, overflow: clear() };
    expect(await makeApprove(w.deps)(actor, input)).toMatchObject({ ok: false, error: { code: "MATERIAL_MISSING" } });
    expect(w.deps.revisions.updateApproved).not.toHaveBeenCalled();
  });

  it("discardHead supersedes the copy and returns the approved revision as the head; a second discard is stale", async () => {
    const w = world();
    await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 1 });
    await makeSaveRevisionDoc(w.deps)(actor, { caseId: CASE_ID, revisionId: FORK_ID, doc: editedDoc(), expectedVersion: 0 });
    const discarded = await makeDiscardHead(w.deps)(actor, { caseId: CASE_ID, revisionId: FORK_ID, expectedHeadVersion: 2 });
    expect(discarded).toMatchObject({ ok: true, value: { id: APPROVED_ID, status: "approved", doc: approvedDoc() } });
    expect(w.rows.get(FORK_ID)?.status).toBe("superseded");
    expect(w.now()).toMatchObject({ status: "approved", headRevisionId: APPROVED_ID, approvedRevisionId: APPROVED_ID, headVersion: 3 });
    expect(await live(w)).toMatchObject({ id: APPROVED_ID });
    expect(await makeDiscardHead(w.deps)(actor, { caseId: CASE_ID, revisionId: FORK_ID, expectedHeadVersion: 2 })).toMatchObject({ ok: false, error: { code: "STALE_HEAD" } });
    // The next edit forks again, from the approved revision.
    expect(await makeForkHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 3 })).toMatchObject({ ok: true, value: { headVersion: 4 } });
  });

  it("discardHead refuses bad input before the repository", async () => {
    const w = world();
    expect(await makeDiscardHead(w.deps)(actor, { caseId: CASE_ID, expectedHeadVersion: 2 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(w.deps.revisions.discardHead).not.toHaveBeenCalled();
  });

  it("approve on an in_review case still goes through approve, never updateApproved", async () => {
    const d = { ...fakes(caseStudy(), [stored(HEAD_ID, approvedDoc(), { version: 3 })]) };
    const deps = {
      ...d,
      caseAssetIds: vi.fn<CaseAssetIds>(async () => ok([...referencedAssetIds(approvedDoc())])),
      clients: { listAssets: vi.fn<ClientRepository["listAssets"]>(async () => ok([])) },
    };
    const input = { caseId: CASE_ID, revisionId: HEAD_ID, expectedRevisionVersion: 3, expectedHeadVersion: 2, overflow: clear() };
    expect((await makeApprove(deps)(actor, input)).ok).toBe(true);
    expect(deps.revisions.approve).toHaveBeenCalledTimes(1);
    expect(deps.revisions.updateApproved).not.toHaveBeenCalled();
  });
});

describe("client intro save and approve (Story 4.11a)", () => {
  const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
  const CASE_A = "11111111-0000-4000-8000-0000000000a1";
  const CASE_B = "11111111-0000-4000-8000-0000000000b1";
  const CLIENT_FILE = "aaaaaaaa-0000-4000-8000-0000000000c1";
  const CASE_FILE = "aaaaaaaa-0000-4000-8000-0000000000a9";
  const doc = () => clientIntroV2(FORMAT_IDS);
  const refs = () => [...referencedAssetIds(doc())];
  const clear = () => Object.fromEntries(Object.keys(doc().formats).map((id) => [id, false]));
  const head = (over: Partial<Revision> = {}) => stored(HEAD_ID, doc(), { caseId: null, clientIntroId: INTRO_ID, version: 3, ...over });

  /** The intro, its revisions, the client's files and each case's live files. */
  function introDeps(rows: Revision[] = [head()], clientFiles: string[] = [...refs(), CLIENT_FILE], live: Record<string, string[]> = { [CASE_A]: [CASE_FILE], [CASE_B]: [] }) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      revisions: { findById: vi.fn<RevisionRepository["findById"]>(async (id) => ok(byId.get(id) ?? null)) },
      intros: {
        findById: vi.fn<ClientIntroRepository["findById"]>(async () => ok(clientIntro({ clientId: CLIENT_ID, headRevisionId: HEAD_ID }))),
        saveDoc: vi.fn<ClientIntroRepository["saveDoc"]>(async (input) => ok({ ...byId.get(input.revisionId)!, doc: input.doc, version: input.expectedVersion + 1 })),
        approve: vi.fn<ClientIntroRepository["approve"]>(async (input) => ok({ ...byId.get(input.revisionId)!, status: "approved" })),
      },
      cases: { list: vi.fn<CaseStudyRepository["list"]>(async () => ok(Object.keys(live).map((id) => ({ id }) as never))) },
      clients: { listAssets: vi.fn<ClientRepository["listAssets"]>(async () => ok(clientFiles.map((id) => ({ id }) as ClientAsset))) },
      caseAssetIds: vi.fn<CaseAssetIds>(async (caseId) => ok(live[caseId] ?? [])),
    };
  }

  describe("saveIntroRevisionDoc", () => {
    const withMedia = (assetId: string) => {
      const edited = doc();
      edited.formats.presentazione_16_9!.pages[0]!.background = { kind: "image", assetId };
      return edited;
    };
    const input = (over: Record<string, unknown> = {}) => ({ clientIntroId: INTRO_ID, revisionId: HEAD_ID, doc: doc(), expectedVersion: 3, ...over });

    it("saves the intro's head through the intro repository, once, with the expected version", async () => {
      const d = introDeps();
      const result = await makeSaveIntroRevisionDoc(d)(actor, input());
      expect(result).toMatchObject({ ok: true, value: { version: 4 } });
      expect(d.intros.saveDoc).toHaveBeenCalledWith({ revisionId: HEAD_ID, doc: doc(), expectedVersion: 3, actorId: actor.id });
    });

    it.each([
      ["a client file", CLIENT_FILE],
      ["a live file of one of the client's cases", CASE_FILE],
    ])("lets a page newly place %s", async (_name, assetId) => {
      const d = introDeps();
      expect((await makeSaveIntroRevisionDoc(d)(actor, input({ doc: withMedia(assetId) }))).ok).toBe(true);
      expect(d.cases.list).toHaveBeenCalledWith({ clientId: CLIENT_ID });
    });

    it("refuses a file that is neither the client's nor its cases' with ASSET_NOT_ALLOWED", async () => {
      const d = introDeps();
      const foreign = "aaaaaaaa-0000-4000-8000-0000000000f1";
      expect(await makeSaveIntroRevisionDoc(d)(actor, input({ doc: withMedia(foreign) }))).toMatchObject({
        ok: false,
        error: { code: "ASSET_NOT_ALLOWED", details: { assetIds: [foreign] } },
      });
      expect(d.intros.saveDoc).not.toHaveBeenCalled();
    });

    it.each([
      ["an unknown revision", [] as Revision[]],
      ["a case's revision", [stored(HEAD_ID, doc(), { version: 3 })]],
      ["another intro's revision", [head({ clientIntroId: "44444444-0000-4000-8000-000000000009" })]],
    ])("refuses %s with NOT_FOUND", async (_name, rows) => {
      const d = introDeps(rows);
      expect(await makeSaveIntroRevisionDoc(d)(actor, input())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
      expect(d.intros.saveDoc).not.toHaveBeenCalled();
    });

    it("refuses a case document with DOCUMENT_INVALID", async () => {
      const d = introDeps();
      expect(await makeSaveIntroRevisionDoc(d)(actor, input({ doc: caseHistoryV2(FORMAT_IDS) }))).toMatchObject({ ok: false, error: { code: "DOCUMENT_INVALID" } });
      expect(d.intros.saveDoc).not.toHaveBeenCalled();
    });

    it("passes the database's refusal through", async () => {
      const d = introDeps();
      d.intros.saveDoc.mockResolvedValue(err({ code: "STALE_REVISION", message: "m" }));
      expect(await makeSaveIntroRevisionDoc(d)(actor, input())).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
    });
  });

  describe("approveIntro", () => {
    const input = (over: Record<string, unknown> = {}) => ({
      clientIntroId: INTRO_ID,
      revisionId: HEAD_ID,
      expectedRevisionVersion: 3,
      expectedHeadVersion: 2,
      overflow: clear(),
      ...over,
    });

    it("approves once through the intro repository when every format is clear and the material is there", async () => {
      const d = introDeps();
      expect(await makeApproveIntro(d)(actor, input())).toMatchObject({ ok: true, value: { status: "approved" } });
      expect(d.intros.approve).toHaveBeenCalledWith({ clientIntroId: INTRO_ID, revisionId: HEAD_ID, expectedRevisionVersion: 3, expectedHeadVersion: 2, actorId: actor.id });
    });

    it("counts the live files of the client's cases as present", async () => {
      const [first, ...rest] = refs();
      const d = introDeps([head()], rest, { [CASE_A]: [first!] });
      expect((await makeApproveIntro(d)(actor, input())).ok).toBe(true);
    });

    it("refuses a placed case image since deleted with MATERIAL_MISSING, writing nothing", async () => {
      const [gone, ...rest] = refs();
      const d = introDeps([head()], rest, { [CASE_A]: [] });
      expect(await makeApproveIntro(d)(actor, input())).toMatchObject({ ok: false, error: { code: "MATERIAL_MISSING", details: { assetIds: [gone] } } });
      expect(d.intros.approve).not.toHaveBeenCalled();
    });

    it("refuses an overflowing format with OVERFLOW_NOT_CLEARED, writing nothing", async () => {
      const d = introDeps();
      expect(await makeApproveIntro(d)(actor, input({ overflow: { ...clear(), carosello_1_1: true } }))).toMatchObject({ ok: false, error: { code: "OVERFLOW_NOT_CLEARED" } });
      expect(d.intros.approve).not.toHaveBeenCalled();
    });

    it("refuses a revision newer than the one measured with STALE_REVISION", async () => {
      const d = introDeps([head({ version: 4 })]);
      expect(await makeApproveIntro(d)(actor, input())).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
      expect(d.intros.approve).not.toHaveBeenCalled();
    });

    it("refuses a case's revision with NOT_FOUND", async () => {
      const d = introDeps([stored(HEAD_ID, doc(), { version: 3 })]);
      expect(await makeApproveIntro(d)(actor, input())).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });

    it("passes the database's refusal through", async () => {
      const d = introDeps();
      d.intros.approve.mockResolvedValue(err({ code: "CASE_NOT_APPROVABLE", message: "m" }));
      expect(await makeApproveIntro(d)(actor, input())).toMatchObject({ ok: false, error: { code: "CASE_NOT_APPROVABLE" } });
    });
  });
});
