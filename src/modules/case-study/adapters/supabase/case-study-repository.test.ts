import { describe, expect, it, vi } from "vitest";
import { createSupabaseCaseStudyRepository, REVIEW_SINCE_CHUNK } from "./case-study-repository";

const row = (over: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  code: "LUM-2026-01",
  number: 1,
  name: "Rebrand",
  client: { id: "cccccccc-0000-4000-8000-000000000001", name: "Lumen Srl", code: "LUM" },
  year: 2026,
  locale: "it",
  business_lines: ["branding"],
  status: "approved",
  project_order_ref: null,
  head_revision_id: null,
  approved_revision_id: null,
  head_version: 0,
  created_by: "00000000-0000-4000-8000-000000000002",
  created_at: "2026-10-01T10:00:00+00:00",
  updated_at: "2026-10-13T07:05:00+00:00",
  deleted_at: null,
  ...over,
});

/**
 * Stub of `from().select().is?().eq?().order?().maybeSingle?()` and `rpc()`: every
 * step returns the builder, which awaits (and `maybeSingle` resolves) to `response`;
 * `rpc` resolves to `rpcResponse`.
 */
function stubClient(
  response: { data: unknown; error: unknown },
  rpcResponse: { data: unknown; error: unknown } = { data: null, error: null },
) {
  const builder: Record<string, unknown> = {};
  const step = () => vi.fn(() => builder);
  const select = step();
  const is = step();
  const eq = step();
  const order = step();
  const maybeSingle = vi.fn(async () => response);
  Object.assign(builder, {
    select,
    is,
    eq,
    order,
    maybeSingle,
    then: (resolve: (r: typeof response) => unknown) => resolve(response),
  });
  const from = vi.fn(() => builder);
  const rpc = vi.fn(async () => rpcResponse);
  const factory = (() => ({ from, rpc })) as unknown as Parameters<typeof createSupabaseCaseStudyRepository>[0];
  return { factory, from, select, is, eq, order, rpc };
}

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const ACTOR_ID = "00000000-0000-4000-8000-000000000002";

describe("createSupabaseCaseStudyRepository().create", () => {
  const input = { name: "Rebrand", clientId: CLIENT_ID, year: 2026, locale: "it" as const, businessLines: ["branding" as const] };

  it("calls create_case_study with the client id, then re-reads the case with its client", async () => {
    const { factory, rpc, select, eq, is } = stubClient({ data: row({ status: "draft" }), error: null }, { data: { id: row().id }, error: null });
    const result = await createSupabaseCaseStudyRepository(factory).create(input, ACTOR_ID);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_case_study", {
      p_name: "Rebrand",
      p_client_id: CLIENT_ID,
      p_year: 2026,
      p_locale: "it",
      p_business_lines: ["branding"],
      p_actor_id: ACTOR_ID,
    });
    expect(String(select.mock.calls[0])).toContain("business_line");
    expect(String(select.mock.calls[0])).toContain("client(id, name, code)");
    expect(eq).toHaveBeenCalledWith("id", row().id);
    expect(is).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        code: "LUM-2026-01",
        number: 1,
        businessLines: ["branding"],
        client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
      }),
    });
  });

  it.each([
    ["the business line check", { code: "23514", message: 'new row for relation "case_study" violates check constraint "case_study_business_lines_check"' }],
  ])("maps %s to INVALID_INPUT naming businessLine", async (_label, error) => {
    const { factory, from } = stubClient({ data: null, error: null }, { data: null, error });
    const result = await createSupabaseCaseStudyRepository(factory).create(input, ACTOR_ID);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "INVALID_INPUT", details: { fields: ["businessLines"] } }) });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps the P0001 CLIENT_NOT_FOUND refusal", async () => {
    const { factory, from } = stubClient({ data: null, error: null }, { data: null, error: { code: "P0001", message: "CLIENT_NOT_FOUND" } });
    const result = await createSupabaseCaseStudyRepository(factory).create(input, ACTOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "CLIENT_NOT_FOUND", details: { clientId: CLIENT_ID } });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns CASE_STUDY_WRITE_FAILED for any other error, logging only the code", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "23505", message: "dup" } });
      const result = await createSupabaseCaseStudyRepository(factory).create(input, ACTOR_ID);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CASE_STUDY_WRITE_FAILED");
      expect(String(write.mock.calls[0][0])).toContain("23505");
    } finally {
      write.mockRestore();
    }
  });
});

