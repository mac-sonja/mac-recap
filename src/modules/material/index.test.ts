import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok } from "@/shared/result";

const m = vi.hoisted(() => ({
  get: vi.fn(),
  recordEvent: vi.fn(),
  createSupabaseObjectStorage: vi.fn(),
  repo: {
    listLive: vi.fn(),
    countLive: vi.fn(),
    get: vi.fn(),
    getById: vi.fn(),
    setFavourite: vi.fn(),
    create: vi.fn(),
    softDelete: vi.fn(),
    undoSoftDelete: vi.fn(),
    hasMaterial: vi.fn(),
  },
  form: {
    saveField: vi.fn(),
    saveResults: vi.fn(),
    saveTestimonial: vi.fn(),
    read: vi.fn(),
  },
  storage: {
    presignUpload: vi.fn(),
    presignDownload: vi.fn(),
    presignDownloads: vi.fn(),
    head: vi.fn(),
    presignKeys: vi.fn(),
    download: vi.fn(),
    upload: vi.fn(),
  },
  renditions: { listForAsset: vi.fn(), listFor: vi.fn(), get: vi.fn(), upsert: vi.fn() },
  enqueue: vi.fn(),
  liveSubjects: vi.fn(),
}));

vi.mock("@/modules/case-study", () => ({
  get: m.get,
  recordEvent: m.recordEvent,
  // A case's Risultati and Testimonial take the client's limits (Story 2.21).
  CLIENT_RESULTS_MAX: 3,
  CLIENT_RESULT_LABEL_MAX: 80,
  CLIENT_RESULT_VALUE_MAX: 20,
  CLIENT_TESTIMONIAL_QUOTE_MAX: 600,
  CLIENT_TESTIMONIAL_AUTHOR_MAX: 120,
}));
vi.mock("@/modules/jobs", () => ({ enqueue: m.enqueue, liveSubjects: m.liveSubjects }));
vi.mock("@/modules/material/adapters/supabase/rendition-repository", () => ({
  createSupabaseRenditionRepository: () => m.renditions,
}));
vi.mock("@/modules/material/adapters/supabase/object-storage", () => ({ createSupabaseObjectStorage: m.createSupabaseObjectStorage }));
vi.mock("@/modules/material/adapters/supabase/asset-repository", () => ({
  createSupabaseAssetRepository: () => m.repo,
}));
vi.mock("@/modules/material/adapters/supabase/details-form-repository", () => ({
  createSupabaseDetailsFormRepository: () => m.form,
}));

/** A fresh import per test (`vi.resetModules()`), so the module-level storage memo starts empty. */
let material: typeof import("@/modules/material");

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const ref = { caseId: CASE_ID, assetId: ASSET_ID };
const detailsInput = { caseId: CASE_ID, field: "context", text: "Bando PNRR" };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  material = await import("@/modules/material");
  m.createSupabaseObjectStorage.mockReturnValue(m.storage);
  m.get.mockResolvedValue(ok({ id: CASE_ID }));
  m.recordEvent.mockResolvedValue(ok({}));
  m.repo.countLive.mockResolvedValue(ok(0));
  m.repo.listLive.mockResolvedValue(
    ok([{ id: ASSET_ID, caseId: CASE_ID, kind: "image", originalFileName: "a.png", contentType: "image/png", sizeBytes: 10, createdBy: actor.id, createdAt: "2026-10-13T10:00:00Z", deletedAt: null, isFavourite: false }]),
  );
  m.storage.presignDownloads.mockResolvedValue(ok(["https://storage.test/get"]));
  m.repo.create.mockImplementation(async (a) => ok({ ...a, createdAt: "2026-10-13T10:00:00Z", deletedAt: null, isFavourite: false }));
  m.repo.get.mockResolvedValue(
    ok({ id: ASSET_ID, caseId: CASE_ID, kind: "image", originalFileName: "a.png", contentType: "image/png", sizeBytes: 10, createdBy: actor.id, createdAt: "2026-10-13T10:00:00Z", deletedAt: null, isFavourite: false }),
  );
  m.repo.setFavourite.mockResolvedValue(ok(true));
  m.repo.softDelete.mockResolvedValue(ok(true));
  m.repo.undoSoftDelete.mockResolvedValue(ok(true));
  m.repo.hasMaterial.mockResolvedValue(ok(true));
  m.storage.presignUpload.mockResolvedValue(ok({ url: "https://storage.test/upload", method: "PUT", headers: { "content-type": "image/png", "x-upsert": "false" } }));
  m.storage.head.mockResolvedValue(ok({ sizeBytes: 10, contentType: "image/png" }));
  m.renditions.listFor.mockResolvedValue(ok([]));
  m.enqueue.mockImplementation(async (input) => ok({ id: "job", ...input }));
  m.liveSubjects.mockImplementation(async ({ subjectIds }) => ok(subjectIds));
  m.form.saveField.mockResolvedValue(ok(""));
  m.form.saveResults.mockResolvedValue(ok([]));
  m.form.saveTestimonial.mockResolvedValue(ok({ quote: "", author: "" }));
  m.form.read.mockResolvedValue(ok({ context: "Bando PNRR", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }));
});

