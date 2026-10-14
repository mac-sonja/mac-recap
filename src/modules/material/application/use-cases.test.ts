import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { Asset } from "@/modules/material/domain/asset";
import { MAX_FILE_BYTES } from "@/modules/material/domain/files";
import type { AssetRepository, NewAsset } from "@/modules/material/ports/asset-repository";
import type { DetailsFormRepository } from "@/modules/material/ports/details-form-repository";
import type { ObjectStorage, StoredObject } from "@/modules/material/ports/object-storage";
import { err, ok } from "@/shared/result";
import { makeConfirmUpload } from "./confirm-upload";
import { makeHasMaterial } from "./has-material";
import { makeListAssets } from "./list-assets";
import type { CaseStudies, MaterialDeps } from "./deps";
import { makePresignUpload } from "./presign-upload";
import { makeRemoveAsset } from "./remove-asset";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const DELETED_CASE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const NEW_ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const MB = 1024 * 1024;
const PNG = "image/png";

/**
 * In-memory material world: a live case and a soft-deleted one, assets that
 * mirror `create_asset` / `restore_asset` (cap of 20 non-deleted) and `has_material`, stored S3
 * objects by asset id, and the recorded events.
 */
function world({ live = 0, removed = 0 }: { live?: number; removed?: number } = {}) {
  const assets = new Map<string, Asset>();
  const objects = new Map<string, StoredObject>();
  const events: { caseId: string; type: string; data: Record<string, string | string[]>; actorId: string }[] = [];
  let n = 0;
  const seed = (deletedAt: string | null) => {
    const id = `cccccccc-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    assets.set(id, {
      id,
      caseId: CASE_ID,
      kind: "image",
      originalFileName: `seed-${n}.png`,
      contentType: PNG,
      sizeBytes: 10,
      createdBy: actor.id,
      createdAt: "2026-10-13T10:00:00Z",
      deletedAt,
    });
    return id;
  };
  for (let i = 0; i < live; i++) seed(null);
  for (let i = 0; i < removed; i++) seed("2026-10-13T11:00:00Z");
  const liveCount = (caseId: string) => [...assets.values()].filter((a) => a.caseId === caseId && a.deletedAt === null).length;

  const repo = {
    listLive: vi.fn<AssetRepository["listLive"]>(async (caseId) =>
      ok([...assets.values()].filter((a) => a.caseId === caseId && a.deletedAt === null)),
    ),
    countLive: vi.fn<AssetRepository["countLive"]>(async (caseId) => ok(liveCount(caseId))),
    create: vi.fn<AssetRepository["create"]>(async (a: NewAsset) => {
      if (liveCount(a.caseId) >= 20) return err({ code: "FILE_LIMIT_REACHED", message: "cap" });
      if (assets.has(a.id)) return err({ code: "ASSET_ALREADY_CONFIRMED", message: "dup" });
      const row: Asset = { ...a, createdAt: "2026-10-13T12:00:00Z", deletedAt: null };
      assets.set(a.id, row);
      return ok(row);
    }),
    softDelete: vi.fn<AssetRepository["softDelete"]>(async (caseId, assetId) => {
      const row = assets.get(assetId);
      if (!row || row.caseId !== caseId || row.deletedAt !== null) return ok(false);
      assets.set(assetId, { ...row, deletedAt: "2026-10-13T13:00:00Z" });
      return ok(true);
    }),
    undoSoftDelete: vi.fn<AssetRepository["undoSoftDelete"]>(async (caseId, assetId) => {
      const row = assets.get(assetId);
      if (!row || row.caseId !== caseId) return err({ code: "NOT_FOUND", message: "none" });
      if (row.deletedAt === null) return ok(false);
      if (liveCount(caseId) >= 20) return err({ code: "FILE_LIMIT_REACHED", message: "cap" });
      assets.set(assetId, { ...row, deletedAt: null });
      return ok(true);
    }),
    hasMaterial: vi.fn<AssetRepository["hasMaterial"]>(async (caseId) => ok(caseId === CASE_ID && liveCount(caseId) > 0)),
  } satisfies AssetRepository;

  const storage = {
    presignUpload: vi.fn<ObjectStorage["presignUpload"]>(async (target, maxBytes) =>
      ok({ url: "https://bucket.s3.example/", fields: { key: `k/${target.assetId}`, "Content-Type": target.contentType, max: String(maxBytes) } }),
    ),
    presignDownload: vi.fn<ObjectStorage["presignDownload"]>(async (target, ttl) =>
      ok(`https://bucket.s3.example/${target.assetId}?ttl=${ttl}`),
    ),
    head: vi.fn<ObjectStorage["head"]>(async (target) => ok(objects.get(target.assetId) ?? null)),
  } satisfies ObjectStorage;

  const cases = {
    get: vi.fn<CaseStudies["get"]>(async (id) =>
      id === CASE_ID ? ok({ id }) : err({ code: "NOT_FOUND", message: "No case study with this id." }),
    ),
    recordEvent: vi.fn<CaseStudies["recordEvent"]>(async (who, input) => {
      events.push({ ...input, actorId: who.id });
      return ok({});
    }),
  } satisfies CaseStudies;

  const deps: MaterialDeps = { assets: repo, form: unusedForm, storage, cases, newId: () => NEW_ASSET_ID };
  return { deps, repo, storage, cases, assets, objects, events, seed };
}