describe("createSupabaseCaseStudyRepository().updateDetails", () => {
  const input = { caseId: row().id, name: "Rebrand 2", clientId: CLIENT_ID, year: 2025, locale: "en" as const, businessLines: ["video" as const] };

  it("calls update_case_study_details, then re-reads the case with its client", async () => {
    const { factory, rpc, eq } = stubClient({ data: row({ status: "draft", business_lines: ["video"] }), error: null }, { data: { id: row().id }, error: null });
    const result = await createSupabaseCaseStudyRepository(factory).updateDetails(input, ACTOR_ID);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_case_study_details", {
      p_case_id: row().id,
      p_name: "Rebrand 2",
      p_client_id: CLIENT_ID,
      p_year: 2025,
      p_locale: "en",
      p_business_lines: ["video"],
      p_actor_id: ACTOR_ID,
    });
    expect(eq).toHaveBeenCalledWith("id", row().id);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ businessLines: ["video"], client: expect.objectContaining({ code: "LUM" }) }) });
  });

  it.each([
    ["NOT_FOUND", { code: "P0001", message: "NOT_FOUND" }, { code: "NOT_FOUND", details: { id: row().id } }],
    ["STALE_STATUS", { code: "P0001", message: "STALE_STATUS" }, { code: "STALE_STATUS", details: { id: row().id } }],
    ["INVALID_INPUT", { code: "P0001", message: "INVALID_INPUT" }, { code: "INVALID_INPUT", details: { fields: ["businessLines"] } }],
    ["the business line check", { code: "23514", message: "violates check constraint \"case_study_business_lines_check\"" }, { code: "INVALID_INPUT", details: { fields: ["businessLines"] } }],
  ])("maps %s", async (_label, error, expected) => {
    const { factory, from } = stubClient({ data: null, error: null }, { data: null, error });
    const result = await createSupabaseCaseStudyRepository(factory).updateDetails(input, ACTOR_ID);
    expect(result).toEqual({ ok: false, error: expect.objectContaining(expected) });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns CASE_STUDY_WRITE_FAILED for any other error, logging only the code", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient({ data: null, error: null }, { data: null, error: { code: "XX000", message: "boom" } });
      const result = await createSupabaseCaseStudyRepository(factory).updateDetails(input, ACTOR_ID);
      expect(result.ok ? null : result.error.code).toBe("CASE_STUDY_WRITE_FAILED");
      expect(String(write.mock.calls[0][0])).toContain("XX000");
      expect(String(write.mock.calls[0][0])).not.toContain("boom");
    } finally {
      write.mockRestore();
    }
  });
});

describe("another check violation", () => {
  it.each(["create", "updateDetails"] as const)("%s: maps it to CASE_STUDY_WRITE_FAILED, not a bad business line, and logs the code", async (write) => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const error = { code: "23514", message: 'new row for relation "case_study" violates check constraint "case_study_year_check"' };
      const { factory } = stubClient({ data: null, error: null }, { data: null, error });
      const repo = createSupabaseCaseStudyRepository(factory);
      const result =
        write === "create"
          ? await repo.create({ name: "R", clientId: CLIENT_ID, year: 2026, locale: "it", businessLines: ["video" as const] }, ACTOR_ID)
          : await repo.updateDetails({ caseId: row().id, name: "R", clientId: CLIENT_ID, year: 2026, locale: "it", businessLines: ["video" as const] }, ACTOR_ID);
      expect(result.ok ? null : result.error.code).toBe("CASE_STUDY_WRITE_FAILED");
      expect(String(stdout.mock.calls[0][0])).toContain("23514");
    } finally {
      stdout.mockRestore();
    }
  });
});

