import { describe, expect, it, vi } from "vitest";
import { createSupabaseClientRepository } from "./client-repository";

const client = (over: Record<string, unknown> = {}) => ({
  id: "cccccccc-0000-4000-8000-000000000001",
  name: "Lumen Srl",
  code: "LUM",
  ...over,
});

/** Stub of `from().select().order().order()`: every step returns the builder, which awaits to `response`. */
function stubClient(response: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const select = vi.fn(() => builder);
  const order = vi.fn(() => builder);
  Object.assign(builder, { select, order, then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const factory = (() => ({ from })) as unknown as Parameters<typeof createSupabaseClientRepository>[0];
  return { factory, from, select, order };
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
