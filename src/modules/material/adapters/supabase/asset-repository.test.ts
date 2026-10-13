import { describe, expect, it, vi } from "vitest";
import { createSupabaseAssetRepository } from "./asset-repository";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";

const row = (over: Record<string, unknown> = {}) => ({
  id: ASSET_ID,
  case_id: CASE_ID,
  kind: "image",
  original_file_name: "moodboard.png",
  content_type: "image/png",
  size_bytes: 2048,
  s3_key: `cases/${CASE_ID}/assets/${ASSET_ID}/original.png`,
  created_by: ACTOR_ID,
  created_at: "2026-10-13T10:00:00+00:00",
  deleted_at: null,
  ...over,
});

/** Stub of `rpc()` and `from().select|update().eq().is()…`: every step returns the builder, which awaits to `response`. */
function stubClient(response: { data?: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  const step = () => vi.fn(() => builder);
  const calls = { select: step(), update: step(), eq: step(), is: step(), order: step() };
  Object.assign(builder, calls, { then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => response);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseAssetRepository>[0];
  return { factory, from, rpc, ...calls };
}

const newAsset = {
  id: ASSET_ID,
  caseId: CASE_ID,
  kind: "image" as const,
  originalFileName: "moodboard.png",
  contentType: "image/png" as const,
  sizeBytes: 2048,
  createdBy: ACTOR_ID,
};

describe("createSupabaseAssetRepository", () => {
  it("create calls create_asset with the key built from the content type", async () => {
    const stub = stubClient({ data: row(), error: null });
    const result = await createSupabaseAssetRepository(stub.factory).create(newAsset);
    expect(stub.rpc).toHaveBeenCalledWith("create_asset", {
      p_id: ASSET_ID,
      p_case_id: CASE_ID,
      p_kind: "image",
      p_original_file_name: "moodboard.png",
      p_content_type: "image/png",
      p_size_bytes: 2048,
      p_s3_key: `cases/${CASE_ID}/assets/${ASSET_ID}/original.png`,
      p_actor_id: ACTOR_ID,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        id: ASSET_ID,
        caseId: CASE_ID,
        kind: "image",
        originalFileName: "moodboard.png",
        contentType: "image/png",
        sizeBytes: 2048,
        createdBy: ACTOR_ID,
        createdAt: "2026-10-13T10:00:00+00:00",
        deletedAt: null,
      },
    });
  });

  it.each([
    [{ code: "P0001", message: "FILE_LIMIT_REACHED" }, "FILE_LIMIT_REACHED"],
    [{ code: "P0001", message: "NOT_FOUND" }, "NOT_FOUND"],
    [{ code: "P0001", message: "ASSET_ALREADY_CONFIRMED" }, "ASSET_ALREADY_CONFIRMED"],
    [{ code: "23505", message: "duplicate key" }, "ASSET_ALREADY_CONFIRMED"],
    [{ code: "P0001", message: "something else" }, "ASSET_WRITE_FAILED"],
    [{ code: "PGRST000", message: "down" }, "ASSET_WRITE_FAILED"],
  ])("create maps %o to %s", async (error, code) => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await createSupabaseAssetRepository(stubClient({ data: null, error }).factory).create(newAsset);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(code);
    } finally {
      write.mockRestore();
    }
  });

  it("create rejects a row outside the domain", async () => {
    const stub = stubClient({ data: row({ content_type: "application/zip" }), error: null });
    const result = await createSupabaseAssetRepository(stub.factory).create(newAsset);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ASSET_INVALID");
  });

  it("listLive reads the live assets of the case, oldest first then by id", async () => {
    const second = { ...row(), id: "bbbbbbbb-0000-4000-8000-000000000002", created_at: "2026-10-13T11:00:00+00:00" };
    const stub = stubClient({ data: [row(), second], error: null });
    const result = await createSupabaseAssetRepository(stub.factory).listLive(CASE_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((a) => a.id)).toEqual([ASSET_ID, second.id]);
    expect(stub.from).toHaveBeenCalledWith("asset");
    expect(stub.eq).toHaveBeenCalledWith("case_id", CASE_ID);
    expect(stub.is).toHaveBeenCalledWith("deleted_at", null);
    expect(stub.order.mock.calls).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("listLive returns [] for a case without files", async () => {
    expect(await createSupabaseAssetRepository(stubClient({ data: [], error: null }).factory).listLive(CASE_ID)).toEqual({ ok: true, value: [] });
  });

  it("listLive rejects a row outside the domain", async () => {
    const stub = stubClient({ data: [row({ kind: "archive" })], error: null });
    const result = await createSupabaseAssetRepository(stub.factory).listLive(CASE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ASSET_INVALID");
  });

  it("listLive returns ASSET_LOOKUP_FAILED and logs no material when the read fails", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const stub = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
      const result = await createSupabaseAssetRepository(stub.factory).listLive(CASE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ASSET_LOOKUP_FAILED");
      const line = String(write.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({ level: "error", caseId: CASE_ID });
      expect(line).not.toContain("moodboard");
    } finally {
      write.mockRestore();
    }
  });

  it("countLive counts non-deleted assets of the case", async () => {
    const stub = stubClient({ data: null, error: null, count: 7 });
    expect(await createSupabaseAssetRepository(stub.factory).countLive(CASE_ID)).toEqual({ ok: true, value: 7 });
    expect(stub.from).toHaveBeenCalledWith("asset");
    expect(stub.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(stub.eq).toHaveBeenCalledWith("case_id", CASE_ID);
    expect(stub.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("countLive returns ASSET_LOOKUP_FAILED and logs no material when the read fails", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const stub = stubClient({ data: null, error: { code: "PGRST000", message: "down" }, count: null });
      const result = await createSupabaseAssetRepository(stub.factory).countLive(CASE_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ASSET_LOOKUP_FAILED");
      expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "error", caseId: CASE_ID });
    } finally {
      write.mockRestore();
    }
  });

  it("softDelete sets deleted_at only on a live asset of the case", async () => {
    const stub = stubClient({ data: [{ id: ASSET_ID }], error: null });
    expect(await createSupabaseAssetRepository(stub.factory).softDelete(CASE_ID, ASSET_ID)).toEqual({ ok: true, value: true });
    expect(stub.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(stub.eq.mock.calls).toEqual([
      ["id", ASSET_ID],
      ["case_id", CASE_ID],
    ]);
    expect(stub.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("softDelete returns false when no live asset matched", async () => {
    const stub = stubClient({ data: [], error: null });
    expect(await createSupabaseAssetRepository(stub.factory).softDelete(CASE_ID, ASSET_ID)).toEqual({ ok: true, value: false });
  });

  it.each([
    [true, { ok: true, value: true }],
    [false, { ok: true, value: false }],
  ])("restore returns the function's %s", async (data, expected) => {
    const stub = stubClient({ data, error: null });
    expect(await createSupabaseAssetRepository(stub.factory).restore(CASE_ID, ASSET_ID)).toEqual(expected);
    expect(stub.rpc).toHaveBeenCalledWith("restore_asset", { p_case_id: CASE_ID, p_asset_id: ASSET_ID });
  });

  it.each([
    ["FILE_LIMIT_REACHED", "FILE_LIMIT_REACHED"],
    ["NOT_FOUND", "NOT_FOUND"],
  ])("restore maps the %s refusal", async (message, code) => {
    const stub = stubClient({ data: null, error: { code: "P0001", message } });
    const result = await createSupabaseAssetRepository(stub.factory).restore(CASE_ID, ASSET_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });
});
