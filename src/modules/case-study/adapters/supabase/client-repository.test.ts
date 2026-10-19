import { describe, expect, it, vi } from "vitest";
import { createSupabaseClientRepository } from "./client-repository";

const client = (over: Record<string, unknown> = {}) => ({
  id: "cccccccc-0000-4000-8000-000000000001",
  name: "Lumen Srl",
  code: "LUM",
  ...over,
});
const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";
/** The `client` row with its info columns, as `findById` / the RPCs read it. */
const infoRow = (over: Record<string, unknown> = {}) => ({ ...client(), industries: ["lusso"], description: "Brand.", logo_id: LOGO_ID, ...over });
/** The domain client for `infoRow()`. */
const detail = (over: Record<string, unknown> = {}) => ({ ...client(), industries: ["lusso"], description: "Brand.", logoId: LOGO_ID, ...over });
const BRIEF = { context: "C", solution: "S", results: "R" };
const INFO = { industries: ["lusso" as const], description: "Brand." };

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
  const single = vi.fn(async () => response);
  const insert = vi.fn(() => builder);
  Object.assign(builder, { select, order, is, eq, maybeSingle, single, insert, then: (resolve: (r: typeof response) => unknown) => resolve(response) });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => rpcResponse);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseClientRepository>[0];
  return { factory, from, select, order, is, eq, rpc, insert };
}

const ACTOR_ID = "00000000-0000-4000-8000-000000000002";
const dbRow = (over: Record<string, unknown> = {}) => ({
  ...infoRow(),
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
  it("counts only non-deleted cases and says whether every required field is filled, by name with an id tie-break", async () => {
    const rows = [
      { ...infoRow(), client_brief: BRIEF, case_study: [{ count: 3 }] },
      { ...infoRow({ id: "cccccccc-0000-4000-8000-000000000002", industries: [], description: null, logo_id: null }), client_brief: null, case_study: [{ count: 0 }] },
    ];
    const { factory, from, select, is, order } = stubClient({ data: rows, error: null });
    expect(await createSupabaseClientRepository(factory).listWithCaseCounts()).toEqual({
      ok: true,
      value: [
        { ...client(), caseCount: 3, complete: true },
        { ...client({ id: "cccccccc-0000-4000-8000-000000000002" }), caseCount: 0, complete: false },
      ],
    });
    expect(from).toHaveBeenCalledWith("client");
    expect(select).toHaveBeenCalledWith(
      "id, name, code, industries, description, logo_id, client_brief(context, solution, results), case_study(count)",
    );
    expect(is).toHaveBeenCalledExactlyOnceWith("case_study.deleted_at", null);
    expect(order.mock.calls).toEqual([
      ["name", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("counts a client with a blank brief text as unfinished", async () => {
    const rows = [{ ...infoRow(), client_brief: { ...BRIEF, results: "  " }, case_study: [{ count: 1 }] }];
    const { factory } = stubClient({ data: rows, error: null });
    const result = await createSupabaseClientRepository(factory).listWithCaseCounts();
    expect(result.ok && result.value[0].complete).toBe(false);
  });

  it("returns CLIENT_INVALID when a count is missing", async () => {
    const { factory } = stubClient({ data: [{ ...infoRow(), client_brief: null, case_study: [] }], error: null });
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
  it("returns the client with its info, or null when unknown", async () => {
    const found = stubClient({ data: infoRow(), error: null });
    expect(await createSupabaseClientRepository(found.factory).findById(client().id)).toEqual({ ok: true, value: detail() });
    expect(found.select).toHaveBeenCalledWith("id, name, code, industries, description, logo_id");
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
  it("calls create_client with the name, the info and the actor and returns the client", async () => {
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: dbRow({ logo_id: null }), error: null });
    expect(await createSupabaseClientRepository(factory).create("Lumen Srl", INFO, ACTOR_ID)).toEqual({
      ok: true,
      value: detail({ logoId: null }),
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_client", {
      p_name: "Lumen Srl",
      p_industries: ["lusso"],
      p_description: "Brand.",
      p_actor_id: ACTOR_ID,
    });
  });

  it.each(["CLIENT_NAME_TAKEN", "CLIENT_CODE_EXHAUSTED"])("maps P0001 %s to its code", async (code) => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: code } });
    const result = await createSupabaseClientRepository(factory).create("Lumen Srl", INFO, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it("maps the client_description_check violation to CLIENT_FIELD_TOO_LONG", async () => {
    const error = { code: "23514", message: 'new row for relation "client" violates check constraint "client_description_check"' };
    const { factory } = stubClient({ data: null, error: null }, { data: null, error });
    const result = await createSupabaseClientRepository(factory).create("Lumen Srl", INFO, ACTOR_ID);
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["description"] } });
  });

  it("maps the client_industries_check violation and P0001 CLIENT_FIELD_INVALID to CLIENT_FIELD_INVALID naming the field", async () => {
    const check = { code: "23514", message: 'new row for relation "client" violates check constraint "client_industries_check"' };
    const raised = { code: "P0001", message: "CLIENT_FIELD_INVALID", details: "description" };
    for (const [error, field] of [
      [check, "industries"],
      [raised, "description"],
    ] as const) {
      const { factory } = stubClient({ data: null, error: null }, { data: null, error });
      const result = await createSupabaseClientRepository(factory).create("Lumen Srl", INFO, ACTOR_ID);
      expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: [field] } });
    }
  });

  it("names the field when update_client's length check refuses the write", async () => {
    const error = { code: "23514", message: 'new row for relation "client" violates check constraint "client_description_check"' };
    const { factory } = stubClient({ data: null, error: null }, { data: null, error });
    const result = await createSupabaseClientRepository(factory).update({ id: client().id, name: "Lumen", ...INFO, logoId: LOGO_ID }, ACTOR_ID);
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["description"] } });
  });

  it("returns CLIENT_WRITE_FAILED for any other error, including an unknown P0001 message", async () => {
    for (const error of [{ code: "P0001", message: "something else" }, { code: "23505", message: "dup" }]) {
      const { factory } = stubClient({ data: null, error: null }, { data: null, error });
      const { result } = await quietly(() => createSupabaseClientRepository(factory).create("Lumen Srl", INFO, ACTOR_ID));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CLIENT_WRITE_FAILED");
    }
  });
});

