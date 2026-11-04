import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const { getActor, saveRevisionDocUseCase, approveUseCase, forkHeadUseCase, discardHeadUseCase, updateCaseFieldsUseCase, listCases, liveAssetIds, listAssets, getRendition, getCase, saveResultsUseCase, saveTestimonialUseCase, listClientMaterial, getClientRendition } = vi.hoisted(() => ({
  listClientMaterial: vi.fn(),
  getClientRendition: vi.fn(),
  getActor: vi.fn(),
  getCase: vi.fn(),
  saveResultsUseCase: vi.fn(),
  saveTestimonialUseCase: vi.fn(),
  updateCaseFieldsUseCase: vi.fn(),
  saveRevisionDocUseCase: vi.fn(),
  approveUseCase: vi.fn(),
  forkHeadUseCase: vi.fn(),
  discardHeadUseCase: vi.fn(),
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
vi.mock("@/modules/case-study", () => ({ saveRevisionDoc: saveRevisionDocUseCase, approve: approveUseCase, forkHead: forkHeadUseCase, discardHead: discardHeadUseCase, list: listCases, updateCaseFields: updateCaseFieldsUseCase, get: getCase, listClientMaterial }));
vi.mock("@/modules/material", () => ({ liveAssetIds, listAssets, getRendition, getClientRendition, saveCaseResults: saveResultsUseCase, saveCaseTestimonial: saveTestimonialUseCase }));

const { approveCase, discardCaseChanges, forkCaseHead, getRenderAssets, saveCaseResults, saveCaseTestimonial, saveRevisionDoc, updateApprovedVersion, updateCaseFields } =
  await import("./actions");

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
    getCase.mockResolvedValue(ok({ id: input.caseId, client: { id: CLIENT_ID } }));
    listClientMaterial.mockResolvedValue(ok([]));
    getClientRendition.mockImplementation(async (id: string, spec: string) => ok({ url: `https://client/${id}/${spec}` }));
  });

  const CLIENT_ID = "eeeeeeee-0000-4000-8000-000000000001";
  const C_IMAGE = "eeeeeeee-0000-4000-8000-000000000011";
  const C_VIDEO = "eeeeeeee-0000-4000-8000-000000000012";
  const clientFile = (id: string, kind: string) => ({ id, clientId: CLIENT_ID, kind, fileName: id, thumbnailUrl: null });

  it("returns this case's client's images and videos from the client renditions, one file at a time (Story 4.5c-2)", async () => {
    listClientMaterial.mockResolvedValue(ok([clientFile(C_IMAGE, "image"), clientFile(C_VIDEO, "video"), clientFile("eeeeeeee-0000-4000-8000-000000000013", "document")]));
    getClientRendition.mockImplementation(async (id: string, spec: string) =>
      id === C_VIDEO ? err({ code: "STORAGE_FAILED", message: "m" }) : ok({ url: `https://client/${id}/${spec}` }),
    );
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await getRenderAssets({ caseId: input.caseId, assetIds: [IMAGE, C_IMAGE.toUpperCase(), C_VIDEO, "eeeeeeee-0000-4000-8000-000000000013"] });
      expect(result).toEqual({
        ok: true,
        value: { [IMAGE]: { kind: "image", url: `https://x/${IMAGE}/image.display` }, [C_IMAGE]: { kind: "image", url: `https://client/${C_IMAGE}/image.display` } },
      });
    } finally {
      write.mockRestore();
    }
    expect(getCase).toHaveBeenCalledWith(input.caseId);
    expect(listClientMaterial).toHaveBeenCalledWith({ clientId: CLIENT_ID });
    expect(getClientRendition).not.toHaveBeenCalledWith(IMAGE, expect.anything());
  });

  it("never returns a file of another client, and reads no client file when every id is the case's", async () => {
    // The case's client lists only its own files: an id it doesn't list is left out.
    listClientMaterial.mockResolvedValue(ok([clientFile(C_IMAGE, "image")]));
    expect(await getRenderAssets({ caseId: input.caseId, assetIds: ["ffffffff-0000-4000-8000-000000000099"] })).toEqual({ ok: true, value: {} });
    expect(getClientRendition).not.toHaveBeenCalled();
    getCase.mockClear();
    await getRenderAssets({ caseId: input.caseId, assetIds: [IMAGE] });
    expect(getCase).not.toHaveBeenCalled();
    expect(listClientMaterial).toHaveBeenCalledTimes(1);
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

  beforeEach(() => {
    getCase.mockResolvedValue(ok({ id: input.caseId, status: "in_review" }));
  });

  it("never approves an approved case again (its copy is updated through updateApprovedVersion, Story 4.9)", async () => {
    getCase.mockResolvedValue(ok({ id: input.caseId, status: "approved" }));
    expect(await approveCase(approval)).toMatchObject({ ok: false, status: 409, error: { code: "CASE_NOT_APPROVABLE" } });
    expect(approveUseCase).not.toHaveBeenCalled();
  });

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

describe("editing an approved case (Story 4.9)", () => {
  const caseId = input.caseId;
  const approval = { caseId, revisionId: input.revisionId, expectedRevisionVersion: 3, expectedHeadVersion: 2, overflow: { presentazione_16_9: false } };

  beforeEach(() => {
    getCase.mockResolvedValue(ok({ id: caseId, status: "approved" }));
  });

  it("forkCaseHead forks with the actor and returns the copy's id, version and head version", async () => {
    forkHeadUseCase.mockResolvedValue(ok({ revisionId: input.revisionId, version: 0, headVersion: 3 }));
    expect(await forkCaseHead({ caseId, expectedHeadVersion: 2 })).toEqual({ ok: true, value: { revisionId: input.revisionId, version: 0, headVersion: 3 } });
    expect(forkHeadUseCase).toHaveBeenCalledWith(actor("owner_designer"), { caseId, expectedHeadVersion: 2 });
    forkHeadUseCase.mockResolvedValue(err({ code: "STALE_HEAD", message: "m" }));
    expect(await forkCaseHead({ caseId, expectedHeadVersion: 2 })).toMatchObject({ ok: false, status: 409, error: { code: "STALE_HEAD" } });
  });

  it("updateApprovedVersion runs approve's checks on the copy, with the actor and the case's live files", async () => {
    approveUseCase.mockResolvedValue(ok({ id: input.revisionId, status: "approved" }));
    expect(await updateApprovedVersion(approval)).toEqual({ ok: true, value: undefined });
    expect(approveUseCase).toHaveBeenCalledWith(actor("owner_designer"), approval, liveAssetIds);
    expect(listCases).not.toHaveBeenCalled();
  });

  it.each([
    ["OVERFLOW_NOT_CLEARED", 400],
    ["MATERIAL_MISSING", 400],
    ["STALE_REVISION", 409],
    ["STALE_HEAD", 409],
  ] as const)("updateApprovedVersion maps %s to %i", async (code, status) => {
    approveUseCase.mockResolvedValue(err({ code, message: "m", details: { assetIds: ["a"] } }));
    expect(await updateApprovedVersion(approval)).toMatchObject({ ok: false, status, error: { code } });
  });

  it("updateApprovedVersion refuses a case that isn't approved (Da approvare is approved through Approva)", async () => {
    getCase.mockResolvedValue(ok({ id: caseId, status: "in_review" }));
    expect(await updateApprovedVersion(approval)).toMatchObject({ ok: false, status: 409, error: { code: "CASE_NOT_APPROVABLE" } });
    getCase.mockResolvedValue(err({ code: "NOT_FOUND", message: "m" }));
    expect(await updateApprovedVersion(approval)).toMatchObject({ ok: false, status: 404 });
    expect(approveUseCase).not.toHaveBeenCalled();
  });

  it("discardCaseChanges discards with the actor and returns nothing else", async () => {
    discardHeadUseCase.mockResolvedValue(ok({ id: "x", status: "approved" }));
    const discard = { caseId, revisionId: input.revisionId, expectedHeadVersion: 3 };
    expect(await discardCaseChanges(discard)).toEqual({ ok: true, value: undefined });
    expect(discardHeadUseCase).toHaveBeenCalledWith(actor("owner_designer"), discard);
    discardHeadUseCase.mockResolvedValue(err({ code: "STALE_HEAD", message: "m" }));
    expect(await discardCaseChanges(discard)).toMatchObject({ ok: false, status: 409, error: { code: "STALE_HEAD" } });
  });

  it("refuses account/sales/social with 403 before anything", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await forkCaseHead({ caseId, expectedHeadVersion: 2 })).toMatchObject({ ok: false, status: 403 });
    expect(await updateApprovedVersion(approval)).toMatchObject({ ok: false, status: 403 });
    expect(await discardCaseChanges({ caseId })).toMatchObject({ ok: false, status: 403 });
    expect(forkHeadUseCase).not.toHaveBeenCalled();
    expect(approveUseCase).not.toHaveBeenCalled();
    expect(discardHeadUseCase).not.toHaveBeenCalled();
  });
});

