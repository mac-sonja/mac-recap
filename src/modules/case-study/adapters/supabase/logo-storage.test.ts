import { StorageApiError } from "@supabase/supabase-js";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseLogoStorage, LOGO_BUCKET, MAX_DOWNLOAD_TTL_SECONDS } from "./logo-storage";

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";
const target = { clientId: CLIENT_ID, logoId: LOGO_ID, contentType: "image/webp" as const };
const KEY = `clients/${CLIENT_ID}/logos/${LOGO_ID}.webp`;

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

/** Stub of `client.storage.from(bucket)`: each call answers `{ data, error }` like supabase-js. */
function stubClient(download: () => Promise<{ data: Blob | null; error: unknown }> = async () => ({ data: null, error: null })) {
  const bucket = {
    createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://x/upload/${path}?token=t`, token: "t", path }, error: null })),
    createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://x/sign/${path}?token=g` }, error: null as unknown })),
    info: vi.fn(async () => ({ data: { size: 42, contentType: "image/webp" }, error: null as unknown })),
    download: vi.fn(download),
    remove: vi.fn<(paths: string[]) => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: [], error: null })),
  };
  const from = vi.fn(() => bucket);
  const factory = (() => ({ storage: { from } })) as unknown as Parameters<typeof createSupabaseLogoStorage>[0];
  return { factory, from, bucket };
}

async function quietly<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const result = await run();
    return { result, lines: write.mock.calls.map((c) => String(c[0])) };
  } finally {
    write.mockRestore();
  }
}

describe("createSupabaseLogoStorage", () => {
  it("presigns an upload of the logo key in the material bucket that PUTs with the content type and no upsert", async () => {
    const stub = stubClient();
    expect(await createSupabaseLogoStorage(stub.factory).presignUpload(target)).toEqual({
      ok: true,
      value: { url: `https://x/upload/${KEY}?token=t`, method: "PUT", headers: { "content-type": "image/webp", "x-upsert": "false" } },
    });
    expect(stub.from).toHaveBeenCalledWith(LOGO_BUCKET);
    expect(LOGO_BUCKET).toBe("material");
    expect(stub.bucket.createSignedUploadUrl).toHaveBeenCalledWith(KEY);
  });

  it("signs a GET for at most 15 minutes", async () => {
    const stub = stubClient();
    expect(await createSupabaseLogoStorage(stub.factory).presignDownload(target, 3600)).toEqual({
      ok: true,
      value: `https://x/sign/${KEY}?token=g`,
    });
    expect(stub.bucket.createSignedUrl).toHaveBeenCalledWith(KEY, MAX_DOWNLOAD_TTL_SECONDS);
    expect(MAX_DOWNLOAD_TTL_SECONDS).toBe(900);
  });

  it("logs a failed signed GET with the client id only, never the key", async () => {
    const stub = stubClient();
    stub.bucket.createSignedUrl.mockResolvedValueOnce({ data: null as never, error: new StorageApiError("boom", 500, "500") });
    const { result, lines } = await quietly(() => createSupabaseLogoStorage(stub.factory).presignDownload(target, 60));
    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    expect(lines.join("")).toContain(CLIENT_ID);
    expect(lines.join("")).not.toContain(KEY);
  });

  it("heads the stored object, and answers null when it is missing", async () => {
    const stub = stubClient();
    expect(await createSupabaseLogoStorage(stub.factory).head(target)).toEqual({ ok: true, value: { sizeBytes: 42, contentType: "image/webp" } });
    stub.bucket.info.mockResolvedValueOnce({ data: null as never, error: new StorageApiError("Object not found", 404, "404") });
    expect(await createSupabaseLogoStorage(stub.factory).head(target)).toEqual({ ok: true, value: null });
  });

  it("reads the real format and pixel size of the stored image", async () => {
    const bytes = await png(640, 400);
    const stub = stubClient(async () => ({ data: new Blob([new Uint8Array(bytes)]), error: null }));
    expect(await createSupabaseLogoStorage(stub.factory).dimensions(target)).toEqual({
      ok: true,
      value: { format: "png", width: 640, height: 400 },
    });
    expect(stub.bucket.download).toHaveBeenCalledWith(KEY);
  });

  it("answers no format for bytes that are not a PNG, JPEG or WebP, and null for a missing object", async () => {
    const junk = stubClient(async () => ({ data: new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"]), error: null }));
    expect(await createSupabaseLogoStorage(junk.factory).dimensions(target)).toEqual({ ok: true, value: { format: null, width: 0, height: 0 } });
    const missing = stubClient(async () => ({ data: null, error: new StorageApiError("Object not found", 404, "404") }));
    expect(await createSupabaseLogoStorage(missing.factory).dimensions(target)).toEqual({ ok: true, value: null });
  });

  it("deletes the logo object by its key", async () => {
    const stub = stubClient();
    expect(await createSupabaseLogoStorage(stub.factory).remove(target)).toEqual({ ok: true, value: undefined });
    expect(stub.bucket.remove).toHaveBeenCalledWith([KEY]);
  });

  it("answers STORAGE_FAILED and logs the client id only when the delete fails", async () => {
    const stub = stubClient();
    stub.bucket.remove.mockResolvedValueOnce({ data: null as never, error: new StorageApiError("boom", 500, "500") });
    const { result, lines } = await quietly(() => createSupabaseLogoStorage(stub.factory).remove(target));
    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    expect(lines.join("")).toContain(CLIENT_ID);
    expect(lines.join("")).not.toContain(KEY);
  });
});