describe("material index wiring", () => {
  it("builds the Supabase Storage adapter once, on first use, and reuses it", async () => {
    expect(m.createSupabaseObjectStorage).not.toHaveBeenCalled();
    await material.removeAsset(actor, ref);
    await material.listAssets({ caseId: CASE_ID });
    await material.presignUpload(actor, { caseId: CASE_ID, contentType: "image/png", sizeBytes: 10 });
    expect(m.createSupabaseObjectStorage).toHaveBeenCalledExactlyOnceWith();
  });

  it("presignUpload reaches the Supabase Storage adapter and returns the signed PUT", async () => {
    const result = await material.presignUpload(actor, { caseId: CASE_ID, contentType: "image/png", sizeBytes: 10 });
    expect(result).toEqual(
      ok({
        assetId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        url: "https://storage.test/upload",
        method: "PUT",
        headers: { "content-type": "image/png", "x-upsert": "false" },
      }),
    );
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    expect(m.repo.countLive).toHaveBeenCalledWith(CASE_ID);
    expect(m.storage.presignUpload).toHaveBeenCalledOnce();
  });

  it("confirmUpload checks the stored object, creates the asset and records asset_uploaded through case-study", async () => {
    const result = await material.confirmUpload(actor, { ...ref, contentType: "image/png", fileName: "a.png" });
    expect(result.ok).toBe(true);
    expect(m.storage.head).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: ASSET_ID, contentType: "image/png" });
    expect(m.repo.create).toHaveBeenCalledWith(expect.objectContaining({ id: ASSET_ID, caseId: CASE_ID, createdBy: actor.id }));
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "asset_uploaded", data: { assetId: ASSET_ID } });
  });

  it("confirmUpload of an image enqueues its rendition job through the jobs module", async () => {
    await material.confirmUpload(actor, { ...ref, contentType: "image/png", fileName: "a.png" });
    expect(m.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ kind: "rendition", subjectId: ASSET_ID, payload: { caseId: CASE_ID }, inputHash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    );
  });

  it("getRendition reads the asset and rendition repositories and signs the stored path", async () => {
    m.repo.getById.mockResolvedValue(
      ok({ id: ASSET_ID, caseId: CASE_ID, kind: "image", originalFileName: "a.png", contentType: "image/png", sizeBytes: 10, createdBy: actor.id, createdAt: "2026-10-13T10:00:00Z", deletedAt: null, isFavourite: false }),
    );
    m.renditions.get.mockResolvedValue(
      ok({ assetId: ASSET_ID, specHash: "0123456789abcdef", path: "cases/x/renditions/y.webp", contentType: "image/webp", width: 480, height: 320, sizeBytes: 9, createdAt: "t" }),
    );
    m.storage.presignKeys.mockResolvedValue(ok(["https://storage.test/r"]));
    expect(await material.getRendition(ASSET_ID, "image.thumb")).toEqual(
      ok({ url: "https://storage.test/r", width: 480, height: 320, contentType: "image/webp" }),
    );
    expect(m.repo.getById).toHaveBeenCalledWith(ASSET_ID);
    expect(m.storage.presignKeys).toHaveBeenCalledWith(["cases/x/renditions/y.webp"], 900);
    expect(material.RENDITION_SPEC_NAMES).toEqual(["image.thumb", "image.display", "video.poster", "video.display"]);
  });

  it("removeAsset soft-deletes and records asset_removed", async () => {
    expect(await material.removeAsset(actor, ref)).toEqual(ok(undefined));
    expect(m.repo.softDelete).toHaveBeenCalledWith(CASE_ID, ASSET_ID);
    expect(m.repo.undoSoftDelete).not.toHaveBeenCalled();
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "asset_removed", data: { assetId: ASSET_ID } });
  });

  it("listAssets lists through the asset repository and signs image thumbnails with the storage adapter", async () => {
    const result = await material.listAssets({ caseId: CASE_ID });
    expect(result).toEqual(
      ok([{ id: ASSET_ID, kind: "image", originalFileName: "a.png", contentType: "image/png", sizeBytes: 10, createdAt: "2026-10-13T10:00:00Z", isFavourite: false, thumbnailUrl: "https://storage.test/get", thumbnailPending: true }]),
    );
    expect(m.repo.listLive).toHaveBeenCalledWith(CASE_ID);
    expect(m.liveSubjects).toHaveBeenCalledWith({ kind: "rendition", subjectIds: [ASSET_ID] });
    expect(m.storage.presignDownloads).toHaveBeenCalledWith([{ caseId: CASE_ID, assetId: ASSET_ID, contentType: "image/png" }], 900);
    expect(m.recordEvent).not.toHaveBeenCalled();
  });

  it("saveDetailsField saves through the details form repository and records details_saved { field }", async () => {
    expect(await material.saveDetailsField(actor, detailsInput)).toEqual(ok({ field: "context", text: "Bando PNRR" }));
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    expect(m.form.saveField).toHaveBeenCalledWith(CASE_ID, "context", "Bando PNRR", actor.id);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "details_saved", data: { field: "context" } });
  });

  it("saveCaseResults saves through the details form repository and records details_saved { field: 'results' }", async () => {
    const results = [{ label: "Iscritti", value: "+30%" }];
    expect(await material.saveCaseResults(actor, { caseId: CASE_ID, results })).toEqual(ok({ results }));
    expect(m.form.saveResults).toHaveBeenCalledWith(CASE_ID, results, actor.id);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "details_saved", data: { field: "results" } });
  });

  it("saveCaseResults applies the client's limits: a value of 21 characters is INVALID_INPUT", async () => {
    const result = await material.saveCaseResults(actor, { caseId: CASE_ID, results: [{ label: "Iscritti", value: "x".repeat(21) }] });
    expect(result.ok ? "OK" : result.error.code).toBe("INVALID_INPUT");
    expect(m.form.saveResults).not.toHaveBeenCalled();
  });

  it("saveCaseTestimonial saves through the details form repository and records details_saved { field: 'testimonial' }", async () => {
    expect(await material.saveCaseTestimonial(actor, { caseId: CASE_ID, quote: "Sì.", author: "Anna" })).toEqual(
      ok({ quote: "Sì.", author: "Anna" }),
    );
    expect(m.form.saveTestimonial).toHaveBeenCalledWith(CASE_ID, "Sì.", "Anna", actor.id);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "details_saved", data: { field: "testimonial" } });
  });

  it.each([
    ["a quote of 601 characters", { quote: "x".repeat(601), author: "" }],
    ["an author of 121 characters", { quote: "Sì.", author: "x".repeat(121) }],
  ])("saveCaseTestimonial applies the client's limits: %s is INVALID_INPUT", async (_label, input) => {
    const result = await material.saveCaseTestimonial(actor, { caseId: CASE_ID, ...input });
    expect(result.ok ? "OK" : result.error.code).toBe("INVALID_INPUT");
    expect(m.form.saveTestimonial).not.toHaveBeenCalled();
  });

  it("getDetailsForm reads the details form repository", async () => {
    expect(await material.getDetailsForm({ caseId: CASE_ID })).toEqual(
      ok({ context: "Bando PNRR", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }),
    );
    expect(m.form.read).toHaveBeenCalledWith(CASE_ID);
  });

  it("resolveRefs resolves form_field refs through the details form repository", async () => {
    const refs = [{ kind: "form_field", id: "context" }];
    expect(await material.resolveRefs(CASE_ID, refs)).toEqual(ok([{ ref: refs[0], text: "Bando PNRR" }]));
    expect(m.form.read).toHaveBeenCalledWith(CASE_ID);
  });

  it("setFavourite reads the asset, sets the flag and records asset_favourited through case-study", async () => {
    expect(await material.setFavourite(actor, { ...ref, isFavourite: true })).toEqual(ok(undefined));
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    expect(m.repo.get).toHaveBeenCalledWith(CASE_ID, ASSET_ID);
    expect(m.repo.setFavourite).toHaveBeenCalledExactlyOnceWith(CASE_ID, ASSET_ID, true);
    expect(m.recordEvent).toHaveBeenCalledWith(actor, { caseId: CASE_ID, type: "asset_favourited", data: { assetId: ASSET_ID } });
  });

  it("re-exports the favourite event types", () => {
    expect(material.ASSET_FAVOURITED).toBe("asset_favourited");
    expect(material.ASSET_UNFAVOURITED).toBe("asset_unfavourited");
  });

  it("hasMaterial asks the asset repository's has_material", async () => {
    expect(await material.hasMaterial(CASE_ID)).toEqual(ok(true));
    expect(m.repo.hasMaterial).toHaveBeenCalledWith(CASE_ID);
  });

  it("buildManifest lists the live assets with size and content type, plus a sha256 of the form values", async () => {
    const first = await material.buildManifest(CASE_ID);
    expect(first).toEqual(
      ok({ assets: [{ id: ASSET_ID, sizeBytes: 10, contentType: "image/png" }], formHash: expect.stringMatching(/^[0-9a-f]{64}$/) }),
    );
    expect(m.get).toHaveBeenCalledWith(CASE_ID);
    // Same values, same hash; a changed form value, another one. Favourites do not count.
    m.repo.listLive.mockResolvedValueOnce(
      ok([{ id: ASSET_ID, caseId: CASE_ID, kind: "image", originalFileName: "b.png", contentType: "image/png", sizeBytes: 10, createdBy: actor.id, createdAt: "x", deletedAt: null, isFavourite: true }]),
    );
    expect(await material.buildManifest(CASE_ID)).toEqual(first);
    m.form.read.mockResolvedValueOnce(ok({ context: "Altro", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" }));
    const changed = await material.buildManifest(CASE_ID);
    expect(changed.ok && first.ok && changed.value.formHash !== first.value.formHash).toBe(true);
  });

  it("buildManifest passes on an unknown case, a bad id and a failed read", async () => {
    expect((await material.buildManifest("nope")).ok).toBe(false);
    m.get.mockResolvedValueOnce(err({ code: "NOT_FOUND", message: "x" }));
    expect(await material.buildManifest(CASE_ID)).toEqual(err({ code: "NOT_FOUND", message: "x" }));
    m.repo.listLive.mockResolvedValueOnce(err({ code: "ASSET_LOOKUP_FAILED", message: "x" }));
    expect(await material.buildManifest(CASE_ID)).toEqual(err({ code: "ASSET_LOOKUP_FAILED", message: "x" }));
  });

  it.each([
    ["buildManifest", () => material.buildManifest(CASE_ID)],
    ["hasMaterial", () => material.hasMaterial(CASE_ID)],
    ["saveDetailsField", () => material.saveDetailsField(actor, detailsInput)],
    ["getDetailsForm", () => material.getDetailsForm({ caseId: CASE_ID })],
    ["resolveRefs", () => material.resolveRefs(CASE_ID, [{ kind: "form_field", id: "solution" }])],
    ["saveCaseResults", () => material.saveCaseResults(actor, { caseId: CASE_ID, results: [] })],
    ["saveCaseTestimonial", () => material.saveCaseTestimonial(actor, { caseId: CASE_ID, quote: "", author: "" })],
    ["setFavourite", () => material.setFavourite(actor, { ...ref, isFavourite: true })],
  ])("%s never touches storage", async (_name, call) => {
    expect((await call()).ok).toBe(true);
    expect(m.createSupabaseObjectStorage).not.toHaveBeenCalled();
    for (const fn of Object.values(m.storage)) expect(fn).not.toHaveBeenCalled();
  });
});
