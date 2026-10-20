import { describe, expect, it, vi } from "vitest";
import type { Job } from "@/modules/jobs";
import type { Asset } from "@/modules/material/domain/asset";
import { MAX_FILE_BYTES } from "@/modules/material/domain/files";
import type { Rendition } from "@/modules/material/domain/rendition";
import type { ImageProcessor, VideoProcessor, VideoSession } from "@/modules/material/ports/media-processing";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import type { NewRendition, RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { err, ok } from "@/shared/result";
import { makeRenditionHandler, type RenditionWorkerDeps } from "./make-renditions";
import { specHashOf } from "./spec-hash";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const ORIGINAL_KEY = `cases/${CASE_ID}/assets/${ASSET_ID}/original.jpg`;
const THUMB = specHashOf("image.thumb");
const DISPLAY = specHashOf("image.display");
const POSTER = specHashOf("video.poster");
const VIDEO = specHashOf("video.display");

const asset = (over: Partial<Asset> = {}): Asset => ({
  id: ASSET_ID,
  caseId: CASE_ID,
  kind: "image",
  originalFileName: "photo.jpg",
  contentType: "image/jpeg",
  sizeBytes: 1000,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-20T10:00:00Z",
  deletedAt: null,
  isFavourite: false,
  ...over,
});

const job = (payload: Record<string, unknown> = { caseId: CASE_ID }): Job => ({
  id: "dddddddd-0000-4000-8000-000000000001",
  kind: "rendition",
  subjectId: ASSET_ID,
  inputHash: "h",
  payload: payload as Job["payload"],
  status: "running",
  attempts: 1,
  maxAttempts: 3,
  lockedUntil: "2026-10-20T10:10:00Z",
  error: null,
  createdAt: "2026-10-20T10:00:00Z",
  updatedAt: "2026-10-20T10:00:00Z",
  finishedAt: null,
});

/** An in-memory world: one asset, its stored objects and rendition rows. */
function world(start: Asset | null = asset(), existing: string[] = []) {
  const rows = new Map<string, Rendition>();
  for (const hash of existing) {
    rows.set(hash, { assetId: ASSET_ID, specHash: hash, path: `p/${hash}`, contentType: "image/webp", width: 1, height: 1, sizeBytes: 1, createdAt: "t" });
  }
  const objects = new Map<string, Uint8Array>([[ORIGINAL_KEY, new Uint8Array([9, 9, 9])]]);
  const writes: string[] = [];
  const session: VideoSession & { close: ReturnType<typeof vi.fn> } = {
    render: vi.fn(async (spec) => ok({ bytes: new Uint8Array(spec.name === "video.poster" ? 5 : 50), width: spec.name === "video.poster" ? 2048 : 1920, height: spec.name === "video.poster" ? 1152 : 1080 })),
    close: vi.fn(async () => undefined),
  };
  const deps = {
    assets: { getById: vi.fn(async () => ok(start)) },
    renditions: {
      listForAsset: vi.fn(async () => ok([...rows.values()])),
      upsert: vi.fn<RenditionRepository["upsert"]>(async (r: NewRendition) => {
        writes.push(`row:${r.specHash}`);
        const saved = { ...r, createdAt: "t" };
        rows.set(r.specHash, saved);
        return ok(saved);
      }),
    },
    storage: {
      download: vi.fn<ObjectStorage["download"]>(async (key) => ok(objects.get(key) ?? null)),
      upload: vi.fn<ObjectStorage["upload"]>(async (key, bytes) => {
        writes.push(`object:${key}`);
        objects.set(key, bytes);
        return ok(undefined);
      }),
    },
    keys: {
      original: vi.fn((a: Asset) => `cases/${a.caseId}/assets/${a.id}/original.jpg`),
      rendition: vi.fn((a: Asset, hash: string, ext: string) => `cases/${a.caseId}/assets/${a.id}/renditions/${hash}.${ext}`),
    },
    image: {
      render: vi.fn<ImageProcessor["render"]>(async (_input, spec) =>
        ok(spec.maxLongSide === 480 ? { bytes: new Uint8Array(3), width: 480, height: 320 } : { bytes: new Uint8Array(30), width: 2048, height: 1365 }),
      ),
    },
    video: { open: vi.fn<VideoProcessor["open"]>(async () => ok(session)) },
  } satisfies RenditionWorkerDeps;
  return { deps, rows, objects, writes, session };
}

const live = () => new AbortController().signal;

describe("rendition handler", () => {
  it("maps the job to its case for job_failed", () => {
    const { deps } = world();
    const handler = makeRenditionHandler(deps);
    expect(handler.caseIdOf?.(job())).toBe(CASE_ID);
    expect(handler.caseIdOf?.(job({}))).toBeNull();
    expect(handler.caseIdOf?.(job({ caseId: "nope" }))).toBeNull();
  });

  it("an image: reads the original once, writes thumb then display with their rows", async () => {
    const w = world();
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(ok(undefined));
    expect(w.deps.storage.download).toHaveBeenCalledExactlyOnceWith(ORIGINAL_KEY);
    expect(w.deps.image.render).toHaveBeenCalledTimes(2);
    expect(w.deps.image.render.mock.calls.map(([, spec]) => spec.name)).toEqual(["image.thumb", "image.display"]);
    const base = `cases/${CASE_ID}/assets/${ASSET_ID}/renditions`;
    expect(w.writes).toEqual([`object:${base}/${THUMB}.webp`, `row:${THUMB}`, `object:${base}/${DISPLAY}.webp`, `row:${DISPLAY}`]);
    expect(w.deps.storage.upload).toHaveBeenCalledWith(`${base}/${THUMB}.webp`, expect.any(Uint8Array), "image/webp");
    expect(w.rows.get(THUMB)).toMatchObject({ assetId: ASSET_ID, width: 480, height: 320, sizeBytes: 3, contentType: "image/webp", path: `${base}/${THUMB}.webp` });
    expect(w.rows.get(DISPLAY)).toMatchObject({ width: 2048, height: 1365, sizeBytes: 30 });
    expect(w.deps.video.open).not.toHaveBeenCalled();
  });

  it("never writes the original's key", async () => {
    const w = world();
    await makeRenditionHandler(w.deps).run(job(), live());
    expect(w.deps.storage.upload.mock.calls.map(([key]) => key)).not.toContain(ORIGINAL_KEY);
    expect(w.objects.get(ORIGINAL_KEY)).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("a retry after the thumb was written makes only the display", async () => {
    const w = world(asset(), [THUMB]);
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(ok(undefined));
    expect(w.deps.image.render.mock.calls.map(([, spec]) => spec.name)).toEqual(["image.display"]);
    expect(w.writes).toEqual([expect.stringContaining(`${DISPLAY}.webp`), `row:${DISPLAY}`]);
  });

  it("everything made already: ok without reading the original", async () => {
    const w = world(asset(), [THUMB, DISPLAY]);
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(ok(undefined));
    expect(w.deps.storage.download).not.toHaveBeenCalled();
    expect(w.writes).toEqual([]);
  });

  it("a video: one session makes the poster then the display MP4, then closes", async () => {
    const w = world(asset({ kind: "video", contentType: "video/mp4" }));
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(ok(undefined));
    expect(w.deps.video.open).toHaveBeenCalledOnce();
    expect(vi.mocked(w.session.render).mock.calls.map(([spec]) => spec.name)).toEqual(["video.poster", "video.display"]);
    expect(w.rows.get(POSTER)).toMatchObject({ contentType: "image/webp", width: 2048, height: 1152 });
    expect(w.rows.get(VIDEO)).toMatchObject({ contentType: "video/mp4", width: 1920, height: 1080, path: expect.stringMatching(/\.mp4$/) });
    expect(w.session.close).toHaveBeenCalledOnce();
  });

  it("an undecodable image: no rows, fails for good", async () => {
    const w = world();
    w.deps.image.render.mockResolvedValueOnce(err({ code: "RENDITION_UNDECODABLE", message: "bad", retryable: false }));
    const outcome = await makeRenditionHandler(w.deps).run(job(), live());
    expect(outcome).toEqual(err(expect.objectContaining({ code: "RENDITION_UNDECODABLE", retryable: false })));
    expect(w.writes).toEqual([]);
  });

  it("an undecodable video: no rows, fails for good, session closed", async () => {
    const w = world(asset({ kind: "video", contentType: "video/mp4" }));
    vi.mocked(w.session.render).mockResolvedValueOnce(err({ code: "RENDITION_UNDECODABLE", message: "bad", retryable: false }));
    const outcome = await makeRenditionHandler(w.deps).run(job(), live());
    expect(outcome).toEqual(err(expect.objectContaining({ retryable: false })));
    expect(w.writes).toEqual([]);
    expect(w.session.close).toHaveBeenCalledOnce();
  });

  it("a video that cannot be opened (probe failed): fails for good", async () => {
    const w = world(asset({ kind: "video", contentType: "video/mp4" }));
    w.deps.video.open.mockResolvedValueOnce(err({ code: "RENDITION_UNDECODABLE", message: "bad", retryable: false }));
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(err(expect.objectContaining({ retryable: false })));
    expect(w.writes).toEqual([]);
  });

  it("a storage failure is retryable (no retryable: false)", async () => {
    const w = world();
    w.deps.storage.download.mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "down" }));
    const outcome = await makeRenditionHandler(w.deps).run(job(), live());
    expect(outcome).toEqual(err({ code: "STORAGE_FAILED", message: "down" }));
  });

  it("a missing original fails for good", async () => {
    const w = world();
    w.objects.delete(ORIGINAL_KEY);
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(err(expect.objectContaining({ code: "ORIGINAL_NOT_FOUND", retryable: false })));
  });

  it("an unknown asset fails for good; a removed one is skipped", async () => {
    const gone = world(null);
    expect(await makeRenditionHandler(gone.deps).run(job(), live())).toEqual(err(expect.objectContaining({ code: "NOT_FOUND", retryable: false })));
    const removed = world(asset({ deletedAt: "2026-10-20T11:00:00Z" }));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await makeRenditionHandler(removed.deps).run(job(), live())).toEqual(ok(undefined));
    vi.restoreAllMocks();
    expect(removed.deps.storage.download).not.toHaveBeenCalled();
    expect(removed.writes).toEqual([]);
  });

  it("a document is not renderable", async () => {
    const w = world(asset({ kind: "document", contentType: "application/pdf" }));
    expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(err(expect.objectContaining({ code: "NOT_RENDERABLE", retryable: false })));
    expect(w.deps.storage.download).not.toHaveBeenCalled();
  });

  it("an abort while rendering writes nothing and reports ABORTED", async () => {
    const w = world();
    const controller = new AbortController();
    w.deps.image.render.mockImplementationOnce(async () => {
      controller.abort();
      return ok({ bytes: new Uint8Array(3), width: 480, height: 320 });
    });
    expect(await makeRenditionHandler(w.deps).run(job(), controller.signal)).toEqual(err(expect.objectContaining({ code: "ABORTED" })));
    expect(w.writes).toEqual([]);
  });

  it("an abort between upload and row: no row is written", async () => {
    const w = world();
    const controller = new AbortController();
    w.deps.storage.upload.mockImplementationOnce(async () => {
      controller.abort();
      return ok(undefined);
    });
    expect(await makeRenditionHandler(w.deps).run(job(), controller.signal)).toEqual(err(expect.objectContaining({ code: "ABORTED" })));
    expect(w.deps.renditions.upsert).not.toHaveBeenCalled();
  });
});