describe("updateCaseFields (Story 4.3d)", () => {
  const fields = { caseId: input.caseId, year: 2025, businessLines: ["branding", "video"] };

  it("saves with the actor and returns nothing else", async () => {
    updateCaseFieldsUseCase.mockResolvedValue(ok({ id: input.caseId, year: 2025, code: "LUM-2026-01" }));
    expect(await updateCaseFields(fields)).toEqual({ ok: true, value: undefined });
    expect(updateCaseFieldsUseCase).toHaveBeenCalledWith(actor("owner_designer"), fields);
  });

  it("refuses account/sales/social with 403 and no session with 401, before any save", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await updateCaseFields(fields)).toMatchObject({ ok: false, status: 403, error: { code: "FORBIDDEN" } });
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    expect(await updateCaseFields(fields)).toMatchObject({ ok: false, status: 401 });
    expect(updateCaseFieldsUseCase).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_INPUT", 400],
    ["NOT_FOUND", 404],
    ["STALE_STATUS", 409],
  ] as const)("maps %s to %i", async (code, status) => {
    updateCaseFieldsUseCase.mockResolvedValue(err({ code, message: "m", details: code === "INVALID_INPUT" ? { fields: ["year"] } : { id: "x" } }));
    expect(await updateCaseFields(fields)).toMatchObject({ ok: false, status, error: { code } });
  });
});