describe("toCaseStudy", () => {
  it("maps a legacy case without a business line to null, and rejects one outside the list", async () => {
    const legacy = stubClient({ data: [row({ business_lines: [] })], error: null });
    const listed = await createSupabaseCaseStudyRepository(legacy.factory).list({});
    expect(listed.ok && listed.value[0].businessLines).toEqual([]);
    const bad = stubClient({ data: [row({ business_lines: ["moda"] })], error: null });
    const refused = await createSupabaseCaseStudyRepository(bad.factory).list({});
    expect(refused.ok ? null : refused.error.code).toBe("CASE_STUDY_INVALID");
  });
});

describe("createSupabaseCaseStudyRepository().transition", () => {
  it("re-reads the moved case so it carries its client", async () => {
    const { factory, eq } = stubClient({ data: row({ status: "generating" }), error: null }, { data: { id: row().id }, error: null });
    const result = await createSupabaseCaseStudyRepository(factory).transition({
      caseId: row().id,
      event: "generate",
      from: "draft",
      to: "generating",
      actorId: ACTOR_ID,
    });
    expect(eq).toHaveBeenCalledWith("id", row().id);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ status: "generating", client: expect.objectContaining({ code: "LUM" }) }) });
  });
});

describe("createSupabaseCaseStudyRepository().list", () => {
  it("returns CASE_STUDY_LOOKUP_FAILED and logs when the query errors", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient({ data: null, error: { code: "PGRST000", message: "down" } });
      const result = await createSupabaseCaseStudyRepository(factory).list({});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CASE_STUDY_LOOKUP_FAILED");
      const entry = JSON.parse(String(write.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "error" });
      expect(entry.msg).toContain("PGRST000");
    } finally {
      write.mockRestore();
    }
  });

  it("returns the mapping err when a row has no client", async () => {
    const { factory } = stubClient({ data: [row({ client: null })], error: null });
    const result = await createSupabaseCaseStudyRepository(factory).list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CASE_STUDY_INVALID");
  });

  it("returns the mapping err when a row is invalid", async () => {
    const { factory } = stubClient({ data: [row(), row({ id: "bbbbbbbb-0000-4000-8000-000000000002", status: "archived" })], error: null });
    const result = await createSupabaseCaseStudyRepository(factory).list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CASE_STUDY_INVALID");
  });

  it("lists every status without a status filter, non-deleted, newest first with an id tie-break", async () => {
    const { factory, from, is, eq, order } = stubClient({ data: [row()], error: null });
    const result = await createSupabaseCaseStudyRepository(factory).list({});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.map((c) => c.id)).toEqual([row().id]);
    expect(from).toHaveBeenCalledWith("case_study");
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(eq).not.toHaveBeenCalled();
    expect(order.mock.calls).toEqual([
      ["updated_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("filters by status when the scope sets one", async () => {
    const { factory, eq } = stubClient({ data: [], error: null });
    expect(await createSupabaseCaseStudyRepository(factory).list({ status: "approved" })).toEqual({ ok: true, value: [] });
    expect(eq).toHaveBeenCalledExactlyOnceWith("status", "approved");
  });

  it("filters by client when the scope sets one", async () => {
    const { factory, eq } = stubClient({ data: [], error: null });
    expect(await createSupabaseCaseStudyRepository(factory).list({ clientId: CLIENT_ID })).toEqual({ ok: true, value: [] });
    expect(eq).toHaveBeenCalledExactlyOnceWith("client_id", CLIENT_ID);
  });
});

describe("re-read after a successful write", () => {
  const ID = row().id;
  const writes = {
    create: (repo: ReturnType<typeof createSupabaseCaseStudyRepository>) =>
      repo.create({ name: "Rebrand", clientId: CLIENT_ID, year: 2026, locale: "it", businessLines: ["branding" as const] }, ACTOR_ID),
    transition: (repo: ReturnType<typeof createSupabaseCaseStudyRepository>) =>
      repo.transition({ caseId: ID, event: "generate", from: "draft", to: "generating", actorId: ACTOR_ID }),
  };
  const cases = (["create", "transition"] as const).flatMap((write) =>
    [
      ["an error", { data: null, error: { code: "PGRST000", message: "down" } }, "PGRST000"],
      ["no row", { data: null, error: null }, "no row"],
    ].map(([label, response, logged]) => [write, label, response, logged] as const),
  );

  it.each(cases)("%s: a re-read with %s → CASE_STUDY_LOOKUP_FAILED with details.id, logged", async (write, _label, response, logged) => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { factory } = stubClient(response as { data: unknown; error: unknown }, { data: { id: ID }, error: null });
      const result = await writes[write](createSupabaseCaseStudyRepository(factory));
      expect(result).toEqual({
        ok: false,
        error: { code: "CASE_STUDY_LOOKUP_FAILED", message: expect.any(String), details: { id: ID } },
      });
      const entry = JSON.parse(String(stdout.mock.calls[0][0]));
      expect(entry).toMatchObject({ level: "error" });
      expect(entry.msg).toContain(`${write} re-read failed`);
      expect(entry.msg).toContain(logged as string);
    } finally {
      stdout.mockRestore();
    }
  });
});

