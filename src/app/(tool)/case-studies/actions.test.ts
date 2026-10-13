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
  restoreAssetUseCase,
  addTextUseCase,
  editTextUseCase,
  removeTextUseCase,
  restoreTextUseCase,
  listTermsUseCase,
  setTermsUseCase,
  getCaseTermsUseCase,
  saveDetailsUseCase,
  getDetailsUseCase,
} = vi.hoisted(() => ({
  getActor: vi.fn(),
  create: vi.fn(),
  presignUpload: vi.fn(),
  confirmUpload: vi.fn(),
  removeAssetUseCase: vi.fn(),
  restoreAssetUseCase: vi.fn(),
  addTextUseCase: vi.fn(),
  editTextUseCase: vi.fn(),
  removeTextUseCase: vi.fn(),
  restoreTextUseCase: vi.fn(),
  listTermsUseCase: vi.fn(),
  setTermsUseCase: vi.fn(),
  getCaseTermsUseCase: vi.fn(),
  saveDetailsUseCase: vi.fn(),
  getDetailsUseCase: vi.fn(),
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
  restoreAsset: restoreAssetUseCase,
  addTextItem: addTextUseCase,
  editTextItem: editTextUseCase,
  removeTextItem: removeTextUseCase,
  restoreTextItem: restoreTextUseCase,
  listTerms: listTermsUseCase,
  setDeliverableTerms: setTermsUseCase,
  getCaseTerms: getCaseTermsUseCase,
  saveDetailsField: saveDetailsUseCase,
  getDetailsForm: getDetailsUseCase,
}));

const {
  createCaseStudy,
  presignAssetUpload,
  confirmAssetUpload,
  removeAsset,
  restoreAsset,
  addTextItem,
  editTextItem,
  removeTextItem,
  restoreTextItem,
  listTaxonomyTerms,
  setDeliverableTerms,
  getCaseTerms,
  saveDetailsField,
  getDetailsForm,
} = await import("./actions");

const actor = (role: Actor["role"]): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role,
});

const created: CaseStudy = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Rebrand",
  client: "Acme",
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

const input = { name: "Rebrand", client: "Acme", year: 2026 };

beforeEach(() => {
  for (const fn of [
    getActor,
    create,
    presignUpload,
    confirmUpload,
    removeAssetUseCase,
    restoreAssetUseCase,
    addTextUseCase,
    editTextUseCase,
    removeTextUseCase,
    restoreTextUseCase,
    listTermsUseCase,
    setTermsUseCase,
    getCaseTermsUseCase,
    saveDetailsUseCase,
    getDetailsUseCase,
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
        message: "Invalid or missing: name, client.",
        details: { fields: ["name", "client"], issues: [] },
      }),
    );
    expect(await createCaseStudy({ year: 2026 })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: name, client.", fields: ["name", "client"] },
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
    ["restoreAsset", restoreAsset, restoreAssetUseCase, ref, undefined],
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

describe("text item actions", () => {
  const ref = { caseId: "11111111-1111-4111-8111-111111111111", textItemId: "33333333-3333-4333-8333-333333333333" };
  const content = { title: "Brief", body: "Testo" };
  const item = { id: ref.textItemId, caseId: ref.caseId, ...content };
  const actions = [
    ["addTextItem", addTextItem, addTextUseCase, { caseId: ref.caseId, ...content }, item],
    ["editTextItem", editTextItem, editTextUseCase, { ...ref, ...content }, item],
    ["removeTextItem", removeTextItem, removeTextUseCase, ref, undefined],
    ["restoreTextItem", restoreTextItem, restoreTextUseCase, ref, undefined],
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
    ["TEXT_EMPTY", 400],
    ["NOT_FOUND", 404],
    ["TEXT_WRITE_FAILED", 500],
  ] as const)("maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    addTextUseCase.mockResolvedValue(err({ code, message: "m", details: { secret: 1 } }));
    expect(await addTextItem({ caseId: ref.caseId, ...content })).toEqual({ ok: false, status, error: { code, message: "m" } });
  });

  it("maps INVALID_INPUT to 400 with the failing field names", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    editTextUseCase.mockResolvedValue(
      err({ code: "INVALID_INPUT", message: "Invalid or missing: title.", details: { fields: ["title"], issues: [] } }),
    );
    expect(await editTextItem({ ...ref, title: " ", body: "x" })).toEqual({
      ok: false,
      status: 400,
      error: { code: "INVALID_INPUT", message: "Invalid or missing: title.", fields: ["title"] },
    });
  });
});

describe("taxonomy actions", () => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const refId = "22222222-2222-4222-8222-222222222222";
  const setInput = { caseId, refKind: "asset", refId, kind: "tag", keys: ["app"] };

  it("listTaxonomyTerms returns the terms for an owner/designer", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const terms = { tag: [{ key: "app", label: "App" }], property: [], flag: [] };
    listTermsUseCase.mockResolvedValue(ok(terms));
    expect(await listTaxonomyTerms()).toEqual({ ok: true, value: terms });
    expect(listTermsUseCase).toHaveBeenCalledOnce();
  });

  it("setDeliverableTerms passes the actor and its input unchanged", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const value = { refKind: "asset", refId, kind: "tag", keys: ["app"] };
    setTermsUseCase.mockResolvedValue(ok(value));
    expect(await setDeliverableTerms(setInput)).toEqual({ ok: true, value });
    expect(setTermsUseCase).toHaveBeenCalledExactlyOnceWith(actor("owner_designer"), setInput);
    expect(setTermsUseCase.mock.calls[0][1]).toBe(setInput);
  });

  it("getCaseTerms passes its input unchanged", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const value = [{ refKind: "asset", refId, tag: ["app"], property: [], flag: [] }];
    getCaseTermsUseCase.mockResolvedValue(ok(value));
    const input = { caseId };
    expect(await getCaseTerms(input)).toEqual({ ok: true, value });
    expect(getCaseTermsUseCase.mock.calls[0][0]).toBe(input);
  });

  const actions = [
    ["listTaxonomyTerms", () => listTaxonomyTerms(), listTermsUseCase],
    ["setDeliverableTerms", () => setDeliverableTerms(setInput), setTermsUseCase],
    ["getCaseTerms", () => getCaseTerms({ caseId }), getCaseTermsUseCase],
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
    ["UNKNOWN_TERM", 400],
    ["NOT_FOUND", 404],
    ["TERMS_WRITE_FAILED", 500],
  ] as const)("setDeliverableTerms maps %s to %i and keeps details server-side", async (code, status) => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    setTermsUseCase.mockResolvedValue(err({ code, message: "m", details: { key: "nope" } }));
    expect(await setDeliverableTerms(setInput)).toEqual({ ok: false, status, error: { code, message: "m" } });
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
