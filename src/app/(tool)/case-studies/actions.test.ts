import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { CaseStudy } from "@/modules/case-study";
import { err, ok } from "@/shared/result";

const {
  getActor,
  create,
  presignUpload,
  confirmUpload,
  removeAssetUseCase,
  saveDetailsUseCase,
  getDetailsUseCase,
  listAssetsUseCase,
  setFavouriteUseCase,
} = vi.hoisted(() => ({
  getActor: vi.fn(),
  create: vi.fn(),
  presignUpload: vi.fn(),
  confirmUpload: vi.fn(),
  removeAssetUseCase: vi.fn(),
  saveDetailsUseCase: vi.fn(),
  getDetailsUseCase: vi.fn(),
  listAssetsUseCase: vi.fn(),
  setFavouriteUseCase: vi.fn(),
}));

// The real policy (`authorize`, `httpStatusFor`); only actor resolution is stubbed.
vi.mock("@/modules/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/access")>()),
  getActor,
}));
vi.mock("@/modules/case-study", () => ({ create }));
vi.mock("@/modules/material", () => ({
  presignUpload,
  confirmUpload,
  removeAsset: removeAssetUseCase,
  saveDetailsField: saveDetailsUseCase,
  getDetailsForm: getDetailsUseCase,
  listAssets: listAssetsUseCase,
  setFavourite: setFavouriteUseCase,
}));

const {
  createCaseStudy,
  presignAssetUpload,
  confirmAssetUpload,
  removeAsset,
  saveDetailsField,
  getDetailsForm,
  listAssets,
  setAssetFavourite,
} = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role,
});

const created: CaseStudy = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  status: "draft",
  projectOrderRef: null,
  headRevisionId: null,
  approvedRevisionId: null,
  headVersion: 0,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-09T10:00:00Z",
  updatedAt: "2026-10-09T10:00:00Z",
  deletedAt: null,
};

const input = { name: "Rebrand", clientId: "cccccccc-0000-4000-8000-000000000001", year: 2026 };

beforeEach(() => {
  for (const fn of [
    getActor,
    create,
    presignUpload,
    confirmUpload,
    removeAssetUseCase,
    saveDetailsUseCase,
    getDetailsUseCase,
    listAssetsUseCase,
    setFavouriteUseCase,
  ])
    fn.mockReset();
});

describe("createCaseStudy", () => {
  it("creates the case for an owner/designer", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    create.mockResolvedValue(ok(created));
    expect(await createCaseStudy(input)).toEqual({ ok: true, value: created });
    expect(create).toHaveBeenCalledWith(actor("owner_designer"), input);
  });

  it.each(["account_sales_social", "admin", "system"] as const)(
    "returns 403 FORBIDDEN for %s and never calls the use case",
    async (role) => {
      getActor.mockResolvedValue(ok(actor(role)));
      const result = await createCaseStudy(input);
      expect(result).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("returns 401 when no actor resolves, without calling the use case", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "No profile.", details: { id: "x" } }));
    expect(await createCaseStudy(input)).toEqual({
      ok: false,
      status: 401,
      error: { code: "UNAUTHENTICATED", message: "No profile." },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 400 INVALID_INPUT with the failing field names and no other details", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    create.mockResolvedValue(
      err({
        code: "INVALID_INPUT",
        message: "Invalid or missing: name, clientId.",
        details: { fields: ["name", "clientId"], issues: [] },
      }),
    );
    expect(await createCaseStudy({ year: 2026 })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: name, clientId.", fields: ["name", "clientId"] },
    });
  });

  it("returns 500 for a write failure and keeps details server-side", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    create.mockResolvedValue(err({ code: "CASE_STUDY_WRITE_FAILED", message: "Could not create.", details: { x: 1 } }));
    expect(await createCaseStudy(input)).toEqual({
      ok: false,
      status: 500,
      error: { code: "CASE_STUDY_WRITE_FAILED", message: "Could not create." },
    });
  });
});

