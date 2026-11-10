import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const {
  getActor,
  saveIntroUseCase,
  approveIntroUseCase,
  forkIntroUseCase,
  discardIntroUseCase,
  getClientIntroById,
  listClientMaterial,
  listCases,
  liveAssetIds,
  listAssets,
  getRendition,
  getClientRendition,
  getClient,
  listClientSectors,
  casePartOf,
  introPartOf,
} = vi.hoisted(() => ({
    getActor: vi.fn(),
    saveIntroUseCase: vi.fn(),
    approveIntroUseCase: vi.fn(),
    forkIntroUseCase: vi.fn(),
    discardIntroUseCase: vi.fn(),
    getClientIntroById: vi.fn(),
    listClientMaterial: vi.fn(),
    listCases: vi.fn(),
    liveAssetIds: vi.fn(),
    listAssets: vi.fn(),
    getRendition: vi.fn(),
    getClientRendition: vi.fn(),
    getClient: vi.fn(),
    listClientSectors: vi.fn(),
    casePartOf: vi.fn(),
    introPartOf: vi.fn(),
  }));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({
  saveIntroRevisionDoc: saveIntroUseCase,
  approveIntro: approveIntroUseCase,
  forkIntroHead: forkIntroUseCase,
  discardIntroHead: discardIntroUseCase,
  getClientIntroById,
  listClientMaterial,
  list: listCases,
  getClient,
  listClientSectors,
}));
vi.mock("./file-parts", () => ({ casePartOf, introPartOf }));
vi.mock("@/modules/material", () => ({ liveAssetIds, listAssets, getRendition, getClientRendition }));

const {
  approveIntro,
  discardIntroChanges,
  forkIntroHead,
  getClientFileRenderAssets,
  getIntroRenderAssets,
  reloadFilePart,
  saveIntroRevisionDoc,
  updateApprovedIntroVersion,
} = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({ id: "00000000-0000-4000-8000-000000000002", email: "a@b.it", displayName: "A", role });
const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const input = { clientIntroId: INTRO_ID, revisionId: "bbbbbbbb-0000-4000-8000-000000000001", doc: {}, expectedVersion: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(ok(actor("owner_designer")));
  getClientIntroById.mockResolvedValue(ok({ id: INTRO_ID, clientId: CLIENT_ID, status: "in_review" }));
});

describe("saveIntroRevisionDoc (Story 4.11a)", () => {
  it("saves the intro with the actor and the cases' live files, and returns only the new version", async () => {
    saveIntroUseCase.mockResolvedValue(ok({ id: input.revisionId, version: 3, doc: { big: true } }));
    expect(await saveIntroRevisionDoc(input)).toEqual({ ok: true, value: { version: 3 } });
    expect(saveIntroUseCase).toHaveBeenCalledWith(actor("owner_designer"), input, liveAssetIds);
  });

  it("refuses account/sales/social with 403 before any save", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await saveIntroRevisionDoc(input)).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(saveIntroUseCase).not.toHaveBeenCalled();
  });

  it.each([
    ["STALE_REVISION", 409],
    ["CASE_NOT_EDITABLE", 409],
    ["ASSET_NOT_ALLOWED", 400],
    ["NOT_FOUND", 404],
  ] as const)("maps %s to %i", async (code, status) => {
    saveIntroUseCase.mockResolvedValue(err({ code, message: "m" }));
    expect(await saveIntroRevisionDoc(input)).toEqual({ ok: false, status, error: { code, message: "m" } });
  });
});

