import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { ok } from "@/shared/result";

const m = vi.hoisted(() => ({
  get: vi.fn(),
  recordEvent: vi.fn(),
  getStorageConfig: vi.fn(),
  createS3ObjectStorage: vi.fn(),
  repo: {
    listLive: vi.fn(),
    countLive: vi.fn(),
    create: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
  },
  texts: {
    create: vi.fn(),
    getLive: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    hasMaterial: vi.fn(),
  },
  taxonomy: {
    listTerms: vi.fn(),
    setTerms: vi.fn(),
    caseTerms: vi.fn(),
  },
  form: {
    saveField: vi.fn(),
    read: vi.fn(),
  },
  storage: { presignUpload: vi.fn(), presignDownload: vi.fn(), head: vi.fn() },
}));

vi.mock("@/modules/case-study", () => ({ get: m.get, recordEvent: m.recordEvent }));
vi.mock("@/shared/env", () => ({ getStorageConfig: m.getStorageConfig }));
vi.mock("@/modules/material/adapters/s3/object-storage", () => ({ createS3ObjectStorage: m.createS3ObjectStorage }));
vi.mock("@/modules/material/adapters/supabase/asset-repository", () => ({
  createSupabaseAssetRepository: () => m.repo,
}));
vi.mock("@/modules/material/adapters/supabase/text-item-repository", () => ({
  createSupabaseTextItemRepository: () => m.texts,
}));
vi.mock("@/modules/material/adapters/supabase/taxonomy-repository", () => ({
  createSupabaseTaxonomyRepository: () => m.taxonomy,
}));
vi.mock("@/modules/material/adapters/supabase/details-form-repository", () => ({
  createSupabaseDetailsFormRepository: () => m.form,
}));

const material = await import("@/modules/material");

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const ref = { caseId: CASE_ID, assetId: ASSET_ID };
const TEXT_ID = "eeeeeeee-0000-4000-8000-000000000001";
const textRef = { caseId: CASE_ID, textItemId: TEXT_ID };
const detailsInput = { caseId: CASE_ID, field: "context", text: "Bando PNRR" };
const termsInput = { caseId: CASE_ID, refKind: "asset", refId: ASSET_ID, kind: "tag", keys: ["app"] };
const textItem = {
  id: TEXT_ID,
  caseId: CASE_ID,
  title: "Brief",
  body: "Testo",
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-13T10:00:00Z",
  updatedAt: "2026-10-13T10:00:00Z",
  deletedAt: null,
};

let bucketSeq = 0;
/** A fresh bucket name per call, so the module-level memo never hides a factory call. */
const configure = () => {
  const config = { bucket: `bucket-${++bucketSeq}`, region: "eu-south-1" };
  m.getStorageConfig.mockReturnValue(config);
  return config;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.createS3ObjectStorage.mockReturnValue(m.storage);
  m.get.mockResolvedValue(ok({ id: CASE_ID }));
  m.recordEvent.mockResolvedValue(ok({}));
  m.repo.countLive.mockResolvedValue(ok(0));
  m.repo.listLive.mockResolvedValue(
    ok([{ id: ASSET_ID, caseId: CASE_ID, kind: "image", originalFileName: "a.png", contentType: "image/png", sizeBytes: 10, createdBy: actor.id, createdAt: "2026-10-13T10:00:00Z", deletedAt: null }]),
  );
  m.storage.presignDownload.mockResolvedValue(ok("https://s3.test/get"));
  m.repo.create.mockImplementation(async (a) => ok({ ...a, createdAt: "2026-10-13T10:00:00Z", deletedAt: null }));
  m.repo.softDelete.mockResolvedValue(ok(true));
  m.repo.restore.mockResolvedValue(ok(true));
  m.storage.presignUpload.mockResolvedValue(ok({ url: "https://s3.test/", fields: { key: "k" } }));
  m.storage.head.mockResolvedValue(ok({ sizeBytes: 10, contentType: "image/png" }));
  m.texts.create.mockImplementation(async (t) => ok({ ...textItem, ...t }));
  m.texts.getLive.mockResolvedValue(ok(textItem));
  m.texts.update.mockImplementation(async (_c, _id, content) => ok({ ...textItem, ...content }));
  m.texts.softDelete.mockResolvedValue(ok(true));
  m.texts.restore.mockResolvedValue(ok(true));
  m.texts.hasMaterial.mockResolvedValue(ok(true));
  m.taxonomy.listTerms.mockResolvedValue(ok([{ kind: "tag", key: "app", label: "App" }]));
  m.taxonomy.setTerms.mockResolvedValue(ok([]));
  m.taxonomy.caseTerms.mockResolvedValue(ok([{ refKind: "asset", refId: ASSET_ID, terms: [{ kind: "tag", key: "app" }] }]));
  m.form.saveField.mockResolvedValue(ok(""));
  m.form.read.mockResolvedValue(ok({ context: "Bando PNRR", solution: "", results: "" }));
});