describe("material actions", () => {
  const ref = { caseId: "11111111-1111-4111-8111-111111111111", assetId: "22222222-2222-4222-8222-222222222222" };
  const actions = [
    [
      "presignAssetUpload",
      presignAssetUpload,
      presignUpload,
      { caseId: ref.caseId, contentType: "image/png", sizeBytes: 2048 },
      { assetId: ref.assetId, url: "https://s3/", fields: {} },
    ],
    ["confirmAssetUpload", confirmAssetUpload, confirmUpload, { ...ref, contentType: "image/png", fileName: "a.png" }, { id: ref.assetId }],
    ["removeAsset", removeAsset, removeAssetUseCase, ref, undefined],
    ["setAssetFavourite", setAssetFavourite, setFavouriteUseCase, { ...ref, isFavourite: true }, undefined],
  ] as const;

  it.each(actions)("%s passes its input unchanged to the use case for an owner/designer", async (_name, action, useCase, input, value) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    useCase.mockResolvedValue(ok(value));
    expect(await action(input)).toEqual({ ok: true, value });
    expect(useCase).toHaveBeenCalledExactlyOnceWith(actor("owner_designer"), input);
    expect(useCase.mock.calls[0][1]).toBe(input);
  });

  it.each(
    actions.flatMap((a) => (["account_sales_social", "admin", "system"] as const).map((role) => [a[0], role, a[1], a[2], a[3]] as const)),
  )("%s returns 403 FORBIDDEN for %s and never calls the use case", async (_name, role, action, useCase, input) => {
    getActor.mockResolvedValue(ok(actor(role)));
    expect(await action(input)).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each(actions)("%s returns 401 when no actor resolves", async (_name, action, useCase, input) => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "No profile." }));
    expect(await action(input)).toMatchObject({ ok: false, status: 401 });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each([
    ["FILE_TYPE_NOT_ALLOWED", 400],
    ["FILE_TOO_LARGE", 400],
    ["FILE_LIMIT_REACHED", 409],
    ["UPLOAD_NOT_FOUND", 404],
    ["UPLOAD_REJECTED", 400],
    ["ASSET_ALREADY_CONFIRMED", 409],
    ["NOT_FOUND", 404],
    ["STORAGE_NOT_CONFIGURED", 503],
  ] as const)("maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    confirmUpload.mockResolvedValue(err({ code, message: "m", details: { secret: 1 } }));
    expect(await confirmAssetUpload({ ...ref, contentType: "image/png", fileName: "a.png" })).toEqual({
      ok: false,
      status,
      error: { code, message: "m" },
    });
  });

  it("maps INVALID_INPUT to 400 with the failing field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    confirmUpload.mockResolvedValue(
      err({ code: "INVALID_INPUT", message: "Invalid or missing: fileName.", details: { fields: ["fileName"], issues: [] } }),
    );
    expect(await confirmAssetUpload({ ...ref, contentType: "image/png", fileName: "a\u0000b" })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: fileName.", fields: ["fileName"] },
    });
  });
});

describe("details form actions", () => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const saveInput = { caseId, field: "context", text: "Bando PNRR" };

  it("saveDetailsField passes the actor and its input unchanged", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const value = { field: "context", text: "Bando PNRR" };
    saveDetailsUseCase.mockResolvedValue(ok(value));
    expect(await saveDetailsField(saveInput)).toEqual({ ok: true, value });
    expect(saveDetailsUseCase).toHaveBeenCalledExactlyOnceWith(actor("owner_designer"), saveInput);
    expect(saveDetailsUseCase.mock.calls[0][1]).toBe(saveInput);
  });

  it("getDetailsForm passes its input unchanged", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const value = { context: "Bando PNRR", solution: "", results: "" };
    getDetailsUseCase.mockResolvedValue(ok(value));
    const input = { caseId };
    expect(await getDetailsForm(input)).toEqual({ ok: true, value });
    expect(getDetailsUseCase.mock.calls[0][0]).toBe(input);
  });

  const actions = [
    ["saveDetailsField", () => saveDetailsField(saveInput), saveDetailsUseCase],
    ["getDetailsForm", () => getDetailsForm({ caseId }), getDetailsUseCase],
  ] as const;

  it.each(
    actions.flatMap((a) => (["account_sales_social", "admin", "system"] as const).map((role) => [a[0], role, a[1], a[2]] as const)),
  )("%s returns 403 FORBIDDEN for %s and never calls the use case", async (_name, role, call, useCase) => {
    getActor.mockResolvedValue(ok(actor(role)));
    expect(await call()).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each(actions)("%s returns 401 when no actor resolves", async (_name, call, useCase) => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "No profile." }));
    expect(await call()).toMatchObject({ ok: false, status: 401 });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each([
    ["UNKNOWN_FIELD", 400],
    ["NOT_FOUND", 404],
    ["DETAILS_WRITE_FAILED", 500],
  ] as const)("saveDetailsField maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    saveDetailsUseCase.mockResolvedValue(err({ code, message: "m", details: { field: "budget" } }));
    expect(await saveDetailsField(saveInput)).toEqual({ ok: false, status, error: { code, message: "m" } });
  });

  it("getDetailsForm maps NOT_FOUND to 404 and keeps details server-side", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    getDetailsUseCase.mockResolvedValue(err({ code: "NOT_FOUND", message: "m", details: { caseId } }));
    expect(await getDetailsForm({ caseId })).toEqual({ ok: false, status: 404, error: { code: "NOT_FOUND", message: "m" } });
  });

  it("getDetailsForm maps INVALID_INPUT to 400 with only the field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    getDetailsUseCase.mockResolvedValue(
      err({
        code: "INVALID_INPUT",
        message: "Invalid or missing: caseId.",
        details: { fields: ["caseId"], issues: [{ field: "caseId", message: "secret" }] },
      }),
    );
    expect(await getDetailsForm({ caseId: "nope" })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: caseId.", fields: ["caseId"] },
    });
  });

  it("saveDetailsField maps INVALID_INPUT to 400 naming text", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    saveDetailsUseCase.mockResolvedValue(
      err({ code: "INVALID_INPUT", message: "Invalid or missing: text.", details: { fields: ["text"], issues: [] } }),
    );
    expect(await saveDetailsField(saveInput)).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: text.", fields: ["text"] },
    });
  });
});

