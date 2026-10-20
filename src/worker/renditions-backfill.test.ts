import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/result";
import { runRenditionsBackfill, type BackfillDeps } from "./renditions-backfill";

const deps = (over: Partial<BackfillDeps> = {}): BackfillDeps => ({
  loadEnv: () => ({ SUPABASE_URL: "https://jydtnzbmzetbpyjppmxw.supabase.co" }),
  checkDevProject: vi.fn(() => ok("dev" as const)),
  backfill: vi.fn(async () => ok({ checked: 3, enqueued: 2, failed: 0 })),
  ...over,
});

const lines = () =>
  vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as Record<string, unknown>);

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("runRenditionsBackfill", () => {
  it("checks the project, backfills and exits 0 with a summary", async () => {
    const d = deps();
    expect(await runRenditionsBackfill(d)).toBe(0);
    expect(d.checkDevProject).toHaveBeenCalledWith("https://jydtnzbmzetbpyjppmxw.supabase.co");
    expect(lines()).toEqual([expect.objectContaining({ level: "info", msg: expect.stringContaining("2 jobs enqueued") })]);
  });

  it("refuses the production project without backfilling (exit 1)", async () => {
    const d = deps({ checkDevProject: vi.fn(() => err({ code: "PRODUCTION_REFUSED", message: "no" })) });
    expect(await runRenditionsBackfill(d)).toBe(1);
    expect(d.backfill).not.toHaveBeenCalled();
    expect(lines()).toEqual([expect.objectContaining({ level: "error", msg: expect.stringContaining("PRODUCTION_REFUSED") })]);
  });

  it("an invalid environment exits 1 without backfilling", async () => {
    const d = deps({
      loadEnv: () => {
        throw new Error("SUPABASE_URL missing");
      },
    });
    expect(await runRenditionsBackfill(d)).toBe(1);
    expect(d.backfill).not.toHaveBeenCalled();
  });

  it("a failed backfill or failed enqueues exit 1", async () => {
    expect(await runRenditionsBackfill(deps({ backfill: async () => err({ code: "ASSET_LOOKUP_FAILED", message: "down" }) }))).toBe(1);
    expect(await runRenditionsBackfill(deps({ backfill: async () => ok({ checked: 2, enqueued: 1, failed: 1 }) }))).toBe(1);
  });
});