describe("rendition handler: limits and clean-up", () => {
  it("a copy over the 50 MB bucket cap fails for good before any upload", async () => {
    const w = world(asset({ kind: "video", contentType: "video/mp4" }));
    vi.mocked(w.session.render).mockImplementation(async (spec) =>
      ok(spec.name === "video.poster" ? { bytes: new Uint8Array(5), width: 1, height: 1 } : { bytes: new Uint8Array(MAX_FILE_BYTES + 1), width: 1920, height: 1080 }),
    );
    const outcome = await makeRenditionHandler(w.deps).run(job(), live());
    expect(outcome).toEqual(err(expect.objectContaining({ code: "RENDITION_TOO_LARGE", retryable: false })));
    expect(w.writes).toEqual([expect.stringContaining(`${POSTER}.webp`), `row:${POSTER}`]);
  });

  it("an asset removed mid-render (upsert NOT_FOUND) is a success-skip", async () => {
    const w = world();
    w.deps.renditions.upsert.mockResolvedValueOnce(err({ code: "NOT_FOUND", message: "removed" }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(ok(undefined));
    } finally {
      write.mockRestore();
    }
    expect(w.deps.image.render).toHaveBeenCalledOnce();
  });

  it("a rejecting session.close() keeps the real outcome and logs a warning", async () => {
    const w = world(asset({ kind: "video", contentType: "video/mp4" }));
    w.session.close.mockRejectedValueOnce(new Error("EBUSY"));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(ok(undefined));
      const lines = write.mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as Record<string, unknown>);
      expect(lines).toContainEqual(expect.objectContaining({ level: "warn", msg: "rendition temp files not removed" }));
    } finally {
      write.mockRestore();
    }
  });

  it("a rejecting close does not hide a failure either", async () => {
    const w = world(asset({ kind: "video", contentType: "video/mp4" }));
    w.session.close.mockRejectedValueOnce(new Error("EBUSY"));
    vi.mocked(w.session.render).mockResolvedValueOnce(err({ code: "RENDITION_UNDECODABLE", message: "bad", retryable: false }));
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      expect(await makeRenditionHandler(w.deps).run(job(), live())).toEqual(err(expect.objectContaining({ code: "RENDITION_UNDECODABLE" })));
    } finally {
      write.mockRestore();
    }
  });
});
