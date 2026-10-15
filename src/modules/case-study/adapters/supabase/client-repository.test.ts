import { describe, expect, it, vi } from "vitest";
import { createSupabaseClientRepository } from "./client-repository";

const client = (over: Record<string, unknown> = {}) => ({
  id: "cccccccc-0000-4000-8000-000000000001",
  name: "Lumen Srl",
  code: "LUM",
  ...over,
});

/**
 * Stub of `from().select().is?().eq?().order?().maybeSingle?()` and `rpc()`: every step
 * returns the builder, which awaits (and `maybeSingle` resolves) to `response`;
 * `rpc` resolves to `rpcResponse`.
 */
function stubClient(
  response: { data: unknown; error: unknown },
  rpcResponse: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const order = vi.fn(() => builder);
  const is = vi.fn(() => builder);
  const eq = vi.fn(() => builder);
  const maybeSingle = vi.fn(async () => response);
  Object.assign(builder, { select, order, is, eq, maybeSingle, then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => rpcResponse);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseClientRepository>[0];
  return { factory, from, select, order, is, eq, rpc };
}

const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const dbRow = (over: Record<string, unknown> = {}) => ({
  ...client(),
  name_key: "lumen srl",
  created_by: ACTOR_ID,
  created_at: "2026-10-15T10:00:00+00:00",
  updated_at: "2026-10-15T10:00:00+00:00",
  ...over,
});

/** Silences the JSON logger for one test and hands back its calls. */
async function quietly<T>(run: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const result = await run();
    return { result, lines: write.mock.calls.map((c) => String(c[0])) };
  } finally {
    write.mockRestore();
  }
}

describe("createSupabaseClientRepository().list", () => {
  it("reads id, name and code of every client, by name with an id tie-break", async () => {
    const { factory, from, select, order } = stubClient({ data: [client()], error: null });
    expect(await createSupabaseClientRepository(factory).list()).toEqual({ ok: true, value: [client()] });
    expect(from).toHaveBeenCalledWith("client");
    expect(select).toHaveBeenCalledWith("id, name, code");
    expect(order.mock.calls).toEqual([
      ["name", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("returns CLIENT_LOOKUP_FAILED and logs the code when the query errors", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
      const result = await createSupabaseClientRepository(factory).list();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CLIENT_LOOKUP_FAILED");
      expect(String(write.mock.calls[0][0])).toContain("PGRST000");
    } finally {
      write.mockRestore();
    }
  });

  it("returns CLIENT_INVALID when a row fails validation", async () => {
    const { factory } = stubClient({ data: [client({ id: "not-a-uuid" })], error: null });
    const result = await createSupabaseClientRepository(factory).list();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_INVALID");
  });
});

describe("createSupabaseClientRepository().listWithCaseCounts", () => {
  it("counts only non-deleted cases, by name with an id tie-break", async () => {
    const { factory, from, select, is, order } = stubClient({ data: [{ ...client(), case_study: [{ count: 3 }] }], error: null });
    expect(await createSupabaseClientRepository(factory).listWithCaseCounts()).toEqual({
      ok: true,
      value: [{ ...client(), caseCount: 3 }],
    });
    expect(from).toHaveBeenCalledWith("client");
    expect(select).toHaveBeenCalledWith("id, name, code, case_study(count)");
    expect(is).toHaveBeenCalledExactlyOnceWith("case_study.deleted_at", null);
    expect(order.mock.calls).toEqual([
      ["name", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("returns CLIENT_INVALID when a count is missing", async () => {
    const { factory } = stubClient({ data: [{ ...client(), case_study: [] }], error: null });
    const result = await createSupabaseClientRepository(factory).listWithCaseCounts();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_INVALID");
  });

  it("returns CLIENT_LOOKUP_FAILED when the query errors", async () => {
    const { factory } = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
    const { result } = await quietly(() => createSupabaseClientRepository(factory).listWithCaseCounts());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_LOOKUP_FAILED");
  });
});

describe("createSupabaseClientRepository().findById", () => {
  it("returns the client, or null when unknown", async () => {
    const found = stubClient({ data: client(), error: null });
    expect(await createSupabaseClientRepository(found.factory).findById(client().id)).toEqual({ ok: true, value: client() });
    expect(found.eq).toHaveBeenCalledWith("id", client().id);
    const missing = stubClient({ data: null, error: null });
    expect(await createSupabaseClientRepository(missing.factory).findById(client().id)).toEqual({ ok: true, value: null });
  });

  it("returns CLIENT_LOOKUP_FAILED when the query errors", async () => {
    const { factory } = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
    const { result } = await quietly(() => createSupabaseClientRepository(factory).findById(client().id));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_LOOKUP_FAILED");
  });
});

describe("createSupabaseClientRepository().create", () => {
  it("calls create_client with the name and the actor and returns the client", async () => {
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: dbRow(), error: null });
    expect(await createSupabaseClientRepository(factory).create("Lumen Srl", ACTOR_ID)).toEqual({ ok: true, value: client() });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_client", { p_name: "Lumen Srl", p_actor_id: ACTOR_ID });
  });

  it.each(["CLIENT_NAME_TAKEN", "CLIENT_CODE_EXHAUSTED"])("maps P0001 %s to its code", async (code) => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: code } });
    const result = await createSupabaseClientRepository(factory).create("Lumen Srl", ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("returns CLIENT_WRITE_FAILED for any other error, including an unknown P0001 message", async () => {
    for (const error of [{ code: "P0001", message: "something else" }, { code: "23505", message: "dup" }]) {
      const { factory } = stubClient({ data: null, error: null }, { data: null, error });
      const { result } = await quietly(() => createSupabaseClientRepository(factory).create("Lumen Srl", ACTOR_ID));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CLIENT_WRITE_FAILED");
    }
  });
});

describe("createSupabaseClientRepository().rename", () => {
  it("calls rename_client with the id, the name and the actor", async () => {
    const renamed = dbRow({ name: "Lumen S.r.l." });
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: renamed, error: null });
    expect(await createSupabaseClientRepository(factory).rename(client().id, "Lumen S.r.l.", ACTOR_ID)).toEqual({
      ok: true,
      value: client({ name: "Lumen S.r.l." }),
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("rename_client", {
      p_client_id: client().id,
      p_name: "Lumen S.r.l.",
      p_actor_id: ACTOR_ID,
    });
  });

  it.each(["CLIENT_NOT_FOUND", "CLIENT_NAME_TAKEN"])("maps P0001 %s to its code", async (code) => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: code } });
    const result = await createSupabaseClientRepository(factory).rename(client().id, "X", ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("does not map CLIENT_CODE_EXHAUSTED on rename (rename_client never raises it)", async () => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "CLIENT_CODE_EXHAUSTED" } });
    const { result } = await quietly(() => createSupabaseClientRepository(factory).rename(client().id, "X", ACTOR_ID));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_WRITE_FAILED");
  });
});
