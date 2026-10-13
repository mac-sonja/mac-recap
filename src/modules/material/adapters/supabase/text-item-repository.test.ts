import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseTextItemRepository } from "./text-item-repository";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const TEXT_ID = "eeeeeeee-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";

const row = (over: Record<string, unknown> = {}) => ({
  id: TEXT_ID,
  case_id: CASE_ID,
  title: "Brief",
  body: "Testo",
  created_by: ACTOR_ID,
  created_at: "2026-10-13T10:00:00+00:00",
  updated_at: "2026-10-13T10:00:00+00:00",
  deleted_at: null,
  ...over,
});

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
  const calls = {
    select: step(),
    insert: step(),
    update: step(),
    eq: step(),
    is: step(),
    not: step(),
    single: step(),
    maybeSingle: step(),
  };
  Object.assign(builder, calls, { then: (resolve: (r: Response) => unknown) => resolve(next()) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => next());
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseTextItemRepository>[0];
  return { factory, from, rpc, ...calls };
}

let write: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => {
  write.mockRestore();
});

const newItem = { caseId: CASE_ID, title: "SECRET-TITLE", body: "SECRET-BODY", createdBy: ACTOR_ID };

describe("createSupabaseTextItemRepository", () => {
  it("create inserts the item and maps the returned row", async () => {
    const stub = stubClient({ data: row(), error: null });
    const result = await createSupabaseTextItemRepository(stub.factory).create({ ...newItem, title: "Brief", body: "Testo" });
    expect(stub.from).toHaveBeenCalledWith("text_item");
    expect(stub.insert).toHaveBeenCalledWith({ case_id: CASE_ID, title: "Brief", body: "Testo", created_by: ACTOR_ID });
    expect(result).toEqual({
      ok: true,
      value: {
        id: TEXT_ID,
        caseId: CASE_ID,
        title: "Brief",
        body: "Testo",
        createdBy: ACTOR_ID,
        createdAt: "2026-10-13T10:00:00+00:00",
        updatedAt: "2026-10-13T10:00:00+00:00",
        deletedAt: null,
      },
    });
  });

  it.each([
    [{ code: "23514", message: 'new row for relation "text_item" violates check constraint "text_item_body_check"' }, "TEXT_EMPTY"],
    [{ code: "23514", message: 'violates check constraint "text_item_title_check"' }, "TEXT_WRITE_FAILED"],
    [{ code: "23503", message: 'violates foreign key constraint "text_item_case_id_fkey"' }, "NOT_FOUND"],
    [{ code: "23503", message: 'violates foreign key constraint "text_item_created_by_fkey"' }, "TEXT_WRITE_FAILED"],
    [{ code: "PGRST000", message: "down" }, "TEXT_WRITE_FAILED"],
  ])("create maps %o to %s and never logs the text", async (error, code) => {
    const result = await createSupabaseTextItemRepository(stubClient({ data: null, error }).factory).create(newItem);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
    for (const [line] of write.mock.calls) expect(String(line)).not.toMatch(/SECRET/);
  });

  it("create logs a created_by foreign key failure with its code only", async () => {
    const error = { code: "23503", message: 'violates foreign key constraint "text_item_created_by_fkey"' };
    await createSupabaseTextItemRepository(stubClient({ data: null, error }).factory).create(newItem);
    expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "error", msg: "text item create failed: 23503", caseId: CASE_ID });
  });

  it("create rejects a row outside the domain", async () => {
    const result = await createSupabaseTextItemRepository(stubClient({ data: row({ case_id: "x" }), error: null }).factory).create(newItem);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TEXT_ITEM_INVALID");
  });

  it("getLive reads only a live item of the case", async () => {
    const stub = stubClient({ data: row(), error: null });
    const result = await createSupabaseTextItemRepository(stub.factory).getLive(CASE_ID, TEXT_ID);
    expect(result.ok && result.value?.id).toBe(TEXT_ID);
    expect(stub.eq.mock.calls).toEqual([
      ["id", TEXT_ID],
      ["case_id", CASE_ID],
    ]);
    expect(stub.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("getLive returns null when nothing matched", async () => {
    const stub = stubClient({ data: null, error: null });
    expect(await createSupabaseTextItemRepository(stub.factory).getLive(CASE_ID, TEXT_ID)).toEqual({ ok: true, value: null });
  });

  it("update writes title and body on a live item only", async () => {
    const stub = stubClient({ data: row({ title: "Nuovo", body: "B" }), error: null });
    const result = await createSupabaseTextItemRepository(stub.factory).update(CASE_ID, TEXT_ID, { title: "Nuovo", body: "B" });
    expect(result.ok && result.value?.title).toBe("Nuovo");
    expect(stub.update).toHaveBeenCalledWith({ title: "Nuovo", body: "B" });
    expect(stub.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("update returns null when no live item matched, TEXT_EMPTY on the body check", async () => {
    expect(
      await createSupabaseTextItemRepository(stubClient({ data: null, error: null }).factory).update(CASE_ID, TEXT_ID, {
        title: "t",
        body: "b",
      }),
    ).toEqual({ ok: true, value: null });
    const refused = await createSupabaseTextItemRepository(
      stubClient({ data: null, error: { code: "23514", message: '"text_item_body_check"' } }).factory,
    ).update(CASE_ID, TEXT_ID, { title: "t", body: " " });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("TEXT_EMPTY");
  });

  it.each([
    [[{ id: TEXT_ID }], true],
    [[], false],
  ])("softDelete on %j → %s", async (data, expected) => {
    const stub = stubClient({ data, error: null });
    expect(await createSupabaseTextItemRepository(stub.factory).softDelete(CASE_ID, TEXT_ID)).toEqual({ ok: true, value: expected });
    expect(stub.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(stub.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("restore clears deleted_at on a removed item → true", async () => {
    const stub = stubClient({ data: [{ id: TEXT_ID }], error: null });
    expect(await createSupabaseTextItemRepository(stub.factory).restore(CASE_ID, TEXT_ID)).toEqual({ ok: true, value: true });
    expect(stub.update).toHaveBeenCalledWith({ deleted_at: null });
    expect(stub.not).toHaveBeenCalledWith("deleted_at", "is", null);
    expect(stub.from).toHaveBeenCalledTimes(1);
  });

  it("restore of a live item → false", async () => {
    const stub = stubClient({ data: [], error: null }, { data: { id: TEXT_ID }, error: null });
    expect(await createSupabaseTextItemRepository(stub.factory).restore(CASE_ID, TEXT_ID)).toEqual({ ok: true, value: false });
  });

  it("restore of an unknown item → NOT_FOUND", async () => {
    const stub = stubClient({ data: [], error: null }, { data: null, error: null });
    const result = await createSupabaseTextItemRepository(stub.factory).restore(CASE_ID, TEXT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it.each([true, false])("hasMaterial returns has_material's %s", async (data) => {
    const stub = stubClient({ data, error: null });
    expect(await createSupabaseTextItemRepository(stub.factory).hasMaterial(CASE_ID)).toEqual({ ok: true, value: data });
    expect(stub.rpc).toHaveBeenCalledWith("has_material", { p_case_id: CASE_ID });
  });

  it("hasMaterial returns MATERIAL_LOOKUP_FAILED and logs the case id when the call fails", async () => {
    const stub = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
    const result = await createSupabaseTextItemRepository(stub.factory).hasMaterial(CASE_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MATERIAL_LOOKUP_FAILED");
    expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "error", caseId: CASE_ID });
  });
});