describe("saveCaseResults and saveCaseTestimonial from the configurator (Story 4.3d)", () => {
  const results = { caseId: input.caseId, results: [{ label: "Vendite", value: "+30%" }] };
  const testimonial = { caseId: input.caseId, quote: "Bravi.", author: "Ada" };
  const calls = [
    ["saveCaseResults", () => saveCaseResults(results), saveResultsUseCase, results],
    ["saveCaseTestimonial", () => saveCaseTestimonial(testimonial), saveTestimonialUseCase, testimonial],
  ] as const;

  it.each(calls)("%s saves through the material use case while the case is Da approvare", async (_name, call, useCase, sent) => {
    getCase.mockResolvedValue(ok({ id: input.caseId, status: "in_review" }));
    useCase.mockResolvedValue(ok({ saved: true }));
    expect(await call()).toEqual({ ok: true, value: { saved: true } });
    expect(getCase).toHaveBeenCalledWith(input.caseId);
    expect(useCase).toHaveBeenCalledWith(actor("owner_designer"), sent);
  });

  it.each(calls)("%s refuses an approved case (a stale tab) with 409 STALE_STATUS, writing nothing", async (_name, call, useCase) => {
    getCase.mockResolvedValue(ok({ id: input.caseId, status: "approved" }));
    expect(await call()).toMatchObject({ ok: false, status: 409, error: { code: "STALE_STATUS" } });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: an unknown or deleted case is 404 NOT_FOUND; account/sales/social 403 before any read", async (_name, call, useCase) => {
    getCase.mockResolvedValue(err({ code: "NOT_FOUND", message: "m" }));
    expect(await call()).toMatchObject({ ok: false, status: 404, error: { code: "NOT_FOUND" } });
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    getCase.mockClear();
    expect(await call()).toMatchObject({ ok: false, status: 403 });
    expect(getCase).not.toHaveBeenCalled();
    expect(useCase).not.toHaveBeenCalled();
  });
});
