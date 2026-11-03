import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const { getActor, saveRevisionDocUseCase, approveUseCase, listCases, liveAssetIds, listAssets, getRendition } = vi.hoisted(() => ({
  getActor: vi.fn(),
  saveRevisionDocUseCase: vi.fn(),
  approveUseCase: vi.fn(),
  listCases: vi.fn(),
  liveAssetIds: vi.fn(),
  listAssets: vi.fn(),
  getRendition: vi.fn(),
}));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({ saveRevisionDoc: saveRevisionDocUseCase, approve: approveUseCase, list: listCases }));
vi.mock("@/modules/material", () => ({ liveAssetIds, listAssets, getRendition }));

const { approveCase, getRenderAssets, saveRevisionDoc } = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({ id: "00000000-0000-4000-8000-000000000002", email: "a@b.it", displayName: "A", role });
const input = { caseId: "aaaaaaaa-0000-4000-8000-000000000001", revisionId: "bbbbbbbb-0000-4000-8000-000000000001", doc: {}, expectedVersion: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(ok(actor("owner_designer")));
});

describe("saveRevisionDoc", () => {
  it("saves with the actor and the case's live files (the media guardrail), and returns only the new version", async () => {
    saveRevisionDocUseCase.mockResolvedValue(ok({ id: input.revisionId, version: 3, doc: { big: true } }));
    expect(await saveRevisionDoc(input)).toEqual({ ok: true, value: { version: 3 } });
    expect(saveRevisionDocUseCase).toHaveBeenCalledWith(actor("owner_designer"), input, liveAssetIds);
  });

  it("refuses account/sales/social with 403 before any save", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await saveRevisionDoc(input)).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(saveRevisionDocUseCase).not.toHaveBeenCalled();
  });

  it("returns 401 without an actor", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    expect(await saveRevisionDoc(input)).toMatchObject({ ok: false, status: 401 });
    expect(saveRevisionDocUseCase).not.toHaveBeenCalled();
  });

  it.each([
    ["STALE_REVISION", 409],
    ["STALE_HEAD", 409],
    ["REVISION_NOT_WRITABLE", 409],
    ["CASE_NOT_EDITABLE", 409],
    ["ASSET_NOT_ALLOWED", 400],
    ["NOT_FOUND", 404],
  ] as const)("maps %s to %i without details", async (code, status) => {
    saveRevisionDocUseCase.mockResolvedValue(err({ code, message: "m", details: { secret: 1 } }));
    expect(await saveRevisionDoc(input)).toEqual({ ok: false, status, error: { code, message: "m" } });
  });
});

describe("getRenderAssets", () => {
  const IMAGE = "cccccccc-0000-4000-8000-000000000001";
  const VIDEO = "cccccccc-0000-4000-8000-000000000002";
  const PDF = "cccccccc-0000-4000-8000-000000000003";
  const asset = (id: string, kind: string) => ({ id, kind, originalFileName: id, thumbnailUrl: null, thumbnailPending: false, isFavourite: false });

  beforeEach(() => {
    listAssets.mockResolvedValue(ok([asset(IMAGE, "image"), asset(VIDEO, "video"), asset(PDF, "document")]));
    getRendition.mockImplementation(async (id: string, spec: string) =>
      id === VIDEO && spec === "video.poster" ? err({ code: "RENDITION_NOT_READY", message: "m" }) : ok({ url: `https://x/${id}/${spec}` }),
    );
  });

  it("returns the asked-for media of this case with a rendition, and leaves out other ids", async () => {
    const result = await getRenderAssets({ caseId: input.caseId, assetIds: [IMAGE.toUpperCase(), VIDEO, PDF, "dddddddd-0000-4000-8000-000000000009"] });
    expect(result).toEqual({
      ok: true,
      value: { [IMAGE]: { kind: "image", url: `https://x/${IMAGE}/image.display` }, [VIDEO]: { kind: "video", url: `https://x/${VIDEO}/video.display` } },
    });
    expect(listAssets).toHaveBeenCalledWith({ caseId: input.caseId });
  });

  it("refuses account/sales/social with 403 and bad input with 400, reading nothing", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await getRenderAssets({ caseId: input.caseId, assetIds: [IMAGE] })).toMatchObject({ ok: false, status: 403 });
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    expect(await getRenderAssets({ caseId: input.caseId, assetIds: "x" })).toMatchObject({ ok: false, status: 400, error: { code: "INVALID_INPUT" } });
    expect(listAssets).not.toHaveBeenCalled();
  });

  it("leaves out a file whose rendition can't be read, and returns the others", async () => {
    getRendition.mockImplementation(async (id: string, spec: string) => (id === IMAGE ? err({ code: "STORAGE_FAILED", message: "m" }) : ok({ url: `https://x/${id}/${spec}` })));
    expect(await getRenderAssets({ caseId: input.caseId, assetIds: [IMAGE, VIDEO] })).toEqual({
      ok: true,
      value: { [VIDEO]: { kind: "video", url: `https://x/${VIDEO}/video.display`, posterUrl: `https://x/${VIDEO}/video.poster` } },
    });
  });
});

describe("approveCase (Story 4.8)", () => {
  const approval = { caseId: input.caseId, revisionId: input.revisionId, expectedRevisionVersion: 3, expectedHeadVersion: 2, overflow: { presentazione_16_9: false } };

  it("approves with the actor and the case's live files, and says whether other cases wait", async () => {
    approveUseCase.mockResolvedValue(ok({ id: input.revisionId, status: "approved" }));
    listCases.mockResolvedValue(ok([{ id: "x" }]));
    expect(await approveCase(approval)).toEqual({ ok: true, value: { waiting: true } });
    expect(approveUseCase).toHaveBeenCalledWith(actor("owner_designer"), approval, liveAssetIds);
    expect(listCases).toHaveBeenCalledWith({ status: "in_review" });
    listCases.mockResolvedValue(ok([]));
    expect(await approveCase(approval)).toEqual({ ok: true, value: { waiting: false } });
    listCases.mockResolvedValue(err({ code: "CASE_LOOKUP_FAILED", message: "m" }));
    expect(await approveCase(approval)).toEqual({ ok: true, value: { waiting: false } });
  });

  it("refuses account/sales/social with 403 before anything", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await approveCase(approval)).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    expect(approveUseCase).not.toHaveBeenCalled();
  });

  it("passes the missing files of MATERIAL_MISSING, and maps the other refusals", async () => {
    approveUseCase.mockResolvedValue(err({ code: "MATERIAL_MISSING", message: "m", details: { revisionId: "r", assetIds: ["a"] } }));
    expect(await approveCase(approval)).toMatchObject({ ok: false, status: 400, error: { code: "MATERIAL_MISSING", assetIds: ["a"] } });
    approveUseCase.mockResolvedValue(err({ code: "OVERFLOW_NOT_CLEARED", message: "m" }));
    expect(await approveCase(approval)).toMatchObject({ ok: false, error: { code: "OVERFLOW_NOT_CLEARED" } });
    approveUseCase.mockResolvedValue(err({ code: "STALE_HEAD", message: "m" }));
    expect(await approveCase(approval)).toMatchObject({ ok: false, status: 409, error: { code: "STALE_HEAD" } });
    expect(listCases).not.toHaveBeenCalled();
  });
});
