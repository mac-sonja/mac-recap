// DB-level checks of the `case_study` / `case_event` migration and the real
// case-study adapter against the local Supabase stack. Run with `npm run test:db`.
// Case rows can never be deleted, so tests create their own rows and assert on
// those (or on before/after counts), never on table totals.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";
import { LOCALES, YEAR_MAX, YEAR_MIN } from "@/modules/case-study/domain/case-study";
import { CASE_STATUSES } from "@/shared/case-status";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<
  (typeof REQUIRED)[number],
  string
>;

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 2 });
  // Undo a role change left behind by an interrupted "Forbidden" run.
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
});

afterAll(async () => {
  await pool.end();
});

/** Runs `sql` (as `role` when given) inside a transaction that is always rolled back. */
async function inRolledBackTx(sql: string, params: unknown[] = [], role?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (role) await client.query(`set local role ${role}`);
    return await client.query(sql, params);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // Keep the original error; the client is still released below.
    }
    client.release();
  }
}

async function counts() {
  const { rows } = await pool.query<{ cases: number; events: number }>(
    "select (select count(*)::int from public.case_study) as cases, (select count(*)::int from public.case_event) as events",
  );
  return rows[0];
}

// Imported lazily so getEnv() (cached on first use) sees the exported env.
const loadCaseStudy = () => import("@/modules/case-study");
const loadAccess = () => import("@/modules/access");
const loadActions = () => import("@/app/(tool)/case-studies/actions");

async function devActor() {
  const { getActor } = await loadAccess();
  const actor = await getActor();
  if (!actor.ok) throw new Error(`dev actor did not resolve: ${actor.error.code}`);
  return actor.value;
}

async function createCase(input: Record<string, unknown> = {}) {
  const { create } = await loadCaseStudy();
  const result = await create(await devActor(), { name: "Rebrand", client: "Acme", year: 2026, ...input });
  if (!result.ok) throw new Error(`setup create failed: ${result.error.code}`);
  return result.value;
}