describe("createSupabaseCaseStudyRepository().reviewSince", () => {
  const A = "aaaaaaaa-0000-4000-8000-00000000000a";
  const B = "aaaaaaaa-0000-4000-8000-00000000000b";

  /** Stub of `from().select().eq().eq().in().order().order()`, resolving each query to the next response. */
  function eventsClient(...responses: Array<{ data: unknown; error: unknown }>) {
    const builder: Record<string, unknown> = {};
    const step = () => vi.fn(() => builder);
    const calls = { select: step(), eq: step(), in: step(), order: step() };
    let n = 0;
    Object.assign(builder, calls, { then: (resolve: (r: unknown) => unknown) => resolve(responses[n++]) });
    const from = vi.fn(() => builder);
    const factory = (() => ({ from })) as unknown as Parameters<typeof createSupabaseCaseStudyRepository>[0];
    return { factory, from, ...calls };
  }

  it("reads the newest transition to in_review per case, newest first", async () => {
    const stub = eventsClient({
      data: [
        { case_id: A, at: "2026-10-22T09:00:00+00:00" },
        { case_id: B, at: "2026-10-20T09:00:00+00:00" },
        { case_id: A, at: "2026-10-19T09:00:00+00:00" },
      ],
      error: null,
    });
    const result = await createSupabaseCaseStudyRepository(stub.factory).reviewSince([A, B]);
    expect(stub.from).toHaveBeenCalledWith("case_event");
    expect(stub.eq).toHaveBeenCalledWith("type", "transition");
    expect(stub.eq).toHaveBeenCalledWith("data->>to", "in_review");
    expect(stub.in).toHaveBeenCalledWith("case_id", [A, B]);
    expect(stub.order).toHaveBeenNthCalledWith(1, "at", { ascending: false });
    expect(result).toEqual({
      ok: true,
      value: new Map([
        [A, "2026-10-22T09:00:00+00:00"],
        [B, "2026-10-20T09:00:00+00:00"],
      ]),
    });
  });

  it("queries nothing for no case, and splits many cases into chunks", async () => {
    const none = eventsClient();
    expect(await createSupabaseCaseStudyRepository(none.factory).reviewSince([])).toEqual({ ok: true, value: new Map() });
    expect(none.from).not.toHaveBeenCalled();

    const ids = Array.from({ length: REVIEW_SINCE_CHUNK + 1 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const many = eventsClient({ data: [], error: null }, { data: [{ case_id: ids.at(-1), at: "2026-10-20T09:00:00+00:00" }], error: null });
    const result = await createSupabaseCaseStudyRepository(many.factory).reviewSince(ids);
    expect(many.in).toHaveBeenCalledTimes(2);
    expect(many.in).toHaveBeenLastCalledWith("case_id", ids.slice(REVIEW_SINCE_CHUNK));
    expect(result).toEqual({ ok: true, value: new Map([[ids.at(-1), "2026-10-20T09:00:00+00:00"]]) });
  });

  it("returns CASE_EVENT_LOOKUP_FAILED and logs the code when the read fails", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const stub = eventsClient({ data: null, error: { code: "57014", message: "timeout" } });
      const result = await createSupabaseCaseStudyRepository(stub.factory).reviewSince([A]);
      expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "CASE_EVENT_LOOKUP_FAILED" }) });
      expect(String(write.mock.calls[0][0])).toContain("57014");
    } finally {
      write.mockRestore();
    }
  });
});
