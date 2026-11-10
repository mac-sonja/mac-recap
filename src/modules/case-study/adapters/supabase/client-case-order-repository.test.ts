import { describe, expect, it, vi } from "vitest";
import { createSupabaseClientCaseOrderRepository } from "./client-case-order-repository";

const CLIENT_ID = "11111111-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const A = "aaaaaaaa-0000-4000-8000-000000000001";

/** Stub of `from().select().eq().maybeSingle()` (resolved to `response`) and `rpc()` (resolved to `rpcResponse`). */
function stubClient(response: { data: unknown; error: unknown }, rpcResponse: { data: unknown; error: unknown } = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const eq = vi.fn(() => builder);
  const maybeSingle = vi.fn(async () => response);
  Object.assign(builder, { select, eq, maybeSingle });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => rpcResponse);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseClientCaseOrderRepository>[0];
  return { factory, from, select, eq, rpc };
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    return await run();
  } finally {
    write.mockRestore();
  }
}

describe("createSupabaseClientCaseOrderRepository().find", () => {
  it("reads the client's saved ids, or null with no row", async () => {
    const saved = stubClient({ data: { case_ids: [A] }, error: null });
    expect(await createSupabaseClientCaseOrderRepository(saved.factory).find(CLIENT_ID)).toEqual({ ok: true, value: [A] });
    expect(saved.from).toHaveBeenCalledWith("client_case_order");
    expect(saved.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    const none = stubClient({ data: null, error: null });
    expect(await createSupabaseClientCaseOrderRepository(none.factory).find(CLIENT_ID)).toEqual({ ok: true, value: null });
  });

  it("returns CLIENT_LOOKUP_FAILED when the read fails", async () => {
    const failed = stubClient({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await quietly(() => createSupabaseClientCaseOrderRepository(failed.factory).find(CLIENT_ID))).toMatchObject({
      ok: false,
      error: { code: "CLIENT_LOOKUP_FAILED" },
    });
  });
});

describe("createSupabaseClientCaseOrderRepository().set", () => {
  it("calls set_client_case_order with the ids in order and the actor", async () => {
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: [A], error: null });
    expect(await createSupabaseClientCaseOrderRepository(factory).set(CLIENT_ID, [A], ACTOR_ID)).toEqual({ ok: true, value: [A] });
    expect(rpc).toHaveBeenCalledWith("set_client_case_order", { p_client_id: CLIENT_ID, p_case_ids: [A], p_actor_id: ACTOR_ID });
  });

  it("maps INVALID_INPUT and CLIENT_NOT_FOUND, and any other failure to CLIENT_WRITE_FAILED", async () => {
    const foreign = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "INVALID_INPUT" } });
    expect(await createSupabaseClientCaseOrderRepository(foreign.factory).set(CLIENT_ID, [A], ACTOR_ID)).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", details: { fields: ["caseIds"] } },
    });
    const gone = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "CLIENT_NOT_FOUND" } });
    expect(await createSupabaseClientCaseOrderRepository(gone.factory).set(CLIENT_ID, [A], ACTOR_ID)).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
    const failed = stubClient({ data: null, error: null }, { data: null, error: { code: "XX000", message: "boom" } });
    expect(await quietly(() => createSupabaseClientCaseOrderRepository(failed.factory).set(CLIENT_ID, [A], ACTOR_ID))).toMatchObject({
      ok: false,
      error: { code: "CLIENT_WRITE_FAILED" },
    });
  });
});
