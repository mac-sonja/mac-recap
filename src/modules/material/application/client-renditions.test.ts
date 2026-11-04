import { describe, expect, it, vi } from "vitest";
import type { Rendition } from "@/modules/material/domain/rendition";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { err, ok, type Result } from "@/shared/result";
import { makeEnqueueClientRenditions, makeGetClientRendition, type ClientMediaFile } from "./client-renditions";
import type { Jobs } from "./deps";
import { renditionInputHash, specHashOf } from "./spec-hash";

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const IMG = "eeeeeeee-0000-4000-8000-000000000001";
const VID = "eeeeeeee-0000-4000-8000-000000000002";
const DOC = "eeeeeeee-0000-4000-8000-000000000003";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";

const codeOf = (result: Result<unknown>) => (result.ok ? null : result.error.code);

describe("enqueueClientRenditions (Story 4.5c-2)", () => {
  const jobs = () => ({ enqueue: vi.fn<Jobs["enqueue"]>(async (input) => ok(input)) });

  it.each([
    ["an image", "image"],
    ["a video", "video"],
  ] as const)("enqueues %s's rendition job with its client, as a case file's", async (_label, kind) => {
    const j = jobs();
    await makeEnqueueClientRenditions({ jobs: j })({ id: IMG, clientId: CLIENT_ID, kind }, ACTOR_ID);
    expect(j.enqueue).toHaveBeenCalledExactlyOnceWith({
      kind: "rendition",
      subjectId: IMG,
      inputHash: renditionInputHash(IMG, kind),
      payload: { owner: "client", clientId: CLIENT_ID },
    });
  });

  it.each(["document", "text"] as const)("enqueues nothing for a %s", async (kind) => {
    const j = jobs();
    await makeEnqueueClientRenditions({ jobs: j })({ id: DOC, clientId: CLIENT_ID, kind }, ACTOR_ID);
    expect(j.enqueue).not.toHaveBeenCalled();
  });

  it("never fails: a refused or throwing enqueue is logged with the client and actor ids", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const refused = { enqueue: vi.fn<Jobs["enqueue"]>(async () => err({ code: "INVALID_INPUT", message: "bad" })) };
      await expect(makeEnqueueClientRenditions({ jobs: refused })({ id: IMG, clientId: CLIENT_ID, kind: "image" }, ACTOR_ID)).resolves.toBeUndefined();
      const throwing = { enqueue: vi.fn<Jobs["enqueue"]>(async () => Promise.reject(new Error("down"))) };
      await expect(makeEnqueueClientRenditions({ jobs: throwing })({ id: IMG, clientId: CLIENT_ID, kind: "image" }, ACTOR_ID)).resolves.toBeUndefined();
      const lines = write.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line).toMatchObject({ clientId: CLIENT_ID, actorId: ACTOR_ID });
    } finally {
      write.mockRestore();
    }
  });
});

