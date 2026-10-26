import { describe, expect, it, vi } from "vitest";
import { createSupabaseClientSectorRepository } from "./client-sector-repository";

const ACTOR_ID = "00000000-0000-4000-8000-000000000002";

/** Stub of `from().select().order()` (awaited to `response`) and `rpc()` (resolved to `rpcResponse`). */
function stubClient(response: { data: unknown; error: unknown }, rpcResponse: { data: unknown; error: unknown } = { data: null, error: null }) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const order = vi.fn(() => builder);
  Object.assign(builder, { select, order, then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => rpcResponse);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseClientSectorRepository>[0];
  return { factory, from, select, order, rpc };
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    return await run();
  } finally {
    write.mockRestore();
  }
}

describe("createSupabaseClientSectorRepository().list", () => {
  it("reads key and label of every sector, in position order", async () => {
    const rows = [
      { key: "interior_design", label: "Interior design" },
      { key: "nautica", label: "Nautica" },
    ];
    const { factory, from, select, order } = stubClient({ data: rows, error: null });
    expect(await createSupabaseClientSectorRepository(factory).list()).toEqual({ ok: true, value: rows });
    expect(from).toHaveBeenCalledWith("client_sector");
    expect(select).toHaveBeenCalledWith("key, label");
    expect(order).toHaveBeenCalledWith("position", { ascending: true });
  });

  it("returns CLIENT_LOOKUP_FAILED when the read fails, CLIENT_INVALID for a malformed key", async () => {
    const failed = stubClient({ data: null, error: { code: "XX000", message: "boom" } });
    expect(await quietly(() => createSupabaseClientSectorRepository(failed.factory).list())).toMatchObject({
      ok: false,
      error: { code: "CLIENT_LOOKUP_FAILED" },
    });
    const malformed = stubClient({ data: [{ key: "Nautica!", label: "Nautica" }], error: null });
    expect(await createSupabaseClientSectorRepository(malformed.factory).list()).toMatchObject({ ok: false, error: { code: "CLIENT_INVALID" } });
  });
});

describe("createSupabaseClientSectorRepository().add", () => {
  it("calls add_client_sector with the label and the actor and maps the row", async () => {
    const row = { key: "nautica", label: "Nautica", label_key: "nautica", position: 5, created_by: ACTOR_ID, created_at: "2026-10-22T10:00:00Z" };
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: row, error: null });
    expect(await createSupabaseClientSectorRepository(factory).add("Nautica", ACTOR_ID)).toEqual({
      ok: true,
      value: { key: "nautica", label: "Nautica" },
    });
    expect(rpc).toHaveBeenCalledWith("add_client_sector", { p_label: "Nautica", p_actor_id: ACTOR_ID });
  });

  it("maps P0001 SECTOR_LABEL_INVALID naming the label; anything else is CLIENT_WRITE_FAILED", async () => {
    const refused = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "SECTOR_LABEL_INVALID" } });
    expect(await createSupabaseClientSectorRepository(refused.factory).add("N", ACTOR_ID)).toMatchObject({
      ok: false,
      error: { code: "SECTOR_LABEL_INVALID", details: { fields: ["label"] } },
    });
    for (const rpcResponse of [{ data: null, error: { code: "XX000", message: "boom" } }, { data: null, error: null }]) {
      const { factory } = stubClient({ data: null, error: null }, rpcResponse);
      expect(await quietly(() => createSupabaseClientSectorRepository(factory).add("Nautica", ACTOR_ID))).toMatchObject({
        ok: false,
        error: { code: "CLIENT_WRITE_FAILED" },
      });
    }
  });
});