/** Asset use cases never touch the details form. */
const unusedForm = new Proxy({} as DetailsFormRepository, {
  get: (_target, name) => () => {
    throw new Error(`asset use case called form.${String(name)}`);
  },
});

const codeOf = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);

describe("presignUpload", () => {
  const input = { caseId: CASE_ID, contentType: PNG, sizeBytes: 2 * MB };

  it("returns { assetId, url, fields } for a draft case with 3 assets; nothing stored", async () => {
    const w = world({ live: 3 });
    const result = await makePresignUpload(w.deps)(actor, input);
    expect(result).toEqual(ok({ assetId: NEW_ASSET_ID, url: "https://bucket.s3.example/", fields: expect.any(Object) }));
    expect(w.storage.presignUpload).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: NEW_ASSET_ID, contentType: PNG }, MAX_FILE_BYTES);
    expect(w.assets.size).toBe(3);
    expect(w.repo.create).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it("accepts exactly 100 MB", async () => {
    expect(codeOf(await makePresignUpload(world().deps)(actor, { ...input, sizeBytes: MAX_FILE_BYTES }))).toBe("OK");
  });

  it.each([
    ["a bad type", { ...input, contentType: "application/zip" }, "FILE_TYPE_NOT_ALLOWED"],
    ["a declared 101 MB", { ...input, sizeBytes: 101 * MB }, "FILE_TOO_LARGE"],
    ["100 MB + 1 byte", { ...input, sizeBytes: MAX_FILE_BYTES + 1 }, "FILE_TOO_LARGE"],
    ["an empty file", { ...input, sizeBytes: 0 }, "INVALID_INPUT"],
    ["a malformed case id", { ...input, caseId: "nope" }, "INVALID_INPUT"],
    ["a soft-deleted case", { ...input, caseId: DELETED_CASE_ID }, "NOT_FOUND"],
  ])("%s → %s; no POST issued", async (_label, bad, code) => {
    const w = world();
    expect(codeOf(await makePresignUpload(w.deps)(actor, bad))).toBe(code);
    expect(w.storage.presignUpload).not.toHaveBeenCalled();
  });

  it("the 21st file → FILE_LIMIT_REACHED; removed assets don't count", async () => {
    const full = world({ live: 20 });
    expect(codeOf(await makePresignUpload(full.deps)(actor, input))).toBe("FILE_LIMIT_REACHED");
    expect(full.storage.presignUpload).not.toHaveBeenCalled();

    const withRemoved = world({ live: 19, removed: 5 });
    expect(codeOf(await makePresignUpload(withRemoved.deps)(actor, input))).toBe("OK");
  });

  it("returns STORAGE_NOT_CONFIGURED without querying when S3 is not configured", async () => {
    const w = world();
    const result = await makePresignUpload({ ...w.deps, storage: null })(actor, input);
    expect(codeOf(result)).toBe("STORAGE_NOT_CONFIGURED");
    expect(w.cases.get).not.toHaveBeenCalled();
  });

  it("passes a presign failure through", async () => {
    const w = world();
    const failure = err({ code: "STORAGE_FAILED", message: "down" });
    w.storage.presignUpload.mockResolvedValueOnce(failure);
    expect(await makePresignUpload(w.deps)(actor, input)).toEqual(failure);
  });
});