describe("approveIntro (Story 4.11a)", () => {
  const approval = { clientIntroId: INTRO_ID, revisionId: input.revisionId, expectedRevisionVersion: 3, expectedHeadVersion: 1, overflow: {} };

  it("approves with the actor and the cases' live files; the configurator then goes back to the client page", async () => {
    approveIntroUseCase.mockResolvedValue(ok({ id: input.revisionId, status: "approved" }));
    expect(await approveIntro(approval)).toEqual({ ok: true, value: { waiting: false } });
    expect(approveIntroUseCase).toHaveBeenCalledWith(actor("owner_designer"), approval, liveAssetIds);
  });

  it("refuses a role that may not approve", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await approveIntro(approval)).toMatchObject({ ok: false, status: 403 });
    expect(approveIntroUseCase).not.toHaveBeenCalled();
  });

  it("passes MATERIAL_MISSING's files on", async () => {
    approveIntroUseCase.mockResolvedValue(err({ code: "MATERIAL_MISSING", message: "m", details: { assetIds: ["x"] } }));
    expect(await approveIntro(approval)).toMatchObject({ ok: false, status: 400, error: { code: "MATERIAL_MISSING", assetIds: ["x"] } });
  });

  it("refuses an approved intro (its copy goes through Aggiorna), writing nothing", async () => {
    getClientIntroById.mockResolvedValue(ok({ id: INTRO_ID, clientId: CLIENT_ID, status: "approved" }));
    expect(await approveIntro(approval)).toMatchObject({ ok: false, status: 409, error: { code: "CASE_NOT_APPROVABLE" } });
    expect(approveIntroUseCase).not.toHaveBeenCalled();
  });

  it("refuses an unknown intro with 404", async () => {
    getClientIntroById.mockResolvedValue(err({ code: "NOT_FOUND", message: "m" }));
    expect(await approveIntro(approval)).toMatchObject({ ok: false, status: 404 });
    expect(approveIntroUseCase).not.toHaveBeenCalled();
  });
});

describe("editing an approved intro (Story 4.11b)", () => {
  const COPY_ID = "bbbbbbbb-0000-4000-8000-000000000002";
  const update = { clientIntroId: INTRO_ID, revisionId: COPY_ID, expectedRevisionVersion: 2, expectedHeadVersion: 2, overflow: {} };
  const discard = { clientIntroId: INTRO_ID, revisionId: COPY_ID, expectedHeadVersion: 2 };

  beforeEach(() => {
    getClientIntroById.mockResolvedValue(ok({ id: INTRO_ID, clientId: CLIENT_ID, status: "approved" }));
  });

  it("forkIntroHead forks with the actor and returns the copy", async () => {
    forkIntroUseCase.mockResolvedValue(ok({ revisionId: COPY_ID, version: 0, headVersion: 2 }));
    const fork = { clientIntroId: INTRO_ID, expectedHeadVersion: 1 };
    expect(await forkIntroHead(fork)).toEqual({ ok: true, value: { revisionId: COPY_ID, version: 0, headVersion: 2 } });
    expect(forkIntroUseCase).toHaveBeenCalledWith(actor("owner_designer"), fork);
  });

  it("forkIntroHead maps STALE_HEAD to 409", async () => {
    forkIntroUseCase.mockResolvedValue(err({ code: "STALE_HEAD", message: "m" }));
    expect(await forkIntroHead({ clientIntroId: INTRO_ID, expectedHeadVersion: 1 })).toMatchObject({ ok: false, status: 409, error: { code: "STALE_HEAD" } });
  });

  it("updateApprovedIntroVersion runs the approval use case on the copy with the cases' live files", async () => {
    approveIntroUseCase.mockResolvedValue(ok({ id: COPY_ID, status: "approved" }));
    expect(await updateApprovedIntroVersion(update)).toEqual({ ok: true, value: undefined });
    expect(approveIntroUseCase).toHaveBeenCalledWith(actor("owner_designer"), update, liveAssetIds);
  });

  it("updateApprovedIntroVersion refuses an intro Da approvare, writing nothing", async () => {
    getClientIntroById.mockResolvedValue(ok({ id: INTRO_ID, clientId: CLIENT_ID, status: "in_review" }));
    expect(await updateApprovedIntroVersion(update)).toMatchObject({ ok: false, status: 409, error: { code: "CASE_NOT_APPROVABLE" } });
    expect(approveIntroUseCase).not.toHaveBeenCalled();
  });

  it.each([
    ["OVERFLOW_NOT_CLEARED", 400],
    ["MATERIAL_MISSING", 400],
    ["STALE_REVISION", 409],
    ["STALE_HEAD", 409],
  ] as const)("updateApprovedIntroVersion maps %s to %i", async (code, status) => {
    approveIntroUseCase.mockResolvedValue(err({ code, message: "m" }));
    expect(await updateApprovedIntroVersion(update)).toMatchObject({ ok: false, status, error: { code } });
  });

  it("discardIntroChanges discards with the actor", async () => {
    discardIntroUseCase.mockResolvedValue(ok({ id: "bbbbbbbb-0000-4000-8000-000000000001", status: "approved" }));
    expect(await discardIntroChanges(discard)).toEqual({ ok: true, value: undefined });
    expect(discardIntroUseCase).toHaveBeenCalledWith(actor("owner_designer"), discard);
  });

  it.each([
    ["forkIntroHead", () => forkIntroHead({ clientIntroId: INTRO_ID, expectedHeadVersion: 1 }), forkIntroUseCase],
    ["updateApprovedIntroVersion", () => updateApprovedIntroVersion(update), approveIntroUseCase],
    ["discardIntroChanges", () => discardIntroChanges(discard), discardIntroUseCase],
  ] as const)("%s refuses account/sales/social with 403 before any write", async (_name, call, useCase) => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await call()).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(useCase).not.toHaveBeenCalled();
  });
});

