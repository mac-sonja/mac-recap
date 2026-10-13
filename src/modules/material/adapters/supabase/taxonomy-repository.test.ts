import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseTaxonomyRepository } from "./taxonomy-repository";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const TEXT_ID = "eeeeeeee-0000-4000-8000-000000000001";

type Response = { data?: unknown; error: unknown };

/**
 * Stub of `rpc()` and `from()…` chains: every step returns the builder, which
 * awaits to the next queued response (the last one repeats).
 */
function stubClient(...responses: Response[]) {
  const queue = [...responses];
  const next = () => (queue.length > 1 ? queue.shift() : queue[0]) as Response;
  const builder: Record<string, unknown> = {};
  const step = () => vi.fn(() => builder);
  const calls = { select: step(), order: step() };
  Object.assign(builder, calls, { then: (resolve: (r: Response) => unknown) => resolve(next()) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => next());
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseTaxonomyRepository>[0];
  return { factory, from, rpc, ...calls };
}

let write: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  write.mockRestore();
});

const target = { caseId: CASE_ID, refKind: "asset" as const, refId: ASSET_ID, kind: "tag" as const, keys: ["app", "branding"] };

describe("createSupabaseTaxonomyRepository", () => {
  it("listTerms reads kind, key and label ordered by label then key", async () => {
    const rows = [
      { kind: "tag", key: "app", label: "App" },
      { kind: "flag", key: "confidential", label: "Riservato" },
    ];
    const stub = stubClient({ data: rows, error: null });
    expect(await createSupabaseTaxonomyRepository(stub.factory).listTerms()).toEqual({ ok: true, value: rows });
    expect(stub.from).toHaveBeenCalledWith("taxonomy_term");
    expect(stub.select).toHaveBeenCalledWith("kind, key, label");
    expect(stub.order.mock.calls).toEqual([
      ["label", { ascending: true }],
      ["key", { ascending: true }],
    ]);
  });

  it("listTerms with nothing seeded is []", async () => {
    const stub = stubClient({ data: [], error: null });
    expect(await createSupabaseTaxonomyRepository(stub.factory).listTerms()).toEqual({ ok: true, value: [] });
  });

  it("listTerms rejects a row of an unknown kind and logs once with the failing path only", async () => {
    const stub = stubClient({ data: [{ kind: "category", key: "secret_key", label: "SECRET-LABEL" }], error: null });
    const result = await createSupabaseTaxonomyRepository(stub.factory).listTerms();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TAXONOMY_INVALID");
    const lines = write.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "error", msg: expect.stringContaining("at kind") });
    expect(lines[0]).not.toMatch(/SECRET|secret_key|category/);
  });

  it("listTerms maps a DB failure to TAXONOMY_LOOKUP_FAILED", async () => {
    const stub = stubClient({ data: null, error: { code: "08006", message: "down" } });
    const result = await createSupabaseTaxonomyRepository(stub.factory).listTerms();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TAXONOMY_LOOKUP_FAILED");
  });

  it("setTerms calls set_material_terms and returns the previous keys", async () => {
    const stub = stubClient({ data: ["old"], error: null });
    expect(await createSupabaseTaxonomyRepository(stub.factory).setTerms(target)).toEqual({ ok: true, value: ["old"] });
    expect(stub.rpc).toHaveBeenCalledWith("set_material_terms", {
      p_case_id: CASE_ID,
      p_ref_kind: "asset",
      p_ref_id: ASSET_ID,
      p_kind: "tag",
      p_keys: ["app", "branding"],
    });
  });

  it("setTerms maps NOT_FOUND", async () => {
    const stub = stubClient({ data: null, error: { code: "P0001", message: "NOT_FOUND", details: null } });
    const result = await createSupabaseTaxonomyRepository(stub.factory).setTerms(target);
    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: expect.any(String), details: { caseId: CASE_ID, refKind: "asset", refId: ASSET_ID } },
    });
  });

  it("setTerms maps UNKNOWN_TERM, naming the key from the error detail", async () => {
    const stub = stubClient({ data: null, error: { code: "P0001", message: "UNKNOWN_TERM", details: "nope" } });
    const result = await createSupabaseTaxonomyRepository(stub.factory).setTerms(target);
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN_TERM", message: "Unknown term: nope.", details: { key: "nope" } } });
  });

  it("setTerms maps any other failure to TERMS_WRITE_FAILED and logs only the code", async () => {
    const stub = stubClient({ data: null, error: { code: "40001", message: "SECRET-detail" } });
    const result = await createSupabaseTaxonomyRepository(stub.factory).setTerms(target);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TERMS_WRITE_FAILED");
    const lines = write.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("40001");
    expect(lines[0]).not.toContain("SECRET");
  });

  it("caseTerms parses the links of each deliverable", async () => {
    const data = [
      { refKind: "asset", refId: ASSET_ID, terms: [{ kind: "tag", key: "app" }] },
      { refKind: "text", refId: TEXT_ID, terms: [] },
    ];
    const stub = stubClient({ data, error: null });
    expect(await createSupabaseTaxonomyRepository(stub.factory).caseTerms(CASE_ID)).toEqual({ ok: true, value: data });
    expect(stub.rpc).toHaveBeenCalledWith("case_material_terms", { p_case_id: CASE_ID });
  });

  it("caseTerms rejects a malformed payload and logs once with the failing paths and the case id", async () => {
    const stub = stubClient({ data: [{ refKind: "form_field", refId: "context", terms: [] }], error: null });
    const result = await createSupabaseTaxonomyRepository(stub.factory).caseTerms(CASE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TAXONOMY_INVALID");
    const lines = write.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "error", msg: expect.stringMatching(/at 0\.refKind, 0\.refId$/), caseId: CASE_ID });
    expect(lines[0]).not.toMatch(/form_field|context/);
  });

  it("caseTerms maps a DB failure to TAXONOMY_LOOKUP_FAILED", async () => {
    const stub = stubClient({ data: null, error: { code: "08006", message: "down" } });
    const result = await createSupabaseTaxonomyRepository(stub.factory).caseTerms(CASE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TAXONOMY_LOOKUP_FAILED");
  });
});
