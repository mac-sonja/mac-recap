import { StorageApiError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseObjectStorage, MATERIAL_BUCKET } from "./object-storage";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const target = { caseId: CASE_ID, assetId: ASSET_ID, contentType: "video/quicktime" as const };
const KEY = `cases/${CASE_ID}/assets/${ASSET_ID}/original.mov`;
const SIGNED_UPLOAD = `https://project.supabase.co/storage/v1/object/upload/sign/material/${KEY}?token=t`;

/** Stub of `client.storage.from(bucket)`: each call answers `{ data, error }` like supabase-js. */
function stubClient() {
  type Answer<T> = Promise<{ data: T | null; error: unknown }>;
  const bucket = {
    createSignedUploadUrl: vi.fn<(path: string) => Answer<{ signedUrl: string; token: string; path: string }>>(async (path) => ({
      data: { signedUrl: SIGNED_UPLOAD, token: "t", path },
      error: null,
    })),
    createSignedUrl: vi.fn<(path: string, ttl: number) => Answer<{ signedUrl: string }>>(async () => ({
      data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/material/x?token=g" },
      error: null,
    })),
    createSignedUrls: vi.fn<(paths: string[], ttl: number) => Answer<{ error: string | null; path: string | null; signedUrl: string | null }[]>>(
      async (paths) => ({
        data: paths.map((path) => ({ error: null, path, signedUrl: `https://project.supabase.co/sign/${path}?token=g` })),
        error: null,
      }),
    ),
    info: vi.fn<(path: string) => Answer<{ size?: number; contentType?: string }>>(async () => ({
      data: { size: 42, contentType: "video/quicktime" },
      error: null,
    })),
    download: vi.fn<(path: string) => Answer<Blob>>(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
    upload: vi.fn<(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => Answer<{ path: string }>>(
      async (path) => ({ data: { path }, error: null }),
    ),
  };
  const from = vi.fn(() => bucket);
  const build = vi.fn(() => ({ storage: { from } }));
  const factory = build as unknown as Parameters<typeof createSupabaseObjectStorage>[0];
  return { factory, build, from, bucket };
}

/** Captures stdout (the logger) for the duration of `run`. */
async function capturingLogs(run: (write: ReturnType<typeof vi.spyOn>) => Promise<void>) {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await run(write);
  } finally {
    write.mockRestore();
  }
}

/** Stands for supabase-js throwing (a network error), not answering `{ error }`. */
const THROWS = "throws" as const;

const apiError = (status: number, message = "boom", statusCode = String(status)) => new StorageApiError(message, status, statusCode);

describe("createSupabaseObjectStorage", () => {
  it("presigns an upload of the asset key that PUTs with the content type and no upsert", async () => {
    const stub = stubClient();
    const result = await createSupabaseObjectStorage(stub.factory).presignUpload(target, 100);
    expect(result).toEqual({
      ok: true,
      value: { url: SIGNED_UPLOAD, method: "PUT", headers: { "content-type": "video/quicktime", "x-upsert": "false" } },
    });
    expect(stub.from).toHaveBeenCalledWith(MATERIAL_BUCKET);
    expect(MATERIAL_BUCKET).toBe("material");
    // Called with the path alone: never `{ upsert: true }`, so an existing object is never overwritten.
    expect(stub.bucket.createSignedUploadUrl).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(stub.bucket.createSignedUploadUrl.mock.calls[0]).toHaveLength(1);
  });

  it.each([
    ["an API error", { data: null, error: apiError(500) }],
    ["a thrown network error", THROWS],
  ])("presignUpload returns STORAGE_FAILED on %s and logs only the case id", async (_label, answer) => {
    await capturingLogs(async (write) => {
      const stub = stubClient();
      stub.bucket.createSignedUploadUrl.mockImplementationOnce(async () => (answer === THROWS ? Promise.reject(new TypeError("fetch failed")) : answer) as never);
      const result = await createSupabaseObjectStorage(stub.factory).presignUpload(target, 100);
      expect(result).toEqual({ ok: false, error: { code: "STORAGE_FAILED", message: "Could not prepare the upload." } });
      const line = String(write.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({ level: "error", caseId: CASE_ID });
      expect(JSON.parse(line).msg).toMatch(/^storage presign failed: /);
      expect(line).not.toContain(ASSET_ID);
    });
  });

  it("head reads the object's stored size and type", async () => {
    const stub = stubClient();
    expect(await createSupabaseObjectStorage(stub.factory).head(target)).toEqual({
      ok: true,
      value: { sizeBytes: 42, contentType: "video/quicktime" },
    });
    expect(stub.bucket.info).toHaveBeenCalledExactlyOnceWith(KEY);
  });

  it("head maps missing metadata to size 0 and a null type (rejected at confirm)", async () => {
    const stub = stubClient();
    stub.bucket.info.mockResolvedValueOnce({ data: {}, error: null });
    expect(await createSupabaseObjectStorage(stub.factory).head(target)).toEqual({ ok: true, value: { sizeBytes: 0, contentType: null } });
  });

  it.each([
    ["a 404", apiError(404)],
    ["a 400 with statusCode 404", apiError(400, "boom", "404")],
    ["a 400 saying Object not found", apiError(400, "Object not found", "400")],
  ])("head returns null for %s (no such object)", async (_label, error) => {
    const stub = stubClient();
    stub.bucket.info.mockResolvedValueOnce({ data: null, error });
    expect(await createSupabaseObjectStorage(stub.factory).head(target)).toEqual({ ok: true, value: null });
  });

  it.each([
    ["a 400", { data: null, error: apiError(400, "Invalid key", "InvalidKey") }],
    ["a 403", { data: null, error: apiError(403) }],
    ["a 500", { data: null, error: apiError(500) }],
    ["a thrown network error", THROWS],
  ])("head returns STORAGE_FAILED for %s, logged with its status", async (label, answer) => {
    await capturingLogs(async (write) => {
      const stub = stubClient();
      stub.bucket.info.mockImplementationOnce(async () => (answer === THROWS ? Promise.reject(new TypeError("fetch failed")) : answer) as never);
      const result = await createSupabaseObjectStorage(stub.factory).head(target);
      expect(result).toEqual({ ok: false, error: { code: "STORAGE_FAILED", message: "Could not check the upload." } });
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "error", caseId: CASE_ID });
      expect(entry.msg).toBe(`storage head failed: ${label === "a thrown network error" ? "TypeError" : label.slice(2)}`);
    });
  });

  it("presignDownload signs a GET of the asset key for the given seconds", async () => {
    const stub = stubClient();
    const result = await createSupabaseObjectStorage(stub.factory).presignDownload(target, 900);
    expect(result).toEqual({ ok: true, value: "https://project.supabase.co/storage/v1/object/sign/material/x?token=g" });
    expect(stub.bucket.createSignedUrl).toHaveBeenCalledExactlyOnceWith(KEY, 900);
  });

  it("presignDownload returns STORAGE_FAILED and logs no key", async () => {
    await capturingLogs(async (write) => {
      const stub = stubClient();
      stub.bucket.createSignedUrl.mockResolvedValueOnce({ data: null, error: apiError(502) });
      const result = await createSupabaseObjectStorage(stub.factory).presignDownload(target, 900);
      expect(result).toEqual({ ok: false, error: { code: "STORAGE_FAILED", message: "Could not prepare the file link." } });
      expect(write).toHaveBeenCalledOnce();
      const line = String(write.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({ level: "error", caseId: CASE_ID, msg: "storage presign get failed: 502" });
      expect(line).not.toContain(KEY);
      expect(line).not.toContain(ASSET_ID);
    });
  });

  it("presignDownloads signs every path in one call, in order, with null for an entry storage could not sign", async () => {
    await capturingLogs(async (write) => {
      const stub = stubClient();
      const other = { ...target, assetId: "bbbbbbbb-0000-4000-8000-000000000002", contentType: "image/png" as const };
      const otherKey = `cases/${CASE_ID}/assets/${other.assetId}/original.png`;
      stub.bucket.createSignedUrls.mockResolvedValueOnce({
        data: [
          { error: "Either the object does not exist or you do not have access to it", path: KEY, signedUrl: null },
          { error: null, path: otherKey, signedUrl: "https://signed/other" },
        ],
        error: null,
      });
      const result = await createSupabaseObjectStorage(stub.factory).presignDownloads([target, other], 900);
      expect(result).toEqual({ ok: true, value: [null, "https://signed/other"] });
      expect(stub.bucket.createSignedUrls).toHaveBeenCalledExactlyOnceWith([KEY, otherKey], 900);
      const line = String(write.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({ level: "warn", caseId: CASE_ID });
      expect(line).not.toContain(ASSET_ID);
    });
  });

  it("presignDownloads of nothing makes no call", async () => {
    const stub = stubClient();
    expect(await createSupabaseObjectStorage(stub.factory).presignDownloads([], 900)).toEqual({ ok: true, value: [] });
    expect(stub.bucket.createSignedUrls).not.toHaveBeenCalled();
  });

  it("presignDownloads returns STORAGE_FAILED when the whole call fails", async () => {
    await capturingLogs(async (write) => {
      const stub = stubClient();
      stub.bucket.createSignedUrls.mockResolvedValueOnce({ data: null, error: apiError(503) });
      const result = await createSupabaseObjectStorage(stub.factory).presignDownloads([target], 900);
      expect(result).toEqual({ ok: false, error: { code: "STORAGE_FAILED", message: "Could not prepare the file links." } });
      expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "error", caseId: CASE_ID, msg: "storage presign gets failed: 503" });
    });
  });

  it("builds its client once per adapter instance", async () => {
    const stub = stubClient();
    const storage = createSupabaseObjectStorage(stub.factory);
    await storage.presignUpload(target, 100);
    await storage.head(target);
    await storage.presignDownloads([target], 900);
    expect(stub.build).toHaveBeenCalledOnce();
    expect(stub.from).toHaveBeenCalledTimes(3);
  });

  describe("rendition objects (Story 3.2)", () => {
    const RENDITION = `cases/${CASE_ID}/assets/${ASSET_ID}/renditions/0123456789abcdef.webp`;

    it("presignKeys signs the given keys in one call, in order", async () => {
      const stub = stubClient();
      const result = await createSupabaseObjectStorage(stub.factory).presignKeys([RENDITION], 900);
      expect(stub.bucket.createSignedUrls).toHaveBeenCalledExactlyOnceWith([RENDITION], 900);
      expect(result).toEqual({ ok: true, value: [`https://project.supabase.co/sign/${RENDITION}?token=g`] });
      expect(await createSupabaseObjectStorage(stub.factory).presignKeys([], 900)).toEqual({ ok: true, value: [] });
      expect(stub.bucket.createSignedUrls).toHaveBeenCalledOnce();
    });

    it("download returns the bytes, null for a missing object, STORAGE_FAILED otherwise (logging no key)", async () => {
      const stub = stubClient();
      expect(await createSupabaseObjectStorage(stub.factory).download(KEY)).toEqual({ ok: true, value: new Uint8Array([1, 2, 3]) });
      expect(stub.bucket.download).toHaveBeenCalledWith(KEY);
      stub.bucket.download.mockResolvedValueOnce({ data: null, error: apiError(404, "Object not found") });
      expect(await createSupabaseObjectStorage(stub.factory).download(KEY)).toEqual({ ok: true, value: null });
      await capturingLogs(async (write) => {
        stub.bucket.download.mockResolvedValueOnce({ data: null, error: apiError(500) });
        expect(await createSupabaseObjectStorage(stub.factory).download(KEY)).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
        const line = String(write.mock.calls[0][0]);
        expect(JSON.parse(line)).toMatchObject({ level: "error", caseId: CASE_ID });
        expect(line).not.toContain(ASSET_ID);
      });
    });

    it("upload writes a rendition key with its type and upsert (a retry replaces it)", async () => {
      const stub = stubClient();
      const bytes = new Uint8Array([7]);
      expect(await createSupabaseObjectStorage(stub.factory).upload(RENDITION, bytes, "image/webp")).toEqual({ ok: true, value: undefined });
      expect(stub.bucket.upload).toHaveBeenCalledExactlyOnceWith(RENDITION, bytes, { contentType: "image/webp", upsert: true });
    });

    it.each([KEY, `cases/${CASE_ID}/assets/${ASSET_ID}/renditions/../original.mov`, `cases/${CASE_ID}/logos/x.webp`, "renditions/0123456789abcdef.webp"])(
      "upload refuses anything but a rendition key: %s",
      async (key) => {
        const stub = stubClient();
        expect(await createSupabaseObjectStorage(stub.factory).upload(key, new Uint8Array([1]), "image/webp")).toMatchObject({
          ok: false,
          error: { code: "STORAGE_WRITE_REFUSED" },
        });
        expect(stub.bucket.upload).not.toHaveBeenCalled();
      },
    );

    it("an upload failure is STORAGE_FAILED", async () => {
      const stub = stubClient();
      stub.bucket.upload.mockResolvedValueOnce({ data: null, error: apiError(413, "Payload too large") });
      await capturingLogs(async () => {
        expect(await createSupabaseObjectStorage(stub.factory).upload(RENDITION, new Uint8Array([1]), "image/webp")).toMatchObject({
          ok: false,
          error: { code: "STORAGE_FAILED" },
        });
      });
    });
  });
});