describe("listAssets action", () => {
  const listInput = { caseId: "11111111-1111-4111-8111-111111111111" };
  const listed = [
    {
      id: "22222222-2222-4222-8222-222222222222",
      kind: "image",
      originalFileName: "a.png",
      contentType: "image/png",
      sizeBytes: 10,
      createdAt: "2026-10-13T10:00:00Z",
      isFavourite: false,
      thumbnailUrl: "https://s3/get",
    },
  ];

  it("passes its input unchanged to the use case for an owner/designer", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    listAssetsUseCase.mockResolvedValue(ok(listed));
    expect(await listAssets(listInput)).toEqual({ ok: true, value: listed });
    expect(listAssetsUseCase).toHaveBeenCalledExactlyOnceWith(listInput);
    expect(listAssetsUseCase.mock.calls[0][0]).toBe(listInput);
  });

  it.each(["account_sales_social", "admin", "system"] as const)("returns 403 FORBIDDEN for %s and never lists", async (role) => {
    getActor.mockResolvedValue(ok(actor(role)));
    expect(await listAssets(listInput)).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
    expect(listAssetsUseCase).not.toHaveBeenCalled();
  });

  it("returns 401 when no actor resolves", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "No profile." }));
    expect(await listAssets(listInput)).toMatchObject({ ok: false, status: 401 });
    expect(listAssetsUseCase).not.toHaveBeenCalled();
  });

  it.each([
    ["NOT_FOUND", 404],
    ["STORAGE_FAILED", 500],
    ["ASSET_LOOKUP_FAILED", 500],
  ] as const)("maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    listAssetsUseCase.mockResolvedValue(err({ code, message: "m", details: { secret: 1 } }));
    expect(await listAssets(listInput)).toEqual({ ok: false, status, error: { code, message: "m" } });
  });

  it("maps INVALID_INPUT to 400 with the failing field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    listAssetsUseCase.mockResolvedValue(
      err({ code: "INVALID_INPUT", message: "Invalid or missing: caseId.", details: { fields: ["caseId"], issues: [] } }),
    );
    expect(await listAssets({ caseId: "nope" })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: caseId.", fields: ["caseId"] },
    });
  });
});

describe("setAssetFavourite action", () => {
  const favInput = {
    caseId: "11111111-1111-4111-8111-111111111111",
    assetId: "22222222-2222-4222-8222-222222222222",
    isFavourite: true,
  };

  it.each([
    ["NOT_FAVOURITABLE", 400],
    ["NOT_FOUND", 404],
    ["ASSET_WRITE_FAILED", 500],
  ] as const)("maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    setFavouriteUseCase.mockResolvedValue(err({ code, message: "m", details: { secret: 1 } }));
    expect(await setAssetFavourite(favInput)).toEqual({ ok: false, status, error: { code, message: "m" } });
  });

  it("maps INVALID_INPUT to 400 with the failing field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    setFavouriteUseCase.mockResolvedValue(
      err({ code: "INVALID_INPUT", message: "Invalid or missing: isFavourite.", details: { fields: ["isFavourite"], issues: [] } }),
    );
    expect(await setAssetFavourite({ ...favInput, isFavourite: "yes" })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: isFavourite.", fields: ["isFavourite"] },
    });
  });
});