describe("confirmUpload", () => {
  const input = { caseId: CASE_ID, assetId: NEW_ASSET_ID, contentType: PNG, fileName: " moodboard.png " };
  const uploaded = (w: ReturnType<typeof world>, object: StoredObject = { sizeBytes: 2 * MB, contentType: PNG }) =>
    w.objects.set(NEW_ASSET_ID, object);

  it("creates the asset and records asset_uploaded { assetId }; case status untouched", async () => {
    const w = world({ live: 3 });
    uploaded(w);
    const result = await makeConfirmUpload(w.deps)(actor, input);
    expect(result).toEqual(
      ok(
        expect.objectContaining({
          id: NEW_ASSET_ID,
          caseId: CASE_ID,
          kind: "image",
          originalFileName: "moodboard.png",
          contentType: PNG,
          sizeBytes: 2 * MB,
          createdBy: actor.id,
          deletedAt: null,
        }),
      ),
    );
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "asset_uploaded", data: { assetId: NEW_ASSET_ID }, actorId: actor.id }]);
    expect(w.assets.size).toBe(4);
  });

  it("uses the size read back from storage", async () => {
    const w = world();
    uploaded(w, { sizeBytes: 1234, contentType: PNG });
    const result = await makeConfirmUpload(w.deps)(actor, { ...input, sizeBytes: 1 });
    expect(result.ok && result.value.sizeBytes).toBe(1234);
  });

  it("no object (HEAD 404) → UPLOAD_NOT_FOUND; no row, no event", async () => {
    const w = world();
    expect(codeOf(await makeConfirmUpload(w.deps)(actor, input))).toBe("UPLOAD_NOT_FOUND");
    expect(w.repo.create).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it.each([
    ["HEAD over 100 MB", { sizeBytes: MAX_FILE_BYTES + 1, contentType: PNG }],
    ["an empty object", { sizeBytes: 0, contentType: PNG }],
    ["another Content-Type", { sizeBytes: 10, contentType: "image/jpeg" }],
    ["no Content-Type", { sizeBytes: 10, contentType: null }],
  ])("%s → UPLOAD_REJECTED; no row", async (_label, object) => {
    const w = world();
    uploaded(w, object);
    expect(codeOf(await makeConfirmUpload(w.deps)(actor, input))).toBe("UPLOAD_REJECTED");
    expect(w.repo.create).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it("at the cap → FILE_LIMIT_REACHED (re-checked at confirm); no event", async () => {
    const w = world({ live: 20 });
    uploaded(w);
    expect(codeOf(await makeConfirmUpload(w.deps)(actor, input))).toBe("FILE_LIMIT_REACHED");
    expect(w.assets.size).toBe(20);
    expect(w.events).toEqual([]);
  });

  it("concurrent confirms at 19 assets: exactly one succeeds, the other FILE_LIMIT_REACHED", async () => {
    const w = world({ live: 19 });
    const other = "bbbbbbbb-0000-4000-8000-000000000002";
    w.objects.set(NEW_ASSET_ID, { sizeBytes: 10, contentType: PNG });
    w.objects.set(other, { sizeBytes: 10, contentType: PNG });
    const confirm = makeConfirmUpload(w.deps);
    const results = await Promise.all([confirm(actor, input), confirm(actor, { ...input, assetId: other })]);
    expect(results.map(codeOf).sort()).toEqual(["FILE_LIMIT_REACHED", "OK"]);
    expect(w.events).toHaveLength(1);
  });

  it.each([
    ["a bad type", { ...input, contentType: "application/zip" }, "FILE_TYPE_NOT_ALLOWED"],
    ["a blank file name", { ...input, fileName: "  " }, "INVALID_INPUT"],
    ["a malformed asset id", { ...input, assetId: "x" }, "INVALID_INPUT"],
    ["a soft-deleted case", { ...input, caseId: DELETED_CASE_ID }, "NOT_FOUND"],
  ])("%s → %s without a HEAD", async (_label, bad, code) => {
    const w = world();
    uploaded(w);
    expect(codeOf(await makeConfirmUpload(w.deps)(actor, bad))).toBe(code);
    expect(w.storage.head).not.toHaveBeenCalled();
    expect(w.repo.create).not.toHaveBeenCalled();
  });

  it("STORAGE_NOT_CONFIGURED when S3 is not configured", async () => {
    expect(codeOf(await makeConfirmUpload({ ...world().deps, storage: null })(actor, input))).toBe("STORAGE_NOT_CONFIGURED");
  });

  it("if the event write fails, soft-deletes the new row and returns the error", async () => {
    const w = world();
    uploaded(w);
    const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
    w.cases.recordEvent.mockResolvedValueOnce(failure);
    expect(await makeConfirmUpload(w.deps)(actor, input)).toEqual(failure);
    expect(w.repo.softDelete).toHaveBeenCalledWith(CASE_ID, NEW_ASSET_ID);
    expect(w.assets.get(NEW_ASSET_ID)?.deletedAt).not.toBeNull();
  });

  it("passes a HEAD failure through", async () => {
    const w = world();
    const failure = err({ code: "STORAGE_FAILED", message: "down" });
    w.storage.head.mockResolvedValueOnce(failure);
    expect(await makeConfirmUpload(w.deps)(actor, input)).toEqual(failure);
  });
});

describe("removeAsset", () => {
  it("soft-deletes a live asset and records asset_removed { assetId }", async () => {
    const w = world();
    const id = w.seed(null);
    expect(await makeRemoveAsset(w.deps)(actor, { caseId: CASE_ID, assetId: id })).toEqual(ok(undefined));
    expect(w.assets.get(id)?.deletedAt).not.toBeNull();
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "asset_removed", data: { assetId: id }, actorId: actor.id }]);
  });

  it.each([
    ["an unknown asset", () => "dddddddd-0000-4000-8000-000000000009"],
    ["an already removed asset", (w: ReturnType<typeof world>) => w.seed("2026-10-13T11:00:00Z")],
  ])("%s → NOT_FOUND; no event", async (_label, pick) => {
    const w = world();
    const id = pick(w);
    expect(codeOf(await makeRemoveAsset(w.deps)(actor, { caseId: CASE_ID, assetId: id }))).toBe("NOT_FOUND");
    expect(w.events).toEqual([]);
  });

  it("a soft-deleted case → NOT_FOUND without touching assets", async () => {
    const w = world();
    const id = w.seed(null);
    expect(codeOf(await makeRemoveAsset(w.deps)(actor, { caseId: DELETED_CASE_ID, assetId: id }))).toBe("NOT_FOUND");
    expect(w.repo.softDelete).not.toHaveBeenCalled();
  });

  it("if the event write fails, undoes the soft delete and returns the error", async () => {
    const w = world();
    const id = w.seed(null);
    const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
    w.cases.recordEvent.mockResolvedValueOnce(failure);
    expect(await makeRemoveAsset(w.deps)(actor, { caseId: CASE_ID, assetId: id })).toEqual(failure);
    expect(w.assets.get(id)?.deletedAt).toBeNull();
  });
});