describe("getIntroRenderAssets (Story 4.11a)", () => {
  const CLIENT_IMAGE = "cccccccc-0000-4000-8000-0000000000c1";
  const CASE_IMAGE = "cccccccc-0000-4000-8000-0000000000a1";
  const OTHER = "cccccccc-0000-4000-8000-0000000000f1";

  beforeEach(() => {
    getClientIntroById.mockResolvedValue(ok({ id: INTRO_ID, clientId: CLIENT_ID }));
    listClientMaterial.mockResolvedValue(ok([{ id: CLIENT_IMAGE, kind: "image", clientId: CLIENT_ID }]));
    listCases.mockResolvedValue(ok([{ id: "aaaaaaaa-0000-4000-8000-000000000001" }]));
    listAssets.mockResolvedValue(ok([{ id: CASE_IMAGE, kind: "image", originalFileName: "a.jpg" }]));
    getClientRendition.mockResolvedValue(ok({ url: "https://client/display" }));
    getRendition.mockResolvedValue(ok({ url: "https://case/display" }));
  });

  it("reads the client's files from the client renditions and its cases' from the case renditions, leaving any other id out", async () => {
    const result = await getIntroRenderAssets({ clientIntroId: INTRO_ID, assetIds: [CLIENT_IMAGE, CASE_IMAGE, OTHER] });
    expect(result).toEqual({
      ok: true,
      value: { [CLIENT_IMAGE]: { url: "https://client/display", kind: "image" }, [CASE_IMAGE]: { url: "https://case/display", kind: "image" } },
    });
    expect(listCases).toHaveBeenCalledWith({ clientId: CLIENT_ID });
  });

  it("refuses a malformed list", async () => {
    expect(await getIntroRenderAssets({ clientIntroId: INTRO_ID, assetIds: "x" })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses an unknown intro", async () => {
    getClientIntroById.mockResolvedValue(err({ code: "NOT_FOUND", message: "m" }));
    expect(await getIntroRenderAssets({ clientIntroId: INTRO_ID, assetIds: [] })).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses a role that may not edit", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await getIntroRenderAssets({ clientIntroId: INTRO_ID, assetIds: [] })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("the client's file (Story 4.12a)", () => {
  const CLIENT_IMAGE = "cccccccc-0000-4000-8000-0000000000c1";
  const CASE_IMAGE = "cccccccc-0000-4000-8000-0000000000a1";
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const client = { id: CLIENT_ID, name: "Lumen Srl", code: "LUM", industry: "illuminazione" };

  beforeEach(() => {
    getClient.mockResolvedValue(ok(client));
    listClientSectors.mockResolvedValue(ok([{ key: "illuminazione", label: "Illuminazione" }]));
    listClientMaterial.mockResolvedValue(ok([{ id: CLIENT_IMAGE, kind: "image", clientId: CLIENT_ID }]));
    listCases.mockResolvedValue(ok([{ id: CASE_ID }]));
    listAssets.mockResolvedValue(ok([{ id: CASE_IMAGE, kind: "image", originalFileName: "a.jpg" }]));
    getClientRendition.mockResolvedValue(ok({ url: "https://client/display" }));
    getRendition.mockResolvedValue(ok({ url: "https://case/display" }));
  });

  describe("getClientFileRenderAssets", () => {
    it("reads the client's and its cases' files by the client's id (the file may have no intro yet)", async () => {
      const result = await getClientFileRenderAssets({ clientId: CLIENT_ID, assetIds: [CLIENT_IMAGE, CASE_IMAGE, "x"] });
      expect(result).toEqual({
        ok: true,
        value: { [CLIENT_IMAGE]: { url: "https://client/display", kind: "image" }, [CASE_IMAGE]: { url: "https://case/display", kind: "image" } },
      });
      expect(getClient).toHaveBeenCalledWith(CLIENT_ID);
    });

    it("refuses a malformed list, an unknown client and a role that may not edit", async () => {
      expect(await getClientFileRenderAssets({ clientId: CLIENT_ID, assetIds: "x" })).toMatchObject({ ok: false, status: 400 });
      getClient.mockResolvedValueOnce(err({ code: "CLIENT_NOT_FOUND", message: "m" }));
      expect(await getClientFileRenderAssets({ clientId: CLIENT_ID, assetIds: [] })).toMatchObject({ ok: false, status: 404 });
      getActor.mockResolvedValue(ok(actor("account_sales_social")));
      expect(await getClientFileRenderAssets({ clientId: CLIENT_ID, assetIds: [] })).toMatchObject({ ok: false, status: 403 });
    });
  });

  describe("reloadFilePart", () => {
    it("reads one case part again, and only it", async () => {
      const part = { key: `case:${CASE_ID}` };
      casePartOf.mockResolvedValue(ok(part));
      expect(await reloadFilePart({ clientId: CLIENT_ID, part: "case", caseId: CASE_ID })).toEqual({ ok: true, value: part });
      expect(casePartOf).toHaveBeenCalledWith(client, CASE_ID);
      expect(introPartOf).not.toHaveBeenCalled();
    });

    it("reads the intro again with the client's sector label; null once it isn't ready", async () => {
      introPartOf.mockResolvedValue(ok(null));
      expect(await reloadFilePart({ clientId: CLIENT_ID, part: "client_intro" })).toEqual({ ok: true, value: null });
      expect(introPartOf).toHaveBeenCalledWith(client, "Illuminazione");
    });

    it("passes a case's read failure on", async () => {
      casePartOf.mockResolvedValue(err({ code: "REVISION_LOOKUP_FAILED", message: "down" }));
      expect(await reloadFilePart({ clientId: CLIENT_ID, part: "case", caseId: CASE_ID })).toMatchObject({ ok: false, error: { code: "REVISION_LOOKUP_FAILED" } });
    });

    it.each([
      [{}],
      [{ clientId: CLIENT_ID, part: "case" }],
      [{ clientId: "nope", part: "client_intro" }],
      [{ clientId: CLIENT_ID, part: "client_intro", extra: 1 }],
    ])("refuses %j with 400, reading nothing", async (bad) => {
      expect(await reloadFilePart(bad)).toMatchObject({ ok: false, status: 400, error: { code: "INVALID_INPUT" } });
      expect(getClient).not.toHaveBeenCalled();
    });

    it("refuses a role that may not edit", async () => {
      getActor.mockResolvedValue(ok(actor("account_sales_social")));
      expect(await reloadFilePart({ clientId: CLIENT_ID, part: "client_intro" })).toMatchObject({ ok: false, status: 403 });
    });
  });
});