describe("create", () => {
  it("writes a draft case (locale it, created_by the actor) and exactly one case_created event", async () => {
    const actor = await devActor();
    const { create } = await loadCaseStudy();
    const result = await create(actor, { name: "  Rebrand ", client: "Acme", year: 2026 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.value;
    expect(created).toMatchObject({
      name: "Rebrand",
      client: "Acme",
      year: 2026,
      locale: "it",
      status: "draft",
      projectOrderRef: null,
      headRevisionId: null,
      approvedRevisionId: null,
      headVersion: 0,
      createdBy: actor.id,
      deletedAt: null,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const { rows: caseRows } = await pool.query("select status, locale, created_by from public.case_study where id = $1", [
      created.id,
    ]);
    expect(caseRows).toEqual([{ status: "draft", locale: "it", created_by: actor.id }]);

    const { rows: events } = await pool.query("select type, actor_id, revision_id, data from public.case_event where case_id = $1", [
      created.id,
    ]);
    expect(events).toEqual([
      {
        type: "case_created",
        actor_id: actor.id,
        revision_id: null,
        data: { name: "Rebrand", client: "Acme", year: 2026, locale: "it" },
      },
    ]);
  });

  it("keeps an explicit en locale", async () => {
    expect((await createCase({ locale: "en" })).locale).toBe("en");
  });

  it("through the server action returns the created case", async () => {
    const { createCaseStudy } = await loadActions();
    const result = await createCaseStudy({ name: "Action case", client: "Acme", year: 2025 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ name: "Action case", status: "draft", createdBy: DEV_ACTOR_ID });
  });
});

describe("invalid input writes nothing", () => {
  it.each([
    ["empty name", { name: "", client: "Acme", year: 2026 }, ["name"]],
    ["whitespace client", { name: "Rebrand", client: "   ", year: 2026 }, ["client"]],
    ["both missing", { year: 2026 }, ["name", "client"]],
    ["non-integer year", { name: "R", client: "A", year: 2026.5 }, ["year"]],
    ["year below 1900", { name: "R", client: "A", year: 1899 }, ["year"]],
    ["year above 2100", { name: "R", client: "A", year: 2101 }, ["year"]],
    ["unknown locale", { name: "R", client: "A", year: 2026, locale: "de" }, ["locale"]],
  ])("%s → INVALID_INPUT naming %j", async (_label, input, fields) => {
    const { create } = await loadCaseStudy();
    const before = await counts();
    const result = await create(await devActor(), input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
    }
    expect(await counts()).toEqual(before);
  });

  it.each([
    ["blank name", "insert into public.case_study (name, client, year, created_by) values (' ', 'A', 2026, $1)"],
    ["year out of range", "insert into public.case_study (name, client, year, created_by) values ('R', 'A', 1850, $1)"],
    ["unknown locale", "insert into public.case_study (name, client, year, locale, created_by) values ('R', 'A', 2026, 'de', $1)"],
  ])("the table checks reject a %s as a backstop", async (_label, sql) => {
    await expect(inRolledBackTx(sql, [DEV_ACTOR_ID])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("forbidden", () => {
  it("returns 403 FORBIDDEN for a role that cannot create cases, and writes nothing", async () => {
    const { createCaseStudy } = await loadActions();
    // getActor() reads through PostgREST on its own connection: change, then always restore.
    await pool.query("update public.profile set role = 'account_sales_social' where id = $1", [DEV_ACTOR_ID]);
    try {
      const before = await counts();
      const result = await createCaseStudy({ name: "Rebrand", client: "Acme", year: 2026 });
      expect(result).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
      expect(await counts()).toEqual(before);
    } finally {
      await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
    }
  });
});

describe("get", () => {
  it("returns an existing case", async () => {
    const created = await createCase();
    const { get } = await loadCaseStudy();
    expect(await get(created.id)).toEqual({ ok: true, value: created });
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const { get } = await loadCaseStudy();
    const result = await get(UNKNOWN_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND for a soft-deleted case", async () => {
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    const { get } = await loadCaseStudy();
    const result = await get(created.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("recordEvent", () => {
  it("appends one case_event row with the actor, type and data", async () => {
    const created = await createCase();
    const actor = await devActor();
    const { recordEvent } = await loadCaseStudy();
    const result = await recordEvent(actor, { caseId: created.id, type: "text_added", data: { textItemId: "t1" } });
    expect(result.ok).toBe(true);
    const { rows } = await pool.query(
      "select type, actor_id, revision_id, data from public.case_event where case_id = $1 order by at, type",
      [created.id],
    );
    expect(rows).toEqual([
      {
        type: "case_created",
        actor_id: actor.id,
        revision_id: null,
        data: { name: "Rebrand", client: "Acme", year: 2026, locale: "it" },
      },
      { type: "text_added", actor_id: actor.id, revision_id: null, data: { textItemId: "t1" } },
    ]);
  });

  it("stores a non-null revisionId", async () => {
    const created = await createCase();
    const revisionId = "22222222-2222-4222-8222-222222222222";
    const { recordEvent } = await loadCaseStudy();
    const result = await recordEvent(await devActor(), { caseId: created.id, type: "text_added", revisionId });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.revisionId).toBe(revisionId);
    const { rows } = await pool.query(
      "select revision_id from public.case_event where case_id = $1 and type = 'text_added'",
      [created.id],
    );
    expect(rows).toEqual([{ revision_id: revisionId }]);
  });

  it("returns NOT_FOUND for an unknown case and writes nothing", async () => {
    const { recordEvent } = await loadCaseStudy();
    const before = await counts();
    const result = await recordEvent(await devActor(), { caseId: UNKNOWN_ID, type: "text_added" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(await counts()).toEqual(before);
  });
});

describe("direct writes are rejected", () => {
  let caseId: string;

  beforeAll(async () => {
    caseId = (await createCase()).id;
  });

  it("changing case_study.id", async () => {
    await expect(
      inRolledBackTx("update public.case_study set id = gen_random_uuid() where id = $1", [caseId]),
    ).rejects.toThrow(/immutable/);
  });

  it("deleting a case_study row", async () => {
    await expect(inRolledBackTx("delete from public.case_study where id = $1", [caseId])).rejects.toThrow(
      /never deleted/,
    );
  });

  it("truncating case_study", async () => {
    await expect(inRolledBackTx("truncate public.case_study cascade")).rejects.toThrow(/never deleted/);
  });

  it("updating a case_event row", async () => {
    await expect(
      inRolledBackTx("update public.case_event set type = 'tampered' where case_id = $1", [caseId]),
    ).rejects.toThrow(/append-only/);
  });

  it("deleting a case_event row", async () => {
    await expect(inRolledBackTx("delete from public.case_event where case_id = $1", [caseId])).rejects.toThrow(
      /append-only/,
    );
  });

  it("truncating case_event", async () => {
    await expect(inRolledBackTx("truncate public.case_event")).rejects.toThrow(/append-only/);
  });

  it("still allows a soft delete and bumps updated_at", async () => {
    const { rows } = await inRolledBackTx(
      "update public.case_study set deleted_at = now() where id = $1 returning updated_at > created_at as touched",
      [caseId],
    );
    expect(rows).toEqual([{ touched: true }]);
  });
});

describe("schema guards", () => {
  it.each(["case_study", "case_event"])("enables RLS with no policies on %s", async (table) => {
    const { rows } = await pool.query<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls,
              (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
       from pg_catalog.pg_class c where c.oid = $1::regclass`,
      [`public.${table}`],
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
  });

  const checkDefs = async (column: string) => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
       where conrelid = 'public.case_study'::regclass and contype = 'c'`,
    );
    return rows.map(({ def }) => def).filter((def) => new RegExp(`\\b${column}\\b`).test(def));
  };

  it("checks locale against exactly LOCALES", async () => {
    const defs = await checkDefs("locale");
    expect(defs).toHaveLength(1);
    expect([...defs[0].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...LOCALES]);
  });

  it("checks year between exactly YEAR_MIN and YEAR_MAX", async () => {
    const defs = await checkDefs("year");
    expect(defs).toHaveLength(1);
    expect([...defs[0].matchAll(/\d+/g)].map((m) => Number(m[0]))).toEqual([YEAR_MIN, YEAR_MAX]);
  });

  it("checks status against exactly CASE_STATUSES, defaulting to draft", async () => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
       where conrelid = 'public.case_study'::regclass and contype = 'c'`,
    );
    const statusChecks = rows.map(({ def }) => def).filter((def) => /\bstatus\b/.test(def));
    expect(statusChecks).toHaveLength(1);
    expect([...statusChecks[0].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...CASE_STATUSES]);
  });
});

describe("RLS lockout", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  it.each(["case_study", "case_event"])("the browser key is refused reading %s", async (table) => {
    const { data, error } = await browser().from(table).select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("the browser key is refused calling create_case_study", async () => {
    const { data, error } = await browser().rpc("create_case_study", {
      p_name: "Intruder",
      p_client: "X",
      p_year: 2026,
      p_locale: "it",
      p_actor_id: DEV_ACTOR_ID,
    });
    expect(data).toBeNull();
    // Permission denied, or PostgREST hiding a function the role may not execute.
    expect(["42501", "PGRST202"]).toContain(error?.code);
  });

  const statements = (table: "case_study" | "case_event") => ({
    select: `select * from public.${table}`,
    insert:
      table === "case_study"
        ? `insert into public.case_study (name, client, year, created_by) values ('I', 'X', 2026, '${DEV_ACTOR_ID}')`
        : `insert into public.case_event (case_id, actor_id, type) values ('${UNKNOWN_ID}', '${DEV_ACTOR_ID}', 'x')`,
    update: `update public.${table} set ${table === "case_study" ? "name = 'x'" : "type = 'x'"}`,
    delete: `delete from public.${table}`,
  });
  const cases = (["anon", "authenticated"] as const).flatMap((role) =>
    (["case_study", "case_event"] as const).flatMap((table) =>
      Object.entries(statements(table)).map(([verb, sql]) => [role, verb, table, sql] as const),
    ),
  );

  it.each(cases)("%s gets permission denied on %s %s", async (role, _verb, _table, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });

  it.each(["anon", "authenticated"])("%s may not execute create_case_study", async (role) => {
    await expect(
      inRolledBackTx(`select public.create_case_study('I', 'X', 2026, 'it', '${DEV_ACTOR_ID}')`, [], role),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