describe("createSupabaseClientRepository().update", () => {
  const update = { id: client().id, name: "Lumen S.r.l.", industries: ["energia" as const, "lusso" as const], description: "Brand.", logoId: LOGO_ID };

  it("calls update_client with every field and the actor", async () => {
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: dbRow({ name: "Lumen S.r.l.", industries: ["energia", "lusso"] }), error: null });
    expect(await createSupabaseClientRepository(factory).update(update, ACTOR_ID)).toEqual({
      ok: true,
      value: detail({ name: "Lumen S.r.l.", industries: ["energia", "lusso"] }),
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_client", {
      p_client_id: client().id,
      p_name: "Lumen S.r.l.",
      p_industries: ["energia", "lusso"],
      p_description: "Brand.",
      p_logo_id: LOGO_ID,
      p_actor_id: ACTOR_ID,
    });
  });

  it.each(["CLIENT_NOT_FOUND", "CLIENT_NAME_TAKEN", "CLIENT_LOGO_INVALID"])("maps P0001 %s to its code", async (code) => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: code } });
    const result = await createSupabaseClientRepository(factory).update(update, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code, details: { clientId: client().id } });
  });

  it("maps P0001 CLIENT_FIELD_INVALID for a missing logo to the logoId field", async () => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "CLIENT_FIELD_INVALID", details: "logoId" } });
    const result = await createSupabaseClientRepository(factory).update(update, ACTOR_ID);
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_INVALID", details: { fields: ["logoId"] } });
  });

  it("does not map CLIENT_CODE_EXHAUSTED on update (update_client never raises it)", async () => {
    const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "CLIENT_CODE_EXHAUSTED" } });
    const { result } = await quietly(() => createSupabaseClientRepository(factory).update(update, ACTOR_ID));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_WRITE_FAILED");
  });
});

