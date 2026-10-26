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
    expect(await createSupabaseDetailsFormRepository(stub.factory).saveField(CASE_ID, "solution", "R", ACTOR_ID)).toEqual({
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

  it("read selects the fields of the case's row", async () => {
    const stub = stubClient({
      data: { context: "C", solution: "", results: [{ label: "Iscritti", value: "+30%" }], testimonial_quote: "Sì.", testimonial_author: "" },
      error: null,
    });
    expect(await createSupabaseDetailsFormRepository(stub.factory).read(CASE_ID)).toEqual({
      ok: true,
      value: { context: "C", solution: "", results: [{ label: "Iscritti", value: "+30%" }], testimonialQuote: "Sì.", testimonialAuthor: "" },
    });
    expect(stub.from).toHaveBeenCalledWith("context_form");
    expect(stub.select).toHaveBeenCalledWith("context, solution, results, testimonial_quote, testimonial_author");
    expect(stub.eq).toHaveBeenCalledWith("case_id", CASE_ID);
  });

  it("read with no row → every text '' and no results", async () => {
    const stub = stubClient({ data: null, error: null });
    expect(await createSupabaseDetailsFormRepository(stub.factory).read(CASE_ID)).toEqual({
      ok: true,
      value: { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" },
    });
  });

  it("saveResults calls save_case_results with label and value only and returns the previous list", async () => {
    const stub = stubClient({ data: [{ label: "Vecchio", value: "1" }], error: null });
    const repo = createSupabaseDetailsFormRepository(stub.factory);
    const results = [{ label: "Iscritti", value: "+30%", extra: "x" } as { label: string; value: string }];
    expect(await repo.saveResults(CASE_ID, results, ACTOR_ID)).toEqual({ ok: true, value: [{ label: "Vecchio", value: "1" }] });
    expect(stub.rpc).toHaveBeenCalledWith("save_case_results", {
      p_case_id: CASE_ID,
      p_results: [{ label: "Iscritti", value: "+30%" }],
      p_actor_id: ACTOR_ID,
    });
  });

  it("saveTestimonial calls save_case_testimonial and returns the previous pair", async () => {
    const stub = stubClient({ data: { quote: "", author: "" }, error: null });
    const repo = createSupabaseDetailsFormRepository(stub.factory);
    expect(await repo.saveTestimonial(CASE_ID, "Sì.", "Anna", ACTOR_ID)).toEqual({ ok: true, value: { quote: "", author: "" } });
    expect(stub.rpc).toHaveBeenCalledWith("save_case_testimonial", {
      p_case_id: CASE_ID,
      p_quote: "Sì.",
      p_author: "Anna",
      p_actor_id: ACTOR_ID,
    });
  });

  it.each([
    ["context_form_results_check", "results"],
    ["context_form_testimonial_quote_check", "quote"],
    ["context_form_testimonial_author_check", "author"],
    ["context_form_testimonial_check", "quote"],
  ])("a %s violation → INVALID_INPUT naming %s", async (check, field) => {
    const stub = stubClient({ data: null, error: { code: "23514", message: `new row violates check constraint "${check}"` } });
    const repo = createSupabaseDetailsFormRepository(stub.factory);
    const result = check.includes("results")
      ? await repo.saveResults(CASE_ID, [], ACTOR_ID)
      : await repo.saveTestimonial(CASE_ID, "", "x", ACTOR_ID);
    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: [field] } } });
  });

  it("saveResults and saveTestimonial map NOT_FOUND", async () => {
    const stub = stubClient({ data: null, error: { code: "P0001", message: "NOT_FOUND" } });
    const repo = createSupabaseDetailsFormRepository(stub.factory);
    expect(await repo.saveResults(CASE_ID, [], ACTOR_ID)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await repo.saveTestimonial(CASE_ID, "", "", ACTOR_ID)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("saveResults maps any other failure to DETAILS_WRITE_FAILED, logging no text", async () => {
    const stub = stubClient({ data: null, error: { code: "40001", message: "SECRET" } });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveResults(CASE_ID, [{ label: "SECRET", value: "1" }], ACTOR_ID);
    expect(result).toMatchObject({ ok: false, error: { code: "DETAILS_WRITE_FAILED" } });
    expect(logLines().join("")).toContain("save_case_results failed: 40001");
    expect(logLines().join("")).not.toContain("SECRET");
  });

  it("saveTestimonial maps any other failure to DETAILS_WRITE_FAILED, logging no text", async () => {
    const stub = stubClient({ data: null, error: { code: "40001", message: "SECRET" } });
    const result = await createSupabaseDetailsFormRepository(stub.factory).saveTestimonial(CASE_ID, "SECRET-QUOTE", "SECRET-AUTHOR", ACTOR_ID);
    expect(result).toMatchObject({ ok: false, error: { code: "DETAILS_WRITE_FAILED" } });
    expect(logLines().join("")).toContain("save_case_testimonial failed: 40001");
    expect(logLines().join("")).not.toContain("SECRET");
  });

  it("saveResults and saveTestimonial reject a malformed previous value", async () => {
    const stub = stubClient({ data: "nope", error: null });
    const repo = createSupabaseDetailsFormRepository(stub.factory);
    expect(await repo.saveResults(CASE_ID, [], ACTOR_ID)).toMatchObject({ ok: false, error: { code: "DETAILS_INVALID" } });
    expect(await repo.saveTestimonial(CASE_ID, "", "", ACTOR_ID)).toMatchObject({ ok: false, error: { code: "DETAILS_INVALID" } });
  });

  it("read rejects a malformed row and logs without the text", async () => {
    const stub = stubClient({ data: { context: "SECRET", solution: null, results: [], testimonial_quote: "", testimonial_author: "" }, error: null });
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