describe("hasMaterial", () => {
  it("none: no assets → false", async () => {
    expect(await makeHasMaterial(world().deps)(CASE_ID)).toEqual(ok(false));
  });

  it("one live asset → true", async () => {
    expect(await makeHasMaterial(world({ live: 1 }).deps)(CASE_ID)).toEqual(ok(true));
  });

  it("only removed files → false", async () => {
    expect(await makeHasMaterial(world({ removed: 2 }).deps)(CASE_ID)).toEqual(ok(false));
  });

  it("a malformed case id → INVALID_INPUT without a query", async () => {
    const w = world();
    expect(codeOf(await makeHasMaterial(w.deps)("nope"))).toBe("INVALID_INPUT");
    expect(w.repo.hasMaterial).not.toHaveBeenCalled();
  });

  it("passes a lookup failure through", async () => {
    const w = world();
    const failure = err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" });
    w.repo.hasMaterial.mockResolvedValueOnce(failure);
    expect(await makeHasMaterial(w.deps)(CASE_ID)).toEqual(failure);
  });
});

describe("every use case", () => {
  it.each([
    ["remove", makeRemoveAsset],
  ] as const)("%s returns STORAGE_NOT_CONFIGURED when S3 is not configured", async (_label, make) => {
    const w = world();
    expect(codeOf(await make({ ...w.deps, storage: null })(actor, { caseId: CASE_ID, assetId: NEW_ASSET_ID }))).toBe(
      "STORAGE_NOT_CONFIGURED",
    );
    expect(w.cases.get).not.toHaveBeenCalled();
  });
});