describe("createSupabaseClientRepository() brief", () => {
  it("reads the brief, or the empty one when the client has no row", async () => {
    const found = stubClient({ data: BRIEF, error: null });
    expect(await createSupabaseClientRepository(found.factory).findBrief(client().id)).toEqual({ ok: true, value: BRIEF });
    expect(found.from).toHaveBeenCalledWith("client_brief");
    expect(found.select).toHaveBeenCalledWith("context, solution, results");
    expect(found.eq).toHaveBeenCalledWith("client_id", client().id);
    const missing = stubClient({ data: null, error: null });
    expect(await createSupabaseClientRepository(missing.factory).findBrief(client().id)).toEqual({
      ok: true,
      value: { context: "", solution: "", results: "" },
    });
  });

  it("saves one field through save_client_brief_field and returns the previous text", async () => {
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: "prima", error: null });
    expect(await createSupabaseClientRepository(factory).saveBriefField(client().id, "context", "dopo", ACTOR_ID)).toEqual({ ok: true, value: "prima" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_client_brief_field", {
      p_client_id: client().id,
      p_field: "context",
      p_text: "dopo",
      p_actor_id: ACTOR_ID,
    });
  });

  it("maps P0001 CLIENT_NOT_FOUND and UNKNOWN_FIELD, and a length check to CLIENT_FIELD_TOO_LONG naming the field", async () => {
    for (const code of ["CLIENT_NOT_FOUND", "UNKNOWN_FIELD"]) {
      const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: code } });
      const result = await createSupabaseClientRepository(factory).saveBriefField(client().id, "context", "x", ACTOR_ID);
      expect(result.ok || result.error.code).toBe(code);
    }
    const error = { code: "23514", message: 'new row for relation "client_brief" violates check constraint "client_brief_results_check"' };
    const { factory } = stubClient({ data: null, error: null }, { data: null, error });
    const result = await createSupabaseClientRepository(factory).saveBriefField(client().id, "results", "x", ACTOR_ID);
    expect(result.ok || result.error).toMatchObject({ code: "CLIENT_FIELD_TOO_LONG", details: { fields: ["results"] } });
  });
});

