import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseDetailsFormRepository } from "./details-form-repository";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";

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
  const calls = { select: step(), eq: step(), maybeSingle: step() };
  Object.assign(builder, calls, { then: (resolve: (r: Response) => unknown) => resolve(next()) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => next());
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseDetailsFormRepository>[0];
  return { factory, from, rpc, ...calls };
}

let write: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  write.mockRestore();
});

const logLines = () => write.mock.calls.map((call: unknown[]) => String(call[0]));

describe("createSupabaseDetailsFormRepository", () => {
  it("saveField calls save_context_field and returns the previous text", async () => {
    const stub = stubClient({ data: "Vecchio", error: null });
    const repo = createSupabaseDetailsFormRepository(stub.factory);
    expect(await repo.saveField(CASE_ID, "context", "Nuovo", ACTOR_ID)).toEqual({ ok: true, value: "Vecchio" });
    expect(stub.rpc).toHaveBeenCalledWith("save_context_field", {
      p_case_id: CASE_ID,
      p_field: "context",
      p_text: "Nuovo",
      p_actor_id: ACTOR_ID,
    });
  });

  it("saveField returns '' as the previous text of a first save", async () => {
    const stub = stubClient({ data: "", error: null });
    expect(await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "results", "R", ACTOR_ID)).toEqual({
      ok: true,
      value: "",
    });
  });

  it("saveField maps NOT_FOUND", async () => {
    const stub = stubClient({ data: null, error: { code: "P0001", message: "NOT_FOUND" } });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "context", "x", ACTOR_ID);
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND", message: expect.any(String), details: { caseId: CASE_ID } } });
  });

  it("saveField maps UNKNOWN_FIELD, naming the field", async () => {
    const stub = stubClient({ data: null, error: { code: "P0001", message: "UNKNOWN_FIELD" } });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "context", "x", ACTOR_ID);
    expect(result).toEqual({
      ok: false,
      error: { code: "UNKNOWN_FIELD", message: "Unknown field: context.", details: { field: "context" } },
    });
  });

  it("saveField maps a length check violation to INVALID_INPUT naming text", async () => {
    const stub = stubClient({
      data: null,
      error: { code: "23514", message: 'new row violates check constraint "context_form_context_check"' },
    });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "context", "x", ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "INVALID_INPUT",
        details: { fields: ["text"], issues: [{ field: "text", message: "Must be at most 5,000 characters." }] },
      });
    }
  });

  it.each([
    ["saveField", (repo: ReturnType<typeof createSupabaseDetailsFormRepository>) => repo.saveField(CASE_ID, "context", "x", ACTOR_ID)],
    ["read", (repo: ReturnType<typeof createSupabaseDetailsFormRepository>) => repo.read(CASE_ID)],
  ])("%s logs no-code for an error without a code", async (_name, call) => {
    const stub = stubClient({ data: null, error: { message: "fetch failed" } });
    expect((await call(createSupabaseDetailsFormRepository(stub.factory))).ok).toBe(false);
    const lines = logLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("failed: no-code");
    expect(lines[0]).not.toContain("undefined");
  });

  it("saveField maps any other failure to DETAILS_WRITE_FAILED and logs only the code and ids, never the text", async () => {
    const stub = stubClient({ data: null, error: { code: "40001", message: "SECRET-detail" } });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "context", "SECRET-TEXT", ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DETAILS_WRITE_FAILED");
    const lines = logLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "error", caseId: CASE_ID, actorId: ACTOR_ID });
    expect(lines[0]).toContain("40001");
    expect(lines[0]).not.toContain("SECRET");
  });

  it("saveField rejects a non-text payload", async () => {
    const stub = stubClient({ data: 42, error: null });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "context", "x", ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DETAILS_INVALID");
  });

  it("read selects the three fields of the case's row", async () => {
    const stub = stubClient({ data: { context: "C", solution: "", results: "R" }, error: null });
    expect(await createSupabaseDetailsFormRepository(stub.factory).read(CASE_ID)).toEqual({
      ok: true,
      value: { context: "C", solution: "", results: "R" },
    });
    expect(stub.from).toHaveBeenCalledWith("context_form");
    expect(stub.select).toHaveBeenCalledWith("context, solution, results");
    expect(stub.eq).toHaveBeenCalledWith("case_id", CASE_ID);
  });

  it("read with no row → all three fields ''", async () => {
    const stub = stubClient({ data: null, error: null });
    expect(await createSupabaseDetailsFormRepository(stub.factory).read(CASE_ID)).toEqual({
      ok: true,
      value: { context: "", solution: "", results: "" },
    });
  });

  it("read rejects a malformed row and logs without the text", async () => {
    const stub = stubClient({ data: { context: "SECRET", solution: null, results: "" }, error: null });
    const result = await createSupabaseDetailsFormRepository(stub.factory).read(CASE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DETAILS_INVALID");
    expect(logLines().join("")).not.toContain("SECRET");
  });

  it("read maps a DB failure to DETAILS_LOOKUP_FAILED", async () => {
    const stub = stubClient({ data: null, error: { code: "08006", message: "down" } });
    const result = await createSupabaseDetailsFormRepository(stub.factory).read(CASE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DETAILS_LOOKUP_FAILED");
  });
});
