import { describe, expect, it, vi } from "vitest";
import { clientAssetKey } from "@/modules/material/adapters/asset-key";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import { err, ok } from "@/shared/result";
import type { ClientMediaFile } from "./client-renditions";
import { makeReadClientFileBytes } from "./read-client-file";

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const OTHER_CLIENT = "cccccccc-0000-4000-8000-000000000002";
const PDF = "eeeeeeee-0000-4000-8000-000000000001";
const GONE = "eeeeeeee-0000-4000-8000-000000000002";
const BYTES = new Uint8Array([37, 80, 68, 70]);

function world(download: ObjectStorage["download"] = vi.fn(async () => ok(BYTES))) {
  const files = new Map<string, ClientMediaFile>([
    [PDF, { id: PDF, clientId: CLIENT_ID, kind: "document", contentType: "application/pdf", deletedAt: null }],
    [GONE, { id: GONE, clientId: CLIENT_ID, kind: "document", contentType: "application/pdf", deletedAt: "2026-11-01T00:00:00Z" }],
  ]);
  const storage = { download };
  const read = makeReadClientFileBytes(
    { files: { get: async (id) => ok(files.get(id) ?? null) }, storage },
    (file) => clientAssetKey(file.clientId, file.id, file.contentType),
  );
  return { read, storage };
}

describe("readClientFileBytes (Story 3.9)", () => {
  it("reads a live client file's original at its client key", async () => {
    const { read, storage } = world();
    expect(await read({ clientId: CLIENT_ID, assetId: PDF })).toEqual(ok({ bytes: BYTES, contentType: "application/pdf" }));
    expect(storage.download).toHaveBeenCalledExactlyOnceWith(`clients/${CLIENT_ID}/material/${PDF}.pdf`);
  });

  it("NOT_FOUND for a removed file, another client's file, an unknown file or a missing object", async () => {
    const { read } = world();
    for (const input of [
      { clientId: CLIENT_ID, assetId: GONE },
      { clientId: OTHER_CLIENT, assetId: PDF },
      { clientId: CLIENT_ID, assetId: "eeeeeeee-0000-4000-8000-000000000009" },
    ]) {
      expect(await read(input)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }
    expect(await world(vi.fn(async () => ok(null))).read({ clientId: CLIENT_ID, assetId: PDF })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("passes a download error through; bad input is INVALID_INPUT; no storage is STORAGE_NOT_CONFIGURED", async () => {
    const failing = world(vi.fn(async () => err({ code: "STORAGE_FAILED", message: "m" })));
    expect(await failing.read({ clientId: CLIENT_ID, assetId: PDF })).toMatchObject({ ok: false, error: { code: "STORAGE_FAILED" } });
    expect(await world().read({ clientId: "x", assetId: PDF })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    const none = makeReadClientFileBytes({ files: { get: async () => ok(null) }, storage: null }, () => "k");
    expect(await none({ clientId: CLIENT_ID, assetId: PDF })).toMatchObject({ ok: false, error: { code: "STORAGE_NOT_CONFIGURED" } });
  });
});