describe("listAssets", () => {
  /** Puts one asset of `kind` into the world, created at `createdAt`. */
  function put(w: ReturnType<typeof world>, id: string, over: Partial<Asset>) {
    w.assets.set(id, {
      id,
      caseId: CASE_ID,
      kind: "image",
      originalFileName: `${id.slice(0, 4)}.png`,
      contentType: PNG,
      sizeBytes: 10,
      createdBy: actor.id,
      createdAt: "2026-10-13T10:00:00Z",
      deletedAt: null,
      ...over,
    });
  }
  const IMG = "dddddddd-0000-4000-8000-000000000001";
  const PDF = "dddddddd-0000-4000-8000-000000000002";
  const MOV = "dddddddd-0000-4000-8000-000000000003";
  const GONE = "dddddddd-0000-4000-8000-000000000004";

  function filled() {
    const w = world();
    put(w, IMG, {});
    put(w, PDF, { kind: "document", contentType: "application/pdf", originalFileName: "brief.pdf", sizeBytes: 2 * MB });
    put(w, MOV, { kind: "video", contentType: "video/quicktime", originalFileName: "spot.mov" });
    put(w, GONE, { deletedAt: "2026-10-13T11:00:00Z" });
    return w;
  }

  it("lists live assets with a 15-minute presigned GET for images only; removed ones are left out", async () => {
    const w = filled();
    const result = await makeListAssets(w.deps)({ caseId: CASE_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((a) => [a.id, a.kind, a.thumbnailUrl])).toEqual([
      [IMG, "image", `https://bucket.s3.example/${IMG}?ttl=900`],
      [PDF, "document", null],
      [MOV, "video", null],
    ]);
    expect(result.value[1]).toEqual({
      id: PDF,
      kind: "document",
      originalFileName: "brief.pdf",
      contentType: "application/pdf",
      sizeBytes: 2 * MB,
      createdAt: "2026-10-13T10:00:00Z",
      thumbnailUrl: null,
    });
    expect(w.storage.presignDownload).toHaveBeenCalledOnce();
    expect(w.storage.presignDownload).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: IMG, contentType: PNG }, 900);
  });

  it("keeps the repository's order (oldest first)", async () => {
    const w = filled();
    w.repo.listLive.mockResolvedValueOnce(ok([...w.assets.values()].filter((a) => a.deletedAt === null).reverse()));
    const result = await makeListAssets(w.deps)({ caseId: CASE_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((a) => a.id)).toEqual([MOV, PDF, IMG]);
  });

  it("returns [] for a case without files", async () => {
    expect(await makeListAssets(world().deps)({ caseId: CASE_ID })).toEqual(ok([]));
  });

  it("still lists when S3 isn't configured, with every thumbnailUrl null", async () => {
    const w = filled();
    const result = await makeListAssets({ ...w.deps, storage: null })({ caseId: CASE_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((a) => a.thumbnailUrl)).toEqual([null, null, null]);
  });

  it("writes nothing and records no event", async () => {
    const w = filled();
    await makeListAssets(w.deps)({ caseId: CASE_ID });
    expect(w.repo.create).not.toHaveBeenCalled();
    expect(w.repo.softDelete).not.toHaveBeenCalled();
    expect(w.repo.undoSoftDelete).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it("a soft-deleted case → NOT_FOUND without listing", async () => {
    const w = filled();
    const result = await makeListAssets(w.deps)({ caseId: DELETED_CASE_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(w.repo.listLive).not.toHaveBeenCalled();
  });

  it.each([{ caseId: "nope" }, {}, "x", undefined])("malformed input %j → INVALID_INPUT without a query", async (input) => {
    const w = filled();
    const result = await makeListAssets(w.deps)(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
    expect(w.cases.get).not.toHaveBeenCalled();
  });

  it("passes a lookup failure through", async () => {
    const w = filled();
    w.repo.listLive.mockResolvedValueOnce(err({ code: "ASSET_LOOKUP_FAILED", message: "down" }));
    expect(await makeListAssets(w.deps)({ caseId: CASE_ID })).toEqual(err({ code: "ASSET_LOOKUP_FAILED", message: "down" }));
  });

  it("passes a signing failure through", async () => {
    const w = filled();
    w.storage.presignDownload.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "no creds" }));
    const result = await makeListAssets(w.deps)({ caseId: CASE_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("STORAGE_FAILED");
  });
});