describe("material index wiring", () => {
  it("presignUpload reaches the S3 adapter built from the resolved config", async () => {
    const config = configure();
    const result = await material.presignUpload(actor, { caseId: CASE_ID, contentType: "image/png", sizeBytes: 10 });
    expect(result).toEqual(ok({ assetId: expect.stringMatching(/^[0-9a-f-]{36}$/), url: "https://s3.test/", fields: { key: "k" } }));
    expect(m.createS3ObjectStorage).toHaveBeenCalledWith(config);
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    expect(m.repo.countLive).toHaveBeenCalledWith(CASE_ID);
    expect(m.storage.presignUpload).toHaveBeenCalledOnce();
  });

  it("confirmUpload HEADs storage, creates the asset and records asset_uploaded through case-study", async () => {
    configure();
    const result = await material.confirmUpload(actor, { ...ref, contentType: "image/png", fileName: "a.png" });
    expect(result.ok).toBe(true);
    expect(m.storage.head).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: ASSET_ID, contentType: "image/png" });
    expect(m.repo.create).toHaveBeenCalledWith(expect.objectContaining({ id: ASSET_ID, caseId: CASE_ID, createdBy: actor.id }));
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "asset_uploaded", data: { assetId: ASSET_ID } });
  });

  it("removeAsset soft-deletes and records asset_removed", async () => {
    configure();
    expect(await material.removeAsset(actor, ref)).toEqual(ok(undefined));
    expect(m.repo.softDelete).toHaveBeenCalledWith(CASE_ID, ASSET_ID);
    expect(m.repo.restore).not.toHaveBeenCalled();
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "asset_removed", data: { assetId: ASSET_ID } });
  });

  it("restoreAsset restores and records asset_restored", async () => {
    configure();
    expect(await material.restoreAsset(actor, ref)).toEqual(ok(undefined));
    expect(m.repo.restore).toHaveBeenCalledWith(CASE_ID, ASSET_ID);
    expect(m.repo.softDelete).not.toHaveBeenCalled();
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "asset_restored", data: { assetId: ASSET_ID } });
  });

  it.each([
    ["presignUpload", () => material.presignUpload(actor, { caseId: CASE_ID, contentType: "image/png", sizeBytes: 10 })],
    ["confirmUpload", () => material.confirmUpload(actor, { ...ref, contentType: "image/png", fileName: "a.png" })],
    ["removeAsset", () => material.removeAsset(actor, ref)],
    ["restoreAsset", () => material.restoreAsset(actor, ref)],
  ])("%s returns STORAGE_NOT_CONFIGURED when S3 is unset", async (_name, call) => {
    m.getStorageConfig.mockReturnValue(null);
    const result = await call();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STORAGE_NOT_CONFIGURED");
    expect(m.createS3ObjectStorage).not.toHaveBeenCalled();
    expect(m.get).not.toHaveBeenCalled();
  });

  it("listAssets lists through the asset repository and signs image thumbnails with the configured adapter", async () => {
    const config = configure();
    const result = await material.listAssets({ caseId: CASE_ID });
    expect(result).toEqual(
      ok([{ id: ASSET_ID, kind: "image", originalFileName: "a.png", contentType: "image/png", sizeBytes: 10, createdAt: "2026-10-13T10:00:00Z", thumbnailUrl: "https://s3.test/get" }]),
    );
    expect(m.createS3ObjectStorage).toHaveBeenCalledWith(config);
    expect(m.repo.listLive).toHaveBeenCalledWith(CASE_ID);
    expect(m.storage.presignDownload).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: ASSET_ID, contentType: "image/png" }, 900);
    expect(m.recordEvent).not.toHaveBeenCalled();
  });

  it("listAssets still lists when S3 is unset, with null thumbnail URLs", async () => {
    m.getStorageConfig.mockReturnValue(null);
    const result = await material.listAssets({ caseId: CASE_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((a) => a.thumbnailUrl)).toEqual([null]);
    expect(m.createS3ObjectStorage).not.toHaveBeenCalled();
  });

  it("builds the S3 adapter once per resolved config", async () => {
    const config = configure();
    await material.removeAsset(actor, ref);
    await material.restoreAsset(actor, ref);
    expect(m.createS3ObjectStorage).toHaveBeenCalledTimes(1);
    configure();
    await material.removeAsset(actor, ref);
    expect(m.createS3ObjectStorage).toHaveBeenCalledTimes(2);
    expect(m.createS3ObjectStorage.mock.calls[0][0]).toEqual(config);
  });

  it("addTextItem creates the item and records text_added through case-study", async () => {
    const result = await material.addTextItem(actor, { caseId: CASE_ID, title: "Brief", body: "Testo" });
    expect(result).toEqual(ok(textItem));
    expect(m.texts.create).toHaveBeenCalledWith({ caseId: CASE_ID, title: "Brief", body: "Testo", createdBy: actor.id });
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "text_added", data: { textItemId: TEXT_ID } });
  });

  it("editTextItem updates the item and records text_edited", async () => {
    const result = await material.editTextItem(actor, { ...textRef, title: "Nuovo", body: "B" });
    expect(result.ok && result.value.title).toBe("Nuovo");
    expect(m.texts.update).toHaveBeenCalledWith(CASE_ID, TEXT_ID, { title: "Nuovo", body: "B" });
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "text_edited", data: { textItemId: TEXT_ID } });
  });

  it("removeTextItem soft-deletes and records text_removed", async () => {
    expect(await material.removeTextItem(actor, textRef)).toEqual(ok(undefined));
    expect(m.texts.softDelete).toHaveBeenCalledWith(CASE_ID, TEXT_ID);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "text_removed", data: { textItemId: TEXT_ID } });
  });

  it("restoreTextItem restores and records text_restored", async () => {
    expect(await material.restoreTextItem(actor, textRef)).toEqual(ok(undefined));
    expect(m.texts.restore).toHaveBeenCalledWith(CASE_ID, TEXT_ID);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "text_restored", data: { textItemId: TEXT_ID } });
  });

  it("listTerms groups the taxonomy repository's terms by kind", async () => {
    expect(await material.listTerms()).toEqual(ok({ tag: [{ key: "app", label: "App" }], property: [], flag: [] }));
  });

  it("setDeliverableTerms sets through the taxonomy repository and records terms_set", async () => {
    expect(await material.setDeliverableTerms(actor, termsInput)).toEqual(
      ok({ refKind: "asset", refId: ASSET_ID, kind: "tag", keys: ["app"] }),
    );
    expect(m.taxonomy.setTerms).toHaveBeenCalledWith(termsInput);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, {
      caseId: CASE_ID,
      type: "terms_set",
      data: { refKind: "asset", refId: ASSET_ID, kind: "tag", keys: ["app"] },
    });
  });

  it("getCaseTerms reads the taxonomy repository's case terms", async () => {
    expect(await material.getCaseTerms({ caseId: CASE_ID })).toEqual(
      ok([{ refKind: "asset", refId: ASSET_ID, tag: ["app"], property: [], flag: [] }]),
    );
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    expect(m.taxonomy.caseTerms).toHaveBeenCalledWith(CASE_ID);
  });

  it("saveDetailsField saves through the details form repository and records details_saved { field }", async () => {
    expect(await material.saveDetailsField(actor, detailsInput)).toEqual(ok({ field: "context", text: "Bando PNRR" }));
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    expect(m.form.saveField).toHaveBeenCalledWith(CASE_ID, "context", "Bando PNRR", actor.id);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "details_saved", data: { field: "context" } });
  });

  it("getDetailsForm reads the details form repository", async () => {
    expect(await material.getDetailsForm({ caseId: CASE_ID })).toEqual(ok({ context: "Bando PNRR", solution: "", results: "" }));
    expect(m.form.read).toHaveBeenCalledWith(CASE_ID);
  });

  it("resolveRefs resolves form_field refs through the details form repository", async () => {
    const refs = [{ kind: "form_field", id: "context" }];
    expect(await material.resolveRefs(CASE_ID, refs)).toEqual(ok([{ ref: refs[0], text: "Bando PNRR" }]));
    expect(m.form.read).toHaveBeenCalledWith(CASE_ID);
  });

  it("hasMaterial asks the text item repository's has_material", async () => {
    expect(await material.hasMaterial(CASE_ID)).toEqual(ok(true));
    expect(m.texts.hasMaterial).toHaveBeenCalledWith(CASE_ID);
  });

  it.each([
    ["addTextItem", () => material.addTextItem(actor, { caseId: CASE_ID, title: "Brief", body: "Testo" })],
    ["editTextItem", () => material.editTextItem(actor, { ...textRef, title: "Brief", body: "Testo" })],
    ["removeTextItem", () => material.removeTextItem(actor, textRef)],
    ["restoreTextItem", () => material.restoreTextItem(actor, textRef)],
    ["hasMaterial", () => material.hasMaterial(CASE_ID)],
    ["listTerms", () => material.listTerms()],
    ["setDeliverableTerms", () => material.setDeliverableTerms(actor, termsInput)],
    ["getCaseTerms", () => material.getCaseTerms({ caseId: CASE_ID })],
    ["saveDetailsField", () => material.saveDetailsField(actor, detailsInput)],
    ["getDetailsForm", () => material.getDetailsForm({ caseId: CASE_ID })],
    ["resolveRefs", () => material.resolveRefs(CASE_ID, [{ kind: "form_field", id: "results" }])],
  ])("%s works without S3 and never resolves storage", async (_name, call) => {
    m.getStorageConfig.mockReturnValue(null);
    expect((await call()).ok).toBe(true);
    expect(m.getStorageConfig).not.toHaveBeenCalled();
    expect(m.createS3ObjectStorage).not.toHaveBeenCalled();
  });
});
