import { describe, expect, it, vi } from "vitest";
import { EXPORT_MAX_BYTES } from "@/modules/rendering/domain/export";
import { createSupabaseExportStorage, exportKey, MAX_DOWNLOAD_TTL_SECONDS } from "./export-storage";

const HASH = "a".repeat(64);

/** A stand-in for the service-role client's `rendering` bucket. */
function fakeBucket() {
  const bucket = {
    upload: vi.fn(async () => ({ data: {}, error: null as unknown })),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]) as Blob | null, error: null as unknown })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://storage.test/signed" }, error: null as unknown })),
  };
  const client = { storage: { from: vi.fn(() => bucket) } };
  const storage = createSupabaseExportStorage(() => client as never);
  return { bucket, client, storage };
}

describe("exportKey", () => {
  it("is `exports/{hash}/{format}.{ext}`, and `bundle.zip` for a bundle (Story 5.4)", () => {
    expect(exportKey(HASH, "presentazione_16_9")).toBe(`exports/${HASH}/presentazione_16_9.pdf`);
    expect(exportKey(HASH, "carosello_1_1")).toBe(`exports/${HASH}/carosello_1_1.zip`);
    expect(exportKey(HASH, "bundle")).toBe(`exports/${HASH}/bundle.zip`);
  });

  it("refuses a malformed hash", () => {
    expect(() => exportKey("../x", "bundle")).toThrow();
  });
});

describe("export storage (Supabase)", () => {
  it("uploads a bundle as a ZIP under its key", async () => {
    const { bucket, client, storage } = fakeBucket();
    expect(await storage.upload({ contentHash: HASH, format: "bundle" }, new Uint8Array([1]))).toEqual({ ok: true, value: { path: `exports/${HASH}/bundle.zip` } });
    expect(client.storage.from).toHaveBeenCalledWith("rendering");
    expect(bucket.upload).toHaveBeenCalledWith(`exports/${HASH}/bundle.zip`, new Uint8Array([1]), { contentType: "application/zip", upsert: true });
  });

  it("reads a stored export's bytes", async () => {
    const { bucket, storage } = fakeBucket();
    expect(await storage.read(`exports/${HASH}/carosello_1_1.zip`)).toEqual({ ok: true, value: new Uint8Array([1, 2, 3]) });
    expect(bucket.download).toHaveBeenCalledWith(`exports/${HASH}/carosello_1_1.zip`);
  });

  it("reads nothing outside the export keys", async () => {
    const { bucket, storage } = fakeBucket();
    for (const path of [`exports/${HASH}/video_9_16.mp4`, `material/${HASH}/x.png`, `exports/${HASH}/../x.zip`]) {
      expect(await storage.read(path)).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    }
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it("refuses a stored file over the bucket's limit without reading it", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { bucket, storage } = fakeBucket();
      const arrayBuffer = vi.fn();
      bucket.download.mockResolvedValueOnce({ data: { size: EXPORT_MAX_BYTES + 1, arrayBuffer } as unknown as Blob, error: null });
      expect(await storage.read(`exports/${HASH}/carosello_1_1.zip`)).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
      expect(arrayBuffer).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("answers STORAGE_FAILED when the download fails, logging no key", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { bucket, storage } = fakeBucket();
      bucket.download.mockResolvedValueOnce({ data: null, error: new Error("boom") });
      expect(await storage.read(`exports/${HASH}/presentazione_16_9.pdf`)).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
      expect(write.mock.calls.map(([chunk]) => String(chunk)).join("")).not.toContain(HASH);
    } finally {
      write.mockRestore();
    }
  });

  it("signs a bundle's download for at most 15 minutes", async () => {
    const { bucket, storage } = fakeBucket();
    expect(await storage.presignDownload(`exports/${HASH}/bundle.zip`, 3600, "LUM-2026-01 Rebrand Lumen.zip")).toEqual({ ok: true, value: "https://storage.test/signed" });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(`exports/${HASH}/bundle.zip`, MAX_DOWNLOAD_TTL_SECONDS, { download: "LUM-2026-01 Rebrand Lumen.zip" });
  });
});
