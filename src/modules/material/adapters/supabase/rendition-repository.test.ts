import { describe, expect, it, vi } from "vitest";
import { createSupabaseRenditionRepository } from "./rendition-repository";

const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const HASH = "0123456789abcdef";
const PATH = `cases/aaaaaaaa-0000-4000-8000-000000000001/assets/${ASSET_ID}/renditions/${HASH}.webp`;

const row = (over: Record<string, unknown> = {}) => ({
  asset_id: ASSET_ID,
  spec_hash: HASH,
  path: PATH,
  content_type: "image/webp",
  width: 480,
  height: 320,
  size_bytes: 1234,
  created_at: "2026-10-20T10:00:00+00:00",
  ...over,
});

const input = { assetId: ASSET_ID, specHash: HASH, path: PATH, contentType: "image/webp" as const, width: 480, height: 320, sizeBytes: 1234 };
const mapped = { assetId: ASSET_ID, specHash: HASH, path: PATH, contentType: "image/webp", width: 480, height: 320, sizeBytes: 1234, createdAt: "2026-10-20T10:00:00+00:00" };

function stubClient(response: { data?: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const step = () => vi.fn(() => builder);
  const calls = { select: step(), eq: step(), in: step(), maybeSingle: step() };
  Object.assign(builder, calls, { then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => response);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseRenditionRepository>[0];
  return { factory, from, rpc, ...calls };
}

const quiet = async (run: () => Promise<void>) => {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await run();
  } finally {
    write.mockRestore();
  }
};

describe("createSupabaseRenditionRepository", () => {
  it("listForAsset reads the asset's rows", async () => {
    const stub = stubClient({ data: [row()], error: null });
    expect(await createSupabaseRenditionRepository(stub.factory).listForAsset(ASSET_ID)).toEqual({ ok: true, value: [mapped] });
    expect(stub.from).toHaveBeenCalledWith("rendition");
    expect(stub.eq).toHaveBeenCalledWith("asset_id", ASSET_ID);
  });

  it("listFor reads several assets and spec hashes in one query; nothing to read makes no query", async () => {
    const stub = stubClient({ data: [row()], error: null });
    const repo = createSupabaseRenditionRepository(stub.factory);
    expect(await repo.listFor([ASSET_ID], [HASH])).toEqual({ ok: true, value: [mapped] });
    expect(stub.in).toHaveBeenCalledWith("asset_id", [ASSET_ID]);
    expect(stub.in).toHaveBeenCalledWith("spec_hash", [HASH]);
    expect(await repo.listFor([], [HASH])).toEqual({ ok: true, value: [] });
    expect(stub.from).toHaveBeenCalledOnce();
  });

  it("get returns one row or null", async () => {
    expect(await createSupabaseRenditionRepository(stubClient({ data: row(), error: null }).factory).get(ASSET_ID, HASH)).toEqual({ ok: true, value: mapped });
    expect(await createSupabaseRenditionRepository(stubClient({ data: null, error: null }).factory).get(ASSET_ID, HASH)).toEqual({ ok: true, value: null });
  });

  it("rejects a row outside the domain", async () => {
    const stub = stubClient({ data: [row({ content_type: "image/png" })], error: null });
    expect(await createSupabaseRenditionRepository(stub.factory).listForAsset(ASSET_ID)).toMatchObject({ ok: false, error: { code: "RENDITION_INVALID" } });
  });

  it("a failed read is RENDITION_LOOKUP_FAILED", async () => {
    await quiet(async () => {
      const stub = stubClient({ data: null, error: { code: "08006" } });
      expect(await createSupabaseRenditionRepository(stub.factory).get(ASSET_ID, HASH)).toMatchObject({ ok: false, error: { code: "RENDITION_LOOKUP_FAILED" } });
    });
  });

  it("upsert calls upsert_rendition and maps the row", async () => {
    const stub = stubClient({ data: row(), error: null });
    expect(await createSupabaseRenditionRepository(stub.factory).upsert(input)).toEqual({
      ok: true,
      value: mapped,
    });
    expect(stub.rpc).toHaveBeenCalledWith("upsert_rendition", {
      p_asset_id: ASSET_ID,
      p_spec_hash: HASH,
      p_path: PATH,
      p_content_type: "image/webp",
      p_width: 480,
      p_height: 320,
      p_size_bytes: 1234,
    });
  });

  it.each([
    [{ code: "P0001", message: "NOT_FOUND" }, "NOT_FOUND"],
    [{ code: "P0001", message: "RENDITION_PATH_INVALID" }, "RENDITION_WRITE_FAILED"],
    [{ code: "08006", message: "down" }, "RENDITION_WRITE_FAILED"],
  ])("upsert maps %j to %s", async (error, code) => {
    await quiet(async () => {
      const stub = stubClient({ data: null, error });
      const result = await createSupabaseRenditionRepository(stub.factory).upsert(input);
      expect(result).toMatchObject({ ok: false, error: { code } });
    });
  });
});