describe("getClientRendition (Story 4.5c-2)", () => {
  function world() {
    const files = new Map<string, ClientMediaFile>([
      [IMG, { id: IMG, clientId: CLIENT_ID, kind: "image", contentType: "image/png", deletedAt: null }],
      [VID, { id: VID, clientId: CLIENT_ID, kind: "video", contentType: "video/mp4", deletedAt: null }],
      [DOC, { id: DOC, clientId: CLIENT_ID, kind: "document", contentType: "application/pdf", deletedAt: null }],
    ]);
    const rows = new Map<string, Rendition>();
    const add = (assetId: string, name: Parameters<typeof specHashOf>[0], over: Partial<Rendition> = {}) => {
      const hash = specHashOf(name);
      rows.set(`${assetId}/${hash}`, {
        assetId,
        specHash: hash,
        path: `clients/${CLIENT_ID}/material/${assetId}/renditions/${hash}.${name === "video.display" ? "mp4" : "webp"}`,
        contentType: name === "video.display" ? "video/mp4" : "image/webp",
        width: 2048,
        height: 1365,
        sizeBytes: 10,
        createdAt: "t",
        ...over,
      });
    };
    const deps = {
      files: { get: vi.fn(async (id: string): Promise<Result<ClientMediaFile | null>> => ok(files.get(id) ?? null)) },
      renditions: { get: vi.fn<RenditionRepository["get"]>(async (assetId, hash) => ok(rows.get(`${assetId}/${hash}`) ?? null)) },
      storage: { presignKeys: vi.fn<ObjectStorage["presignKeys"]>(async (keys, ttl) => ok(keys.map((k) => `https://storage.example/${k}?ttl=${ttl}`))) },
    };
    return { files, add, deps };
  }

  it("returns a 15-minute signed URL of the client rendition", async () => {
    const w = world();
    w.add(IMG, "image.display");
    const path = `clients/${CLIENT_ID}/material/${IMG}/renditions/${specHashOf("image.display")}.webp`;
    expect(await makeGetClientRendition(w.deps)(IMG, "image.display")).toEqual(
      ok({ url: `https://storage.example/${path}?ttl=900`, width: 2048, height: 1365, contentType: "image/webp" }),
    );
    expect(w.deps.storage.presignKeys).toHaveBeenCalledExactlyOnceWith([path], 900);
  });

  it("a video's display copy and poster", async () => {
    const w = world();
    w.add(VID, "video.display", { width: 1920, height: 1080 });
    w.add(VID, "video.poster");
    expect(await makeGetClientRendition(w.deps)(VID, "video.display")).toEqual(ok(expect.objectContaining({ contentType: "video/mp4", width: 1920 })));
    expect(await makeGetClientRendition(w.deps)(VID, "video.poster")).toEqual(ok(expect.objectContaining({ contentType: "image/webp" })));
  });

  it("before the job ends → RENDITION_NOT_READY, nothing signed", async () => {
    const w = world();
    expect(codeOf(await makeGetClientRendition(w.deps)(IMG, "image.display"))).toBe("RENDITION_NOT_READY");
    expect(w.deps.storage.presignKeys).not.toHaveBeenCalled();
  });

  it("a removed client file → NOT_FOUND even with renditions, nothing signed", async () => {
    const w = world();
    w.add(IMG, "image.display");
    w.files.set(IMG, { ...w.files.get(IMG)!, deletedAt: "2026-11-04T10:00:00Z" });
    expect(codeOf(await makeGetClientRendition(w.deps)(IMG, "image.display"))).toBe("NOT_FOUND");
    expect(w.deps.renditions.get).not.toHaveBeenCalled();
    expect(w.deps.storage.presignKeys).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown file", "eeeeeeee-0000-4000-8000-000000000009", "image.display"],
    ["a PDF", DOC, "image.display"],
    ["a video spec of an image", IMG, "video.poster"],
  ])("%s → NOT_FOUND", async (_label, id, spec) => {
    expect(codeOf(await makeGetClientRendition(world().deps)(id, spec))).toBe("NOT_FOUND");
  });

  it("a malformed id or spec → INVALID_INPUT; no storage → STORAGE_NOT_CONFIGURED; a failed lookup passes through", async () => {
    const w = world();
    expect(codeOf(await makeGetClientRendition(w.deps)("nope", "image.display"))).toBe("INVALID_INPUT");
    expect(codeOf(await makeGetClientRendition(w.deps)(IMG, "image.huge"))).toBe("INVALID_INPUT");
    expect(codeOf(await makeGetClientRendition({ ...w.deps, storage: null })(IMG, "image.display"))).toBe("STORAGE_NOT_CONFIGURED");
    w.deps.files.get.mockResolvedValueOnce(err({ code: "CLIENT_LOOKUP_FAILED", message: "down" }));
    expect(codeOf(await makeGetClientRendition(w.deps)(IMG, "image.display"))).toBe("CLIENT_LOOKUP_FAILED");
  });
});