describe("createSupabaseClientRepository() logos", () => {
  const logoRow = { id: LOGO_ID, client_id: client().id, mime_type: "image/png", size_bytes: 2048 };
  const logo = { id: LOGO_ID, clientId: client().id, contentType: "image/png", sizeBytes: 2048 };

  it("inserts a client_logo row with the path built by the adapter", async () => {
    const { factory, from, insert } = stubClient({ data: logoRow, error: null });
    const result = await createSupabaseClientRepository(factory).insertLogo({
      id: LOGO_ID,
      clientId: client().id,
      contentType: "image/png",
      sizeBytes: 2048,
      createdBy: ACTOR_ID,
    });
    expect(result).toEqual({ ok: true, value: logo });
    expect(from).toHaveBeenCalledWith("client_logo");
    expect(insert).toHaveBeenCalledExactlyOnceWith({
      id: LOGO_ID,
      client_id: client().id,
      path: `clients/${client().id}/logos/${LOGO_ID}.png`,
      mime_type: "image/png",
      size_bytes: 2048,
      created_by: ACTOR_ID,
    });
  });

  it("refuses a logo id confirmed twice as CLIENT_LOGO_INVALID", async () => {
    const { factory } = stubClient({ data: null, error: { code: "23505", message: "dup" } });
    const result = await createSupabaseClientRepository(factory).insertLogo({
      id: LOGO_ID,
      clientId: client().id,
      contentType: "image/png",
      sizeBytes: 2048,
      createdBy: ACTOR_ID,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CLIENT_LOGO_INVALID");
  });

  it("deletes a logo row through delete_client_logo", async () => {
    const { factory, rpc } = stubClient({ data: null, error: null }, { data: true, error: null });
    expect(await createSupabaseClientRepository(factory).deleteLogo(LOGO_ID)).toEqual({ ok: true, value: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_client_logo", { p_logo_id: LOGO_ID });
  });

  it("maps P0001 CLIENT_LOGO_IN_USE, and any other error to CLIENT_WRITE_FAILED", async () => {
    const inUse = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "CLIENT_LOGO_IN_USE" } });
    const refused = await createSupabaseClientRepository(inUse.factory).deleteLogo(LOGO_ID);
    expect(refused.ok || refused.error.code).toBe("CLIENT_LOGO_IN_USE");
    const down = stubClient({ data: null, error: null }, { data: null, error: { code: "PGRST000", message: "down" } });
    const { result } = await quietly(() => createSupabaseClientRepository(down.factory).deleteLogo(LOGO_ID));
    expect(result.ok || result.error.code).toBe("CLIENT_WRITE_FAILED");
  });

  it("finds a logo row, or null", async () => {
    const found = stubClient({ data: logoRow, error: null });
    expect(await createSupabaseClientRepository(found.factory).findLogo(LOGO_ID)).toEqual({ ok: true, value: logo });
    const missing = stubClient({ data: null, error: null });
    expect(await createSupabaseClientRepository(missing.factory).findLogo(LOGO_ID)).toEqual({ ok: true, value: null });
  });
});

describe("createSupabaseClientRepository().findClientInfoByCaseId", () => {
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

  it("reads the non-deleted case's client info", async () => {
    const row = {
      id: CASE_ID,
      client: { id: client().id, name: "Lumen Srl", industries: ["lusso"], description: "Brand.", logo_id: LOGO_ID, client_brief: BRIEF },
    };
    const { factory, from, select, eq, is } = stubClient({ data: row, error: null });
    expect(await createSupabaseClientRepository(factory).findClientInfoByCaseId(CASE_ID)).toEqual({
      ok: true,
      value: { clientId: client().id, name: "Lumen Srl", industries: ["lusso"], description: "Brand.", logoId: LOGO_ID, brief: BRIEF },
    });
    expect(from).toHaveBeenCalledWith("case_study");
    expect(select).toHaveBeenCalledWith("id, client(id, name, industries, description, logo_id, client_brief(context, solution, results))");
    expect(eq).toHaveBeenCalledWith("id", CASE_ID);
    expect(is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("gives a legacy client with no brief row the empty brief", async () => {
    const row = { id: CASE_ID, client: { id: client().id, name: "Lumen Srl", industries: [], description: null, logo_id: null, client_brief: null } };
    const { factory } = stubClient({ data: row, error: null });
    expect(await createSupabaseClientRepository(factory).findClientInfoByCaseId(CASE_ID)).toEqual({
      ok: true,
      value: { clientId: client().id, name: "Lumen Srl", industries: [], description: null, logoId: null, brief: { context: "", solution: "", results: "" } },
    });
  });

  it("returns CLIENT_INVALID for a malformed client row", async () => {
    const row = { id: CASE_ID, client: { id: "not-a-uuid", name: "Lumen Srl", industries: ["moda"], description: null, logo_id: "x", client_brief: null } };
    const { factory } = stubClient({ data: row, error: null });
    const { result } = await quietly(() => createSupabaseClientRepository(factory).findClientInfoByCaseId(CASE_ID));
    expect(result.ok || result.error.code).toBe("CLIENT_INVALID");
  });

  it("returns null for an unknown or deleted case", async () => {
    const { factory } = stubClient({ data: null, error: null });
    expect(await createSupabaseClientRepository(factory).findClientInfoByCaseId(CASE_ID)).toEqual({ ok: true, value: null });
  });
});
