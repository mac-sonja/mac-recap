import { describe, expect, it, vi } from "vitest";
import { createSupabaseCaseStudyRepository } from "./case-study-repository";

const row = (over: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "Rebrand",
  client: "Acme",
  year: 2026,
  locale: "it",
  status: "approved",
  project_order_ref: null,
  head_revision_id: null,
  approved_revision_id: null,
  head_version: 0,
  created_by: "00000000-0000-4000-8000-000000000002",
  created_at: "2026-10-01T10:00:00+00:00",
  updated_at: "2026-10-13T07:05:00+00:00",
  deleted_at: null,
  ...over,
});

/** Stub of `from().select().is().eq?().order().order()`: every step returns the builder, which awaits to `response`. */
function stubClient(response: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const step = () => vi.fn(() => builder);
  const select = step();
  const is = step();
  const eq = step();
  const order = step();
  Object.assign(builder, { select, is, eq, order, then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const factory = (() => ({ from })) as unknown as Parameters<typeof createSupabaseCaseStudyRepository>[0];
  return { factory, from, is, eq, order };
}

describe("createSupabaseCaseStudyRepository().list", () => {
  it("returns CASE_STUDY_LOOKUP_FAILED and logs when the query errors", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
      const result = await createSupabaseCaseStudyRepository(factory).list({});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CASE_STUDY_LOOKUP_FAILED");
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "error" });
      expect(entry.msg).toContain("PGRST000");
    } finally {
      write.mockRestore();
    }
  });

  it("returns the mapping err when a row is invalid", async () => {
    const { factory } = stubClient({ data: [row(), row({ id: "bbbbbbbb-0000-4000-8000-000000000002", status: "archived" })], error: null });
    const result = await createSupabaseCaseStudyRepository(factory).list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CASE_STUDY_INVALID");
  });

  it("lists every status without a status filter, non-deleted, newest first with an id tie-break", async () => {
    const { factory, from, is, eq, order } = stubClient({ data: [row()], error: null });
    const result = await createSupabaseCaseStudyRepository(factory).list({});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.id)).toEqual([row().id]);
    expect(from).toHaveBeenCalledWith("case_study");
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(eq).not.toHaveBeenCalled();
    expect(order.mock.calls).toEqual([
      ["updated_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("filters by status when the scope sets one", async () => {
    const { factory, eq } = stubClient({ data: [], error: null });
    expect(await createSupabaseCaseStudyRepository(factory).list({ status: "approved" })).toEqual({ ok: true, value: [] });
    expect(eq).toHaveBeenCalledExactlyOnceWith("status", "approved");
  });
});
