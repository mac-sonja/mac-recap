import { StorageApiError } from "@supabase/supabase-js";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { CLIENT_MATERIAL_BUCKET, createSupabaseClientMaterialStorage } from "./client-material-storage";

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const ASSET_ID = "ffffffff-0000-4000-8000-000000000001";
const OTHER_ID = "ffffffff-0000-4000-8000-000000000002";
const target = { clientId: CLIENT_ID, assetId: ASSET_ID, contentType: "image/jpeg" as const };
const KEY = `clients/${CLIENT_ID}/material/${ASSET_ID}.jpg`;

const jpeg = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toBuffer();

/** Stub of `client.storage.from(bucket)`: each call answers `{ data, error }` like supabase-js. */
function stubClient(download: () => Promise<{ data: Blob | null; error: unknown }> = async () => ({ data: null, error: null })) {
  const bucket = {
    createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://x/upload/${path}?token=t`, token: "t", path }, error: null })),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://x/sign/${path}?token=g`, error: null as string | null })),
      error: null as unknown,
    })),
    info: vi.fn(async () => ({ data: { size: 42, contentType: "image/jpeg" }, error: null as unknown })),
    download: vi.fn(download),
    remove: vi.fn<(paths: string[]) => Promise<{ data: unknown; error: unknown }>>(async () => ({ data: [], error: null })),
  };
  const from = vi.fn(() => bucket);
  const factory = (() => ({ storage: { from } })) as unknown as Parameters<typeof createSupabaseClientMaterialStorage>[0];
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

describe("createSupabaseClientMaterialStorage", () => {
  it("presigns an upload under clients/{clientId}/material/ in the material bucket that PUTs with the content type and no upsert", async () => {
    const stub = stubClient();
    expect(await createSupabaseClientMaterialStorage(stub.factory).presignUpload(target)).toEqual({
      ok: true,
      value: { url: `https://x/upload/${KEY}?token=t`, method: "PUT", headers: { "content-type": "image/jpeg", "x-upsert": "false" } },
    });
    expect(stub.from).toHaveBeenCalledWith(CLIENT_MATERIAL_BUCKET);
    expect(CLIENT_MATERIAL_BUCKET).toBe("material");
    expect(stub.bucket.createSignedUploadUrl).toHaveBeenCalledWith(KEY);
  });

  it("takes the extension from the content type", async () => {
    const stub = stubClient();
    await createSupabaseClientMaterialStorage(stub.factory).presignUpload({
      ...target,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(stub.bucket.createSignedUploadUrl).toHaveBeenCalledWith(`clients/${CLIENT_ID}/material/${ASSET_ID}.docx`);
  });

  it("signs GETs in one call for at most 15 minutes, in order, null for one that can't be signed", async () => {
    const stub = stubClient();
    const other = { ...target, assetId: OTHER_ID, contentType: "image/png" as const };
    stub.bucket.createSignedUrls.mockImplementationOnce(async (paths: string[]) => ({
      data: [
        { path: paths[0], signedUrl: "https://x/a", error: null },
        { path: paths[1], signedUrl: "", error: "Object not found" },
      ],
      error: null,
    }));
    const { result } = await quietly(() => createSupabaseClientMaterialStorage(stub.factory).presignDownloads([target, other], 3600));
    expect(result).toEqual({ ok: true, value: ["https://x/a", null] });
    expect(stub.bucket.createSignedUrls).toHaveBeenCalledWith([KEY, `clients/${CLIENT_ID}/material/${OTHER_ID}.png`], 900);
  });

  it("signs nothing for no targets", async () => {
    const stub = stubClient();
    expect(await createSupabaseClientMaterialStorage(stub.factory).presignDownloads([], 60)).toEqual({ ok: true, value: [] });
    expect(stub.bucket.createSignedUrls).not.toHaveBeenCalled();
  });

  it("answers STORAGE_FAILED and logs the client id only when signing fails", async () => {
    const stub = stubClient();
    stub.bucket.createSignedUrls.mockResolvedValueOnce({ data: null as never, error: new StorageApiError("boom", 500, "500") });
    const { result, lines } = await quietly(() => createSupabaseClientMaterialStorage(stub.factory).presignDownloads([target], 60));
    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    expect(lines.join("")).toContain(CLIENT_ID);
    expect(lines.join("")).not.toContain(KEY);
  });

  it("heads the stored object, and answers null when it is missing", async () => {
    const stub = stubClient();
    expect(await createSupabaseClientMaterialStorage(stub.factory).head(target)).toEqual({ ok: true, value: { sizeBytes: 42, contentType: "image/jpeg" } });
    stub.bucket.info.mockResolvedValueOnce({ data: null as never, error: new StorageApiError("Object not found", 404, "404") });
    expect(await createSupabaseClientMaterialStorage(stub.factory).head(target)).toEqual({ ok: true, value: null });
  });

  it("reads the real format and pixel size of the stored image from the whole object", async () => {
    const bytes = await jpeg(2400, 1600);
    const stub = stubClient(async () => ({ data: new Blob([new Uint8Array(bytes)]), error: null }));
    expect(await createSupabaseClientMaterialStorage(stub.factory).dimensions(target)).toEqual({
      ok: true,
      value: { format: "jpeg", width: 2400, height: 1600 },
    });
    expect(stub.bucket.download).toHaveBeenCalledWith(KEY);
  });

  it("answers no format for bytes that are not an image, and null for a missing object", async () => {
    const junk = stubClient(async () => ({ data: new Blob(["%PDF-1.7"]), error: null }));
    expect(await createSupabaseClientMaterialStorage(junk.factory).dimensions(target)).toEqual({ ok: true, value: { format: null, width: 0, height: 0 } });
    const missing = stubClient(async () => ({ data: null, error: new StorageApiError("Object not found", 404, "404") }));
    expect(await createSupabaseClientMaterialStorage(missing.factory).dimensions(target)).toEqual({ ok: true, value: null });
  });

  it("refuses to read a body over 50 MB", async () => {
    const big = new Blob([]);
    Object.defineProperty(big, "size", { value: 50 * 1024 * 1024 + 1 });
    const stub = stubClient(async () => ({ data: big, error: null }));
    expect(await createSupabaseClientMaterialStorage(stub.factory).dimensions(target)).toEqual({ ok: true, value: { format: null, width: 0, height: 0 } });
  });

  it("deletes the object by its key", async () => {
    const stub = stubClient();
    expect(await createSupabaseClientMaterialStorage(stub.factory).remove(target)).toEqual({ ok: true, value: undefined });
    expect(stub.bucket.remove).toHaveBeenCalledWith([KEY]);
  });

  it("answers STORAGE_FAILED and logs the client id only when the delete fails", async () => {
    const stub = stubClient();
    stub.bucket.remove.mockResolvedValueOnce({ data: null as never, error: new StorageApiError("boom", 500, "500") });
    const { result, lines } = await quietly(() => createSupabaseClientMaterialStorage(stub.factory).remove(target));
    expect(result).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    expect(lines.join("")).toContain(CLIENT_ID);
    expect(lines.join("")).not.toContain(KEY);
  });
});
