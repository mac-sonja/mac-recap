import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const { getActor, saveIntroUseCase, approveIntroUseCase, getClientIntroById, listClientMaterial, listCases, liveAssetIds, listAssets, getRendition, getClientRendition } =
  vi.hoisted(() => ({
    getActor: vi.fn(),
    saveIntroUseCase: vi.fn(),
    approveIntroUseCase: vi.fn(),
    getClientIntroById: vi.fn(),
    listClientMaterial: vi.fn(),
    listCases: vi.fn(),
    liveAssetIds: vi.fn(),
    listAssets: vi.fn(),
    getRendition: vi.fn(),
    getClientRendition: vi.fn(),
  }));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({
  saveIntroRevisionDoc: saveIntroUseCase,
  approveIntro: approveIntroUseCase,
  getClientIntroById,
  listClientMaterial,
  list: listCases,
}));
vi.mock("@/modules/material", () => ({ liveAssetIds, listAssets, getRendition, getClientRendition }));

const { approveIntro, getIntroRenderAssets, saveIntroRevisionDoc } = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({ id: "00000000-0000-4000-8000-000000000002", email: "a@b.it", displayName: "A", role });
const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const input = { clientIntroId: INTRO_ID, revisionId: "bbbbbbbb-0000-4000-8000-000000000001", doc: {}, expectedVersion: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(ok(actor("owner_designer")));
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
