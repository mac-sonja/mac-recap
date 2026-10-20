import { describe, expect, it, vi } from "vitest";
import type { Asset } from "@/modules/material/domain/asset";
import type { Rendition } from "@/modules/material/domain/rendition";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { err, ok } from "@/shared/result";
import { BACKFILL_PAGE, checkDevProject, makeBackfillRenditions } from "./backfill-renditions";
import type { Jobs } from "./deps";
import { renditionInputHash, specHashOf } from "./spec-hash";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const id = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;

const asset = (n: number, kind: "image" | "video" = "image"): Asset => ({
  id: id(n),
  caseId: CASE_ID,
  kind,
  originalFileName: "f",
  contentType: kind === "image" ? "image/png" : "video/mp4",
  sizeBytes: 10,
  createdBy: "00000000-0000-4000-8000-000000000002",
  createdAt: "2026-10-20T10:00:00Z",
  deletedAt: null,
  isFavourite: false,
});

const row = (assetId: string, name: Parameters<typeof specHashOf>[0]): Rendition => ({
  assetId,
  specHash: specHashOf(name),
  path: "p",
  contentType: "image/webp",
  width: 1,
  height: 1,
  sizeBytes: 1,
  createdAt: "t",
});

function world(all: Asset[], rows: Rendition[] = []) {
  const assets = {
    listLiveMediaPage: vi.fn<AssetRepository["listLiveMediaPage"]>(async (after, limit) => {
      const sorted = [...all].sort((a, b) => a.id.localeCompare(b.id));
      return ok(sorted.filter((a) => after === null || a.id > after).slice(0, limit));
    }),
  };
  const renditions = {
    listFor: vi.fn<RenditionRepository["listFor"]>(async (ids, hashes) => ok(rows.filter((r) => ids.includes(r.assetId) && hashes.includes(r.specHash)))),
  };
  const jobs = { enqueue: vi.fn<Jobs["enqueue"]>(async (input) => ok(input)) };
  return { assets, renditions, jobs, backfill: makeBackfillRenditions({ assets, renditions, jobs }) };
}

describe("backfillRenditions", () => {
  it("enqueues rendition for every image/video missing a row for its current specs, and only those", async () => {
    const w = world(
      [asset(1), asset(2), asset(3, "video"), asset(4, "video")],
      [row(id(1), "image.thumb"), row(id(1), "image.display"), row(id(2), "image.thumb"), row(id(3), "video.poster"), row(id(3), "video.display")],
    );
    expect(await w.backfill()).toEqual(ok({ checked: 4, enqueued: 2, failed: 0 }));
    expect(w.jobs.enqueue.mock.calls.map(([input]) => input)).toEqual([
      { kind: "rendition", subjectId: id(2), inputHash: renditionInputHash(id(2), "image"), payload: { caseId: CASE_ID } },
      { kind: "rendition", subjectId: id(4), inputHash: renditionInputHash(id(4), "video"), payload: { caseId: CASE_ID } },
    ]);
  });

  it("an old spec hash does not count as made", async () => {
    const stale = { ...row(id(1), "image.thumb"), specHash: "0123456789abcdef" };
    const w = world([asset(1)], [stale]);
    expect(await w.backfill()).toEqual(ok({ checked: 1, enqueued: 1, failed: 0 }));
  });

  it("pages through every asset", async () => {
    const all = Array.from({ length: BACKFILL_PAGE * 2 + 5 }, (_, i) => asset(i + 1));
    const w = world(all);
    expect(await w.backfill()).toEqual(ok({ checked: all.length, enqueued: all.length, failed: 0 }));
    expect(w.assets.listLiveMediaPage.mock.calls.map(([after]) => after)).toEqual([null, id(BACKFILL_PAGE), id(BACKFILL_PAGE * 2)]);
  });

  it("counts failed and throwing enqueues and goes on", async () => {
    const w = world([asset(1), asset(2), asset(3)]);
    w.jobs.enqueue.mockResolvedValueOnce(err({ code: "JOB_WRITE_FAILED", message: "down" }));
    w.jobs.enqueue.mockRejectedValueOnce(new Error("network"));
    expect(await w.backfill()).toEqual(ok({ checked: 3, enqueued: 1, failed: 2 }));
  });

  it("passes read failures through", async () => {
    const w = world([asset(1)]);
    w.renditions.listFor.mockResolvedValueOnce(err({ code: "RENDITION_LOOKUP_FAILED", message: "down" }));
    expect(await w.backfill()).toEqual(err({ code: "RENDITION_LOOKUP_FAILED", message: "down" }));
    expect(w.jobs.enqueue).not.toHaveBeenCalled();
  });
});

describe("checkDevProject", () => {
  it.each([
    ["https://qmptpiykbucbnsrqbgid.supabase.co", "PRODUCTION_REFUSED"],
    ["https://QMPTPIYKBUCBNSRQBGID.supabase.co", "PRODUCTION_REFUSED"],
    ["https://someone-else.supabase.co", "UNKNOWN_PROJECT_REFUSED"],
    ["https://example.com", "UNKNOWN_PROJECT_REFUSED"],
    ["not a url", "UNKNOWN_PROJECT_REFUSED"],
  ])("refuses %s (%s)", (url, code) => {
    expect(checkDevProject(url)).toMatchObject({ ok: false, error: { code } });
  });

  it.each([
    ["https://jydtnzbmzetbpyjppmxw.supabase.co", "dev"],
    ["http://127.0.0.1:54321", "local"],
    ["http://localhost:54321", "local"],
  ])("allows %s", (url, kind) => {
    expect(checkDevProject(url)).toEqual(ok(kind));
  });
});
