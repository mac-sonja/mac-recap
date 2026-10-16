import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseJobRepository } from "./job-repository";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const SUBJECT = "bbbbbbbb-0000-4000-8000-000000000001";

const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  kind: "rendition",
  subject_id: SUBJECT,
  input_hash: "h",
  payload: { assetId: "x" },
  status: "running",
  attempts: 1,
  max_attempts: 3,
  locked_until: "2026-10-16T10:10:00+00:00",
  error: null,
  created_at: "2026-10-16T10:00:00+00:00",
  updated_at: "2026-10-16T10:00:00+00:00",
  finished_at: null,
  ...over,
});

const domain = {
  id: ID,
  kind: "rendition",
  subjectId: SUBJECT,
  inputHash: "h",
  payload: { assetId: "x" },
  status: "running",
  attempts: 1,
  maxAttempts: 3,
  lockedUntil: "2026-10-16T10:10:00+00:00",
  error: null,
  createdAt: "2026-10-16T10:00:00+00:00",
  updatedAt: "2026-10-16T10:00:00+00:00",
  finishedAt: null,
};

/** Stub of `rpc()` and `from().select().eq().order().order()`. */
function stub(rpcResponse: { data: unknown; error: unknown }, listResponse: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const eq = vi.fn(() => builder);
  const order = vi.fn(() => builder);
  const limit = vi.fn(() => builder);
  Object.assign(builder, { select, eq, order, limit, then: (resolve: (r: typeof listResponse) => unknown) => resolve(listResponse) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => rpcResponse);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseJobRepository>[0];
  return { repo: createSupabaseJobRepository(factory), rpc, from, select, eq, order, limit };
}

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => vi.restoreAllMocks());

describe("claim", () => {
  it("calls jobs_claim with the kinds and maps the claimed row", async () => {
    const { repo, rpc } = stub({ data: [row()], error: null });
    expect(await repo.claim(["rendition", "export"])).toEqual({ ok: true, value: domain });
    expect(rpc).toHaveBeenCalledWith("jobs_claim", { p_kinds: ["rendition", "export"] });
  });

  it("is null when nothing is claimable", async () => {
    expect(await stub({ data: [], error: null }).repo.claim([])).toEqual({ ok: true, value: null });
  });

  it("is JOB_LOOKUP_FAILED on a database error", async () => {
    const result = await stub({ data: null, error: { code: "08006", message: "down" } }).repo.claim(["rendition"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("JOB_LOOKUP_FAILED");
  });

  it("is JOB_INVALID for a row outside the domain", async () => {
    const result = await stub({ data: [row({ status: "paused" })], error: null }).repo.claim(["rendition"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("JOB_INVALID");
  });
});

describe("fenced calls", () => {
  it.each([
    ["renew", "jobs_renew"],
    ["finish", "jobs_finish"],
    ["release", "jobs_release"],
  ] as const)("%s calls %s on (id, attempts) and returns its boolean", async (method, fn) => {
    const yes = stub({ data: true, error: null });
    expect(await yes.repo[method]({ id: ID, attempts: 2 })).toEqual({ ok: true, value: true });
    expect(yes.rpc).toHaveBeenCalledWith(fn, { p_id: ID, p_attempts: 2 });
    expect(await stub({ data: false, error: null }).repo[method]({ id: ID, attempts: 2 })).toEqual({ ok: true, value: false });
    const failed = await stub({ data: null, error: { code: "08006", message: "down" } }).repo[method]({ id: ID, attempts: 2 });
    expect(failed.ok).toBe(false);
  });

  it("fail sends { code, message }, the delay in ms and retryable, and returns the job", async () => {
    const { repo, rpc } = stub({ data: [row({ status: "queued", error: { code: "X", message: "m" } })], error: null });
    const result = await repo.fail(
      { id: ID, attempts: 1 },
      { error: { code: "X", message: "m" }, retryAfterMs: 30_000, retryable: true },
    );
    expect(result.ok && result.value?.status).toBe("queued");
    expect(rpc).toHaveBeenCalledWith("jobs_fail", {
      p_id: ID,
      p_attempts: 1,
      p_error: { code: "X", message: "m" },
      p_retry_after: 30_000,
      p_retryable: true,
    });
  });

  it.each([
    [Number.MAX_SAFE_INTEGER, 2_147_483_647],
    [-5, 0],
    [1.4, 1],
  ])("fail sends a retry delay of %d ms as %d (fits a Postgres integer)", async (delay, sent) => {
    const { repo, rpc } = stub({ data: [], error: null });
    await repo.fail({ id: ID, attempts: 1 }, { error: { code: "X", message: "m" }, retryAfterMs: delay, retryable: true });
    expect(rpc).toHaveBeenCalledWith("jobs_fail", expect.objectContaining({ p_retry_after: sent }));
  });

  it("fail is null when the lease is lost", async () => {
    const { repo } = stub({ data: [], error: null });
    expect(await repo.fail({ id: ID, attempts: 1 }, { error: { code: "X", message: "m" }, retryAfterMs: 1, retryable: true })).toEqual({
      ok: true,
      value: null,
    });
  });
});

describe("enqueue", () => {
  const input = { kind: "rendition" as const, subjectId: SUBJECT, inputHash: "h", payload: { assetId: "x" } };

  it("calls jobs_enqueue and returns the job", async () => {
    const { repo, rpc } = stub({ data: [row({ status: "queued", attempts: 0, locked_until: null })], error: null });
    const result = await repo.enqueue(input);
    expect(result.ok && result.value.status).toBe("queued");
    expect(rpc).toHaveBeenCalledWith("jobs_enqueue", {
      p_kind: "rendition",
      p_subject_id: SUBJECT,
      p_input_hash: "h",
      p_payload: { assetId: "x" },
    });
  });

  it("maps a check violation to INVALID_INPUT", async () => {
    const result = await stub({ data: null, error: { code: "23514", message: "check" } }).repo.enqueue(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("is JOB_WRITE_FAILED when no row comes back", async () => {
    const result = await stub({ data: [], error: null }).repo.enqueue(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("JOB_WRITE_FAILED");
  });
});

describe("listBySubject", () => {
  it("reads every column but payload, the newest 50 first with an id tie-break", async () => {
    const { payload: _p, ...withoutPayload } = row();
    void _p;
    const { repo, from, select, eq, order, limit } = stub({ data: null, error: null }, { data: [withoutPayload], error: null });
    const { payload: _d, ...summary } = domain;
    void _d;
    expect(await repo.listBySubject(SUBJECT)).toEqual({ ok: true, value: [summary] });
    expect(from).toHaveBeenCalledWith("job");
    expect(select.mock.calls[0]).toEqual([expect.not.stringContaining("payload")]);
    expect(eq).toHaveBeenCalledWith("subject_id", SUBJECT);
    expect(order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
    expect(limit).toHaveBeenCalledWith(50);
  });
});
