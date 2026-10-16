// DB-level checks of the `case_study` / `case_event` migration and the real
// case-study adapter against the local Supabase stack. Run with `npm run test:db`.
// Case rows can never be deleted, so tests create their own rows and assert on
// those (or on before/after counts), never on table totals.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";
import { LOCALES, YEAR_MAX, YEAR_MIN } from "@/modules/case-study/domain/case-study";
import { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";
import { createTestClient, freshPrefix, nameWithLetters, type TestClient } from "../helpers/db-clients";

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
/** The client every case in this file belongs to, unless a test makes its own. */
let acme: TestClient;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 2 });
  // Undo a role change left behind by an interrupted "Forbidden" run.
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
  acme = await createTestClient(pool, DEV_ACTOR_ID);
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
  const { rows } = await pool.query<{ cases: number; events: number; clients: number; logos: number; counters: number; numbers: number }>(
    `select (select count(*)::int from public.case_study) as cases,
            (select count(*)::int from public.case_event) as events,
            (select count(*)::int from public.client) as clients,
            (select count(*)::int from public.client_logo) as logos,
            (select count(*)::int from public.case_number_counter) as counters,
            (select coalesce(sum(last_number), 0)::int from public.case_number_counter) as numbers`,
  );
  return rows[0];
}

// Imported lazily so getEnv() (cached on first use) sees the exported env.
const loadCaseStudy = () => import("@/modules/case-study");
const loadAccess = () => import("@/modules/access");
const loadActions = () => import("@/app/(tool)/case-studies/actions");
const loadClientActions = () => import("@/app/(tool)/clients/actions");
/** A service-role client, to inspect the storage bucket. */
const createSupabaseAdmin = () =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

async function devActor() {
  const { getActor } = await loadAccess();
  const actor = await getActor();
  if (!actor.ok) throw new Error(`dev actor did not resolve: ${actor.error.code}`);
  return actor.value;
}

async function createCase(input: Record<string, unknown> = {}) {
  const { create } = await loadCaseStudy();
  const result = await create(await devActor(), { name: "Rebrand", clientId: acme.id, year: 2026, ...input });
  if (!result.ok) throw new Error(`setup create failed: ${result.error.code}`);
  return result.value;
}

describe("create", () => {
  it("writes a draft case (locale it, created_by the actor) and exactly one case_created event", async () => {
    const actor = await devActor();
    const { create } = await loadCaseStudy();
    const result = await create(actor, { name: "  Rebrand ", clientId: acme.id, year: 2026 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const created = result.value;
    expect(created.code).toMatch(new RegExp(`^${acme.code}-2026-\\d{2,}$`));
    expect(created.code).toBe(`${acme.code}-2026-${String(created.number).padStart(2, "0")}`);
    expect(created).toMatchObject({
      name: "Rebrand",
      client: acme,
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
        data: {
          name: "Rebrand",
          client: acme.name,
          clientId: acme.id,
          clientCode: acme.code,
          code: created.code,
          year: 2026,
          locale: "it",
        },
      },
    ]);
  });

  it("keeps an explicit en locale", async () => {
    expect((await createCase({ locale: "en" })).locale).toBe("en");
  });

  it("through the server action returns the created case", async () => {
    const { createCaseStudy } = await loadActions();
    const result = await createCaseStudy({ name: "Action case", clientId: acme.id, year: 2025 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ name: "Action case", status: "draft", createdBy: DEV_ACTOR_ID, client: acme });
      expect(result.value.code).toMatch(new RegExp(`^${acme.code}-2025-\\d{2,}$`));
    }
  });

  it("through the server action returns 404 CLIENT_NOT_FOUND for an unknown client; nothing written", async () => {
    const { createCaseStudy } = await loadActions();
    const before = await counts();
    const result = await createCaseStudy({ name: "Action case", clientId: UNKNOWN_ID, year: 2025 });
    expect(result).toEqual({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND", message: expect.any(String) } });
    expect(await counts()).toEqual(before);
  });
});

describe("invalid input writes nothing", () => {
  it.each([
    ["empty name", { name: "" }, ["name"]],
    ["no client picked", { name: "Rebrand", clientId: "" }, ["clientId"]],
    ["a free-text client", { name: "Rebrand", clientId: undefined, client: "Acme" }, ["clientId"]],
    ["both missing", { name: undefined, clientId: undefined }, ["name", "clientId"]],
    ["non-integer year", { year: 2026.5 }, ["year"]],
    ["year below 1900", { year: 1899 }, ["year"]],
    ["year above 2100", { year: 2101 }, ["year"]],
    ["unknown locale", { locale: "de" }, ["locale"]],
  ])("%s → INVALID_INPUT naming %j", async (_label, over, fields) => {
    const { create } = await loadCaseStudy();
    const before = await counts();
    const result = await create(await devActor(), { name: "R", clientId: acme.id, year: 2026, ...over });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(fields);
    }
    expect(await counts()).toEqual(before);
  });

  const INSERT = "insert into public.case_study (name, client_id, number, code, year, locale, created_by)";
  it.each([
    ["blank name", `${INSERT} values (' ', $2, 9999, 'ZZZ-1', 2026, 'it', $1)`],
    ["year out of range", `${INSERT} values ('R', $2, 9999, 'ZZZ-1', 1850, 'it', $1)`],
    ["unknown locale", `${INSERT} values ('R', $2, 9999, 'ZZZ-1', 2026, 'de', $1)`],
    ["number below 1", `${INSERT} values ('R', $2, 0, 'ZZZ-1', 2026, 'it', $1)`],
  ])("the table checks reject a %s as a backstop", async (_label, sql) => {
    await expect(inRolledBackTx(sql, [DEV_ACTOR_ID, acme.id])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("forbidden", () => {
  it("returns 403 FORBIDDEN for a role that cannot create cases, and writes nothing", async () => {
    const { createCaseStudy } = await loadActions();
    // getActor() reads through PostgREST on its own connection: change, then always restore.
    await pool.query("update public.profile set role = 'account_sales_social' where id = $1", [DEV_ACTOR_ID]);
    try {
      const before = await counts();
      const result = await createCaseStudy({ name: "Rebrand", clientId: acme.id, year: 2026 });
      expect(result).toEqual({ ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } });
      expect(await counts()).toEqual(before);
    } finally {
      await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
    }
  });
});

describe("clients page (Story 2.13)", () => {

  async function summaryOf(clientId: string) {
    const { listClientSummaries } = await loadCaseStudy();
    const result = await listClientSummaries();
    if (!result.ok) throw new Error(`listClientSummaries failed: ${result.error.code}`);
    return result.value.find((c) => c.id === clientId);
  }

  it("counts only non-deleted cases; a client with only soft-deleted cases counts 0", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const onlyDeleted = await createTestClient(pool, DEV_ACTOR_ID);
    await createCase({ name: "Count live 1", clientId: client.id });
    await createCase({ name: "Count live 2", clientId: client.id });
    const deleted = await createCase({ name: "Count deleted", clientId: client.id });
    const deletedOnly = await createCase({ name: "Count deleted only", clientId: onlyDeleted.id });
    await pool.query("update public.case_study set deleted_at = now() where id = any($1::uuid[])", [[deleted.id, deletedOnly.id]]);

    expect(await summaryOf(client.id)).toEqual({ ...client, caseCount: 2 });
    expect(await summaryOf(onlyDeleted.id)).toEqual({ ...onlyDeleted, caseCount: 0 });
  });

  it("lists one client's non-deleted cases when the scope names it", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const mine = await createCase({ name: "Scoped mine", clientId: client.id });
    const gone = await createCase({ name: "Scoped gone", clientId: client.id });
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [gone.id]);
    await createCase({ name: "Scoped other" });
    const { list } = await loadCaseStudy();
    const result = await list({ clientId: client.id });
    expect(result.ok && result.value.map((c) => c.id)).toEqual([mine.id]);
  });

  it("adds a client through the action, refuses a name-key duplicate, and renames without touching any code", async () => {
    const { createClient, updateClient } = await loadClientActions();
    const name = nameWithLetters(await freshPrefix(pool));
    const added = await createClient({ name: `  ${name} ` });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    expect(added.value).toMatchObject({ name, sector: null, description: null, logoId: null });
    const created = await createCase({ name: "Rename keeps codes", clientId: added.value.id });

    const before = await counts();
    const duplicate = await createClient({ name: name.toUpperCase().replace(" ", "  ") });
    expect(duplicate).toEqual({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: expect.any(String) } });
    expect(await counts()).toEqual(before);

    const edit = (over: Record<string, unknown>) => updateClient({ clientId: added.value.id, sector: null, description: null, logoId: null, ...over });
    const renamed = await edit({ name: `${name} S.r.l.` });
    expect(renamed).toEqual({
      ok: true,
      value: { id: added.value.id, name: `${name} S.r.l.`, code: added.value.code, sector: null, description: null, logoId: null },
    });
    const { get } = await loadCaseStudy();
    const reread = await get(created.id);
    expect(reread.ok && reread.value).toMatchObject({ code: created.code, client: { name: `${name} S.r.l.`, code: added.value.code } });

    // Its own name, and a case/space variant of it, are not "taken": saved as typed, code unchanged.
    for (const own of [`${name} S.r.l.`, `${name.toLowerCase().replace(" ", "  ")} s.r.l.`]) {
      const same = await edit({ name: own });
      expect(same).toMatchObject({ ok: true, value: { id: added.value.id, name: own.replace(/\s+/g, " "), code: added.value.code } });
    }

    const unknown = await updateClient({ clientId: UNKNOWN_ID, name: "Nobody", sector: null, description: null, logoId: null });
    expect(unknown).toMatchObject({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND" } });
  });

  it("returns 403 FORBIDDEN for a role that cannot manage clients on every client action, and writes nothing", async () => {
    const { createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    for (const role of ["account_sales_social", "admin"]) {
      await pool.query("update public.profile set role = $2 where id = $1", [DEV_ACTOR_ID, role]);
      try {
        const before = await counts();
        const forbidden = { ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } };
        expect(await createClient({ name: nameWithLetters(await freshPrefix(pool)), sector: "Moda" })).toEqual(forbidden);
        expect(await updateClient({ clientId: acme.id, name: "Intruder", sector: "Moda", description: null, logoId: null })).toEqual(forbidden);
        expect(await requestClientLogoUpload({ clientId: acme.id, contentType: "image/png", sizeBytes: 10 })).toEqual(forbidden);
        expect(await confirmClientLogoUpload({ clientId: acme.id, logoId: randomUUID(), contentType: "image/png" })).toEqual(forbidden);
        expect(await counts()).toEqual(before);
        const { rows } = await pool.query("select name, sector, description, logo_id from public.client where id = $1", [acme.id]);
        expect(rows[0]).toMatchObject({ name: acme.name });
      } finally {
        await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
      }
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

describe("list", () => {
  /** A committed case walked to `approved` through the real transition use case. */
  async function approvedCase(input: Record<string, unknown> = {}) {
    const { transition } = await loadCaseStudy();
    const actor = await devActor();
    const created = await createCase(input);
    for (const event of ["generate", "generation_succeeded", "approve"]) {
      const moved = await transition(created.id, event, actor);
      if (!moved.ok) throw new Error(`setup transition ${event} failed: ${moved.error.code}`);
    }
    return created.id;
  }

  async function softDelete(id: string) {
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [id]);
  }

  async function listed(scope: { status?: CaseStatus }) {
    const { list } = await loadCaseStudy();
    const result = await list(scope);
    if (!result.ok) throw new Error(`list failed: ${result.error.code}`);
    return result.value;
  }

  const isNewestFirst = (cases: { updatedAt: string }[]) =>
    cases.every((c, i) => i === 0 || Date.parse(cases[i - 1].updatedAt) >= Date.parse(c.updatedAt));

  it("lists every non-deleted case, newest updated first, never a soft-deleted one", async () => {
    const draft = (await createCase({ name: "List draft" })).id;
    const approved = await approvedCase({ name: "List approved" });
    const deleted = (await createCase({ name: "List deleted" })).id;
    await softDelete(deleted);

    const cases = await listed({});
    const ids = cases.map((c) => c.id);
    expect(ids).toContain(draft);
    expect(ids).toContain(approved);
    expect(ids).not.toContain(deleted);
    expect(cases.every((c) => c.deletedAt === null)).toBe(true);
    expect(isNewestFirst(cases)).toBe(true);
  });

  it("the approved-only scope returns approved, non-deleted cases only", async () => {
    const draft = (await createCase({ name: "Scope draft" })).id;
    const approved = await approvedCase({ name: "Scope approved" });
    const deletedApproved = await approvedCase({ name: "Scope deleted approved" });
    await softDelete(deletedApproved);

    const cases = await listed({ status: "approved" });
    const ids = cases.map((c) => c.id);
    expect(ids).toContain(approved);
    expect(ids).not.toContain(draft);
    expect(ids).not.toContain(deletedApproved);
    expect(cases.every((c) => c.status === "approved" && c.deletedAt === null)).toBe(true);
    expect(isNewestFirst(cases)).toBe(true);

    const { rows } = await pool.query<{ n: number }>(
      "select count(*)::int as n from public.case_study where status = 'approved' and deleted_at is null",
    );
    expect(cases).toHaveLength(rows[0].n);
  });

  it("rejects a malformed scope without querying", async () => {
    const { list } = await loadCaseStudy();
    const result = await list({ status: "archived" } as unknown as { status?: CaseStatus });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
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
        data: expect.objectContaining({ name: "Rebrand", clientId: acme.id, code: created.code }),
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
  it.each(["case_study", "case_event", "client", "case_number_counter"])("enables RLS with no policies on %s", async (table) => {
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

  it.each(["case_study", "case_event", "client", "client_logo", "case_number_counter"])("the browser key is refused reading %s", async (table) => {
    const { data, error } = await browser().from(table).select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("the browser key is refused calling create_case_study", async () => {
    const { data, error } = await browser().rpc("create_case_study", {
      p_name: "Intruder",
      p_client_id: acme.id,
      p_year: 2026,
      p_locale: "it",
      p_actor_id: DEV_ACTOR_ID,
    });
    expect(data).toBeNull();
    // Permission denied, or PostgREST hiding a function the role may not execute.
    expect(["42501", "PGRST202"]).toContain(error?.code);
  });

  type Table = "case_study" | "case_event" | "client" | "client_logo" | "case_number_counter";
  const INSERTS: Record<Table, string> = {
    case_study: `insert into public.case_study (name, client_id, number, code, year, created_by) values ('I', '${UNKNOWN_ID}', 1, 'I', 2026, '${DEV_ACTOR_ID}')`,
    case_event: `insert into public.case_event (case_id, actor_id, type) values ('${UNKNOWN_ID}', '${DEV_ACTOR_ID}', 'x')`,
    client: `insert into public.client (name, name_key, code, created_by) values ('I', 'i', 'III', '${DEV_ACTOR_ID}')`,
    client_logo: `insert into public.client_logo (client_id, path, mime_type, size_bytes, created_by) values ('${UNKNOWN_ID}', 'p', 'image/png', 1, '${DEV_ACTOR_ID}')`,
    case_number_counter: `insert into public.case_number_counter (client_id, year, last_number) values ('${UNKNOWN_ID}', 2026, 1)`,
  };
  const UPDATES: Record<Table, string> = {
    case_study: "name = 'x'",
    case_event: "type = 'x'",
    client: "name = 'x'",
    client_logo: "path = 'x'",
    case_number_counter: "last_number = 1",
  };
  const statements = (table: Table) => ({
    select: `select * from public.${table}`,
    insert: INSERTS[table],
    update: `update public.${table} set ${UPDATES[table]}`,
    delete: `delete from public.${table}`,
  });
  const cases = (["anon", "authenticated"] as const).flatMap((role) =>
    (["case_study", "case_event", "client", "client_logo", "case_number_counter"] as const).flatMap((table) =>
      Object.entries(statements(table)).map(([verb, sql]) => [role, verb, table, sql] as const),
    ),
  );

  it.each(cases)("%s gets permission denied on %s %s", async (role, _verb, _table, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });

  const FUNCTIONS = [
    `public.create_case_study('I', '${UNKNOWN_ID}'::uuid, 2026, 'it', '${DEV_ACTOR_ID}')`,
    `public.create_client('Intruder', null, null, '${DEV_ACTOR_ID}')`,
    `public.update_client('${UNKNOWN_ID}', 'Intruder', null, null, null, '${DEV_ACTOR_ID}')`,
    "public.client_info_text(' x ')",
    `public.delete_client_logo('${UNKNOWN_ID}')`,
    "public.client_code_letters('Intruder')",
    "public.client_name_key('Intruder')",
    "public.case_study_code('III', 2026, 1)",
  ];
  it.each((["anon", "authenticated"] as const).flatMap((role) => FUNCTIONS.map((call) => [role, call] as const)))(
    "%s may not execute %s",
    async (role, call) => {
      await expect(inRolledBackTx(`select ${call}`, [], role)).rejects.toMatchObject({ code: "42501" });
    },
  );

  it("the old create_client and rename_client signatures are gone", async () => {
    await expect(inRolledBackTx(`select public.create_client('I', '${DEV_ACTOR_ID}'::uuid)`)).rejects.toMatchObject({ code: "42883" });
    await expect(
      inRolledBackTx(`select public.rename_client('${UNKNOWN_ID}'::uuid, 'I', '${DEV_ACTOR_ID}'::uuid)`),
    ).rejects.toMatchObject({ code: "42883" });
  });

  it("the old free-text create_case_study signature is gone", async () => {
    await expect(
      inRolledBackTx(`select public.create_case_study('I', 'X'::text, 2026, 'it', '${DEV_ACTOR_ID}'::uuid)`),
    ).rejects.toMatchObject({ code: "42883" });
  });
});

describe("transition", () => {
  /** Events that walk a new draft case to each status through the real use case. */
  const PATH: Record<CaseStatus, string[]> = {
    draft: [],
    generating: ["generate"],
    in_review: ["generate", "generation_succeeded"],
    approved: ["generate", "generation_succeeded", "approve"],
  };

  async function caseIn(status: CaseStatus) {
    const { transition } = await loadCaseStudy();
    const actor = await devActor();
    const created = await createCase();
    for (const event of PATH[status]) {
      const moved = await transition(created.id, event, actor);
      if (!moved.ok) throw new Error(`setup transition ${event} failed: ${moved.error.code}`);
    }
    return created.id;
  }

  async function statusOf(id: string) {
    const { rows } = await pool.query<{ status: string }>("select status from public.case_study where id = $1", [id]);
    return rows[0]?.status;
  }

  async function transitionEvents(id: string) {
    const { rows } = await pool.query(
      "select actor_id, revision_id, data from public.case_event where case_id = $1 and type = 'transition' order by at",
      [id],
    );
    return rows;
  }

  async function expectRefused(result: { ok: boolean; error?: { code: string } }, code: string) {
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error?.code).toBe(code);
  }

  it.each([
    ["draft", "generate", "generating"],
    ["generating", "generation_succeeded", "in_review"],
    ["generating", "generation_failed", "draft"],
    ["in_review", "approve", "approved"],
  ] as const)("%s --%s--> %s writes the status and one transition event with the actor", async (from, event, to) => {
    const id = await caseIn(from);
    const before = await transitionEvents(id);
    const actor = await devActor();
    const { transition } = await loadCaseStudy();
    const result = await transition(id, event, actor);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ id, status: to });
    expect(await statusOf(id)).toBe(to);
    expect(await transitionEvents(id)).toEqual([
      ...before,
      { actor_id: actor.id, revision_id: null, data: { event, from, to } },
    ]);
  });

  it.each([
    ["approve on draft", "draft", "approve"],
    ["generation_succeeded on draft", "draft", "generation_succeeded"],
    ["generate on in_review", "in_review", "generate"],
    ...["generate", "generation_succeeded", "generation_failed", "approve"].map(
      (event) => [`${event} on approved`, "approved", event] as const,
    ),
    ["an unknown event", "draft", "fork"],
  ] as const)("%s → INVALID_TRANSITION; nothing written", async (_label, status, event) => {
    const id = await caseIn(status);
    const { transition } = await loadCaseStudy();
    const before = await counts();
    await expectRefused(await transition(id, event, await devActor()), "INVALID_TRANSITION");
    expect(await statusOf(id)).toBe(status);
    expect(await counts()).toEqual(before);
  });

  it("a status that moved since the read → STALE_STATUS; nothing written", async () => {
    const id = await caseIn("generating");
    // The adapter call the use case makes after reading `draft`.
    const { createSupabaseCaseStudyRepository } = await import("@/modules/case-study/adapters/supabase/case-study-repository");
    const before = await counts();
    const result = await createSupabaseCaseStudyRepository().transition({
      caseId: id,
      event: "generate",
      from: "draft",
      to: "generating",
      actorId: DEV_ACTOR_ID,
    });
    await expectRefused(result, "STALE_STATUS");
    expect(await statusOf(id)).toBe("generating");
    expect(await counts()).toEqual(before);
  });

  it.each([
    ["an unknown id", async () => UNKNOWN_ID],
    [
      "a soft-deleted case",
      async () => {
        const id = await caseIn("draft");
        await pool.query("update public.case_study set deleted_at = now() where id = $1", [id]);
        return id;
      },
    ],
  ])("the adapter maps %s to NOT_FOUND; nothing written", async (_label, setup) => {
    const caseId = await setup();
    const { createSupabaseCaseStudyRepository } = await import("@/modules/case-study/adapters/supabase/case-study-repository");
    const before = await counts();
    const result = await createSupabaseCaseStudyRepository().transition({
      caseId,
      event: "generate",
      from: "draft",
      to: "generating",
      actorId: DEV_ACTOR_ID,
    });
    await expectRefused(result, "NOT_FOUND");
    expect(await counts()).toEqual(before);
  });

  it.each([
    ["an unknown id", async () => UNKNOWN_ID],
    ["a malformed id", async () => "not-a-uuid"],
    [
      "a soft-deleted case",
      async () => {
        const id = await caseIn("draft");
        await pool.query("update public.case_study set deleted_at = now() where id = $1", [id]);
        return id;
      },
    ],
  ])("%s → NOT_FOUND; nothing written", async (_label, setup) => {
    const id = await setup();
    const { transition } = await loadCaseStudy();
    const before = await counts();
    await expectRefused(await transition(id, "generate", await devActor()), "NOT_FOUND");
    expect(await counts()).toEqual(before);
  });

  describe("transition_case_study itself", () => {
    const call = "select public.transition_case_study($1, $2, $3, $4, $5)";

    it("raises STALE_STATUS when status is not p_from, writing nothing", async () => {
      const id = await caseIn("generating");
      const before = await counts();
      await expect(inRolledBackTx(call, [id, "generate", "draft", "generating", DEV_ACTOR_ID])).rejects.toMatchObject({
        code: "P0001",
        message: "STALE_STATUS",
      });
      expect(await counts()).toEqual(before);
    });

    it("raises NOT_FOUND for an unknown or soft-deleted case", async () => {
      await expect(inRolledBackTx(call, [UNKNOWN_ID, "generate", "draft", "generating", DEV_ACTOR_ID])).rejects.toMatchObject({
        code: "P0001",
        message: "NOT_FOUND",
      });
      const id = await caseIn("draft");
      await pool.query("update public.case_study set deleted_at = now() where id = $1", [id]);
      await expect(inRolledBackTx(call, [id, "generate", "draft", "generating", DEV_ACTOR_ID])).rejects.toMatchObject({
        code: "P0001",
        message: "NOT_FOUND",
      });
      expect(await statusOf(id)).toBe("draft");
    });

    it("raises INVALID_TRANSITION when from equals to, so no event without a status change", async () => {
      const id = await caseIn("draft");
      await expect(inRolledBackTx(call, [id, "generate", "draft", "draft", DEV_ACTOR_ID])).rejects.toMatchObject({
        code: "P0001",
        message: "INVALID_TRANSITION",
      });
      expect(await transitionEvents(id)).toEqual([]);
    });

    it("rejects a status outside the check constraint, writing no event", async () => {
      const id = await caseIn("draft");
      await expect(inRolledBackTx(call, [id, "generate", "draft", "archived", DEV_ACTOR_ID])).rejects.toMatchObject({
        code: "23514",
      });
      expect(await transitionEvents(id)).toEqual([]);
    });

    it("does not leave status writes open for the rest of the transaction", async () => {
      const id = await caseIn("draft");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(call, [id, "generate", "draft", "generating", DEV_ACTOR_ID]);
        await expect(client.query("update public.case_study set status = 'approved' where id = $1", [id])).rejects.toMatchObject({
          code: "P0001",
          message: expect.stringMatching(/only through transition_case_study/),
        });
      } finally {
        await client.query("rollback").catch(() => undefined);
        client.release();
      }
      expect(await statusOf(id)).toBe("draft");
    });

    it.each(["anon", "authenticated"])("%s may not execute it", async (role) => {
      await expect(
        inRolledBackTx(`select public.transition_case_study('${UNKNOWN_ID}', 'generate', 'draft', 'generating', '${DEV_ACTOR_ID}')`, [], role),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("the browser key is refused calling it", async () => {
      const browser = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await browser.rpc("transition_case_study", {
        p_case_id: UNKNOWN_ID,
        p_event: "generate",
        p_from: "draft",
        p_to: "generating",
        p_actor_id: DEV_ACTOR_ID,
      });
      expect(data).toBeNull();
      expect(["42501", "PGRST202"]).toContain(error?.code);
    });
  });

  describe("direct status writes", () => {
    it.each(["generating", "approved", "draft"])("update … set status = %s is rejected and the row is unchanged", async (status) => {
      const id = await caseIn("in_review");
      await expect(
        inRolledBackTx("update public.case_study set status = $2 where id = $1", [id, status]),
      ).rejects.toMatchObject({ code: "P0001", message: expect.stringMatching(/only through transition_case_study/) });
      expect(await statusOf(id)).toBe("in_review");
    });

    it("a soft delete is still allowed", async () => {
      const id = await caseIn("draft");
      const { rows } = await inRolledBackTx(
        "update public.case_study set deleted_at = now() where id = $1 returning status, deleted_at is not null as deleted",
        [id],
      );
      expect(rows).toEqual([{ status: "draft", deleted: true }]);
    });

    it("an updated_at touch (and a same-value status assignment) is still allowed", async () => {
      const id = await caseIn("draft");
      const { rows } = await inRolledBackTx(
        "update public.case_study set updated_at = now(), status = status where id = $1 returning status",
        [id],
      );
      expect(rows).toEqual([{ status: "draft" }]);
    });
  });
});

describe("clients and readable case history codes (AD-21)", () => {
  /** Runs `body` on one connection inside a transaction that is always rolled back. */
  async function rolledBack<T>(body: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      return await body(client);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  }

  /** A dedicated connection (outside the pool) for the concurrency tests. */
  async function connection() {
    const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL });
    await client.connect();
    return client;
  }

  /** Polls until backend `pid` waits on a lock (pg_stat_activity), so the overlap is real; fails after `timeoutMs`. */
  async function waitUntilBlocked(pid: number, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { rows } = await pool.query<{ wait_event_type: string | null }>(
        "select wait_event_type from pg_catalog.pg_stat_activity where pid = $1",
        [pid],
      );
      if (rows[0]?.wait_event_type === "Lock") return;
      if (Date.now() > deadline) throw new Error(`backend ${pid} never waited on a lock`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const backendPid = async (client: pg.Client) =>
    (await client.query<{ pid: number }>("select pg_catalog.pg_backend_pid() as pid")).rows[0].pid;

  const createClientSql = "select id, name, code from public.create_client($1, null, null, $2)";
  const createCaseSql = "select number, code from public.create_case_study('Concurrent', $1, $2, 'it', $3)";

  describe("client codes", () => {
    it("gives LUM, LUMI, LUME, CIT, AAX, MXX in order (rules 1 and 3)", async () => {
      const codes = await rolledBack(async (client) => {
        const out: string[] = [];
        for (const name of ["Lumen Srl", "Lumina S.p.A.", "Lume", "Città di Torino", "A2A", "3M"]) {
          out.push((await client.query<TestClient>(createClientSql, [name, DEV_ACTOR_ID])).rows[0].code);
        }
        return out;
      });
      expect(codes).toEqual(["LUM", "LUMI", "LUME", "CIT", "AAX", "MXX"]);
    });

    it.each([
      ["S.p.A.", "SPA"],
      ["Lumen Srl", "LUMEN"],
      ["Lumina S.p.A.", "LUMINA"],
      ["Città di Torino", "CITTADITORINO"],
      ["A2A", "AAX"],
      ["3M", "MXX"],
      ["Rossi & Figli S.n.c.", "ROSSIFIGLI"],
    ])("client_code_letters(%j) is %s", async (name, letters) => {
      const { rows } = await pool.query<{ letters: string }>("select public.client_code_letters($1) as letters", [name]);
      expect(rows).toEqual([{ letters }]);
    });

    it.each(["lumen  srl", " LÙMEN SRL ", "Lumen\tSrl"])("rejects %j after 'Lumen Srl' with CLIENT_NAME_TAKEN; nothing written", async (dup) => {
      await rolledBack(async (client) => {
        await client.query(createClientSql, ["Lumen Srl", DEV_ACTOR_ID]);
        const before = (await client.query("select count(*)::int as n from public.client")).rows[0].n;
        await client.query("savepoint dup");
        await expect(client.query(createClientSql, [dup, DEV_ACTOR_ID])).rejects.toMatchObject({
          code: "P0001",
          message: "CLIENT_NAME_TAKEN",
        });
        await client.query("rollback to savepoint dup");
        expect((await client.query("select count(*)::int as n from public.client")).rows[0].n).toBe(before);
      });
    });

    it("stores the name with whitespace collapsed and trimmed, on create and on rename", async () => {
      await rolledBack(async (client) => {
        const created = (await client.query<TestClient>(createClientSql, ["\t Lumen \n  Srl  ", DEV_ACTOR_ID])).rows[0];
        expect(created.name).toBe("Lumen Srl");
        const { rows } = await client.query("select name, name_key from public.update_client($1, $2, null, null, null, $3)", [
          created.id,
          "  Lumen\t\tGroup \n",
          DEV_ACTOR_ID,
        ]);
        expect(rows).toEqual([{ name: "Lumen Group", name_key: "lumen group" }]);
      });
    });

    it("fails with CLIENT_CODE_EXHAUSTED once the first 3, first 4 and first 3 + A–Z are taken; nothing written", async () => {
      await rolledBack(async (client) => {
        const prefix = await freshPrefix(client);
        const made = [(await createTestClient(client, DEV_ACTOR_ID, nameWithLetters(prefix))).code];
        for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
          made.push((await createTestClient(client, DEV_ACTOR_ID, nameWithLetters(prefix + letter))).code);
        }
        expect(made).toEqual([prefix, ...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => prefix + l)]);
        const before = (await client.query("select count(*)::int as n from public.client")).rows[0].n;
        await client.query("savepoint all_taken");
        await expect(client.query(createClientSql, [nameWithLetters(`${prefix}QQ`), DEV_ACTOR_ID])).rejects.toMatchObject({
          code: "P0001",
          message: "CLIENT_CODE_EXHAUSTED",
        });
        await client.query("rollback to savepoint all_taken");
        expect((await client.query("select count(*)::int as n from public.client")).rows[0].n).toBe(before);
      });
    });

    it("gives two clients created at once with the same letters different codes", async () => {
      const prefix = await freshPrefix(pool);
      const [a, b] = [await connection(), await connection()];
      try {
        const bPid = await backendPid(b);
        await a.query("begin");
        await b.query("begin");
        const first = (await a.query<TestClient>(createClientSql, [nameWithLetters(prefix), DEV_ACTOR_ID])).rows[0];
        // Blocks on the advisory lock until `a` commits.
        const second = b.query<TestClient>(createClientSql, [nameWithLetters(prefix), DEV_ACTOR_ID]);
        await waitUntilBlocked(bPid);
        await a.query("commit");
        const secondCode = (await second).rows[0].code;
        await b.query("commit");
        expect(first.code).toBe(prefix);
        expect(secondCode).toBe(`${prefix}A`);
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        await a.end();
        await b.end();
      }
    });
  });

  describe("case codes", () => {
    it("numbers per client and year, restarting each year, padded to 2 digits with no upper limit", async () => {
      const client = await createTestClient(pool, DEV_ACTOR_ID);
      const codes = [];
      for (const year of [2025, 2025, 2026]) codes.push((await createCase({ clientId: client.id, year })).code);
      expect(codes).toEqual([`${client.code}-2025-01`, `${client.code}-2025-02`, `${client.code}-2026-01`]);

      // Skip ahead to the 100th case of 2026.
      await pool.query("update public.case_number_counter set last_number = 99 where client_id = $1 and year = 2026", [client.id]);
      const hundredth = await createCase({ clientId: client.id, year: 2026 });
      expect(hundredth).toMatchObject({ number: 100, code: `${client.code}-2026-100` });
    });

    it("gives two parallel creates for the same client and year consecutive numbers", async () => {
      const client = await createTestClient(pool, DEV_ACTOR_ID);
      const [a, b] = [await connection(), await connection()];
      try {
        const bPid = await backendPid(b);
        await a.query("begin");
        await b.query("begin");
        const first = (await a.query(createCaseSql, [client.id, 2026, DEV_ACTOR_ID])).rows[0];
        // Blocks on the counter row until `a` commits.
        const second = b.query(createCaseSql, [client.id, 2026, DEV_ACTOR_ID]);
        await waitUntilBlocked(bPid);
        await a.query("commit");
        const secondRow = (await second).rows[0];
        await b.query("commit");
        expect([first.number, secondRow.number]).toEqual([1, 2]);
        expect([first.code, secondRow.code]).toEqual([`${client.code}-2026-01`, `${client.code}-2026-02`]);
      } finally {
        await a.query("rollback").catch(() => undefined);
        await b.query("rollback").catch(() => undefined);
        await a.end();
        await b.end();
      }
    });

    it("a rolled-back create leaves no gap", async () => {
      const client = await createTestClient(pool, DEV_ACTOR_ID);
      await rolledBack(async (tx) => {
        expect((await tx.query(createCaseSql, [client.id, 2026, DEV_ACTOR_ID])).rows[0].number).toBe(1);
      });
      expect((await createCase({ clientId: client.id })).code).toBe(`${client.code}-2026-01`);
    });

    it("an unknown client → CLIENT_NOT_FOUND; nothing written", async () => {
      const { create } = await loadCaseStudy();
      const before = await counts();
      const result = await create(await devActor(), { name: "R", clientId: UNKNOWN_ID, year: 2026 });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CLIENT_NOT_FOUND");
      expect(await counts()).toEqual(before);
    });

    it("a create that fails after the counter (bad locale) rolls the counter back", async () => {
      const client = await createTestClient(pool, DEV_ACTOR_ID);
      await expect(
        pool.query("select public.create_case_study('R', $1, 2026, 'de', $2)", [client.id, DEV_ACTOR_ID]),
      ).rejects.toMatchObject({ code: "23514" });
      expect((await createCase({ clientId: client.id })).number).toBe(1);
    });

    it("reads show the client's current name after a rename; codes stay", async () => {
      const client = await createTestClient(pool, DEV_ACTOR_ID);
      const created = await createCase({ clientId: client.id });
      const renamed = `${client.name} Group`;
      const { rows } = await pool.query("select name, code from public.update_client($1, $2, null, null, null, $3)", [
        client.id,
        renamed,
        DEV_ACTOR_ID,
      ]);
      expect(rows).toEqual([{ name: renamed, code: client.code }]);
      const { get } = await loadCaseStudy();
      const read = await get(created.id);
      expect(read.ok && read.value).toMatchObject({ code: created.code, client: { id: client.id, name: renamed, code: client.code } });
    });
  });

  describe("immutability", () => {
    let caseId: string;
    let client: TestClient;

    beforeAll(async () => {
      client = await createTestClient(pool, DEV_ACTOR_ID);
      caseId = (await createCase({ clientId: client.id })).id;
    });

    it.each([
      ["case_study.code", "update public.case_study set code = 'ZZZ-2026-01' where id = $1"],
      ["case_study.number", "update public.case_study set number = number + 1000 where id = $1"],
    ])("rejects a change to %s", async (_label, sql) => {
      await expect(inRolledBackTx(sql, [caseId])).rejects.toMatchObject({ code: "P0001", message: expect.stringMatching(/immutable/) });
    });

    it("keeps code and number when the case's year or client changes", async () => {
      const other = await createTestClient(pool, DEV_ACTOR_ID);
      const { rows } = await inRolledBackTx(
        "update public.case_study set year = 2030, client_id = $2 where id = $1 returning code, number",
        [caseId, other.id],
      );
      expect(rows).toEqual([{ code: `${client.code}-2026-01`, number: 1 }]);
    });

    it("rejects a change to client.code", async () => {
      await expect(inRolledBackTx("update public.client set code = 'ZZZ' where id = $1", [client.id])).rejects.toMatchObject({
        code: "P0001",
        message: expect.stringMatching(/immutable/),
      });
    });

    it("keeps client.code and refreshes name_key when the name changes", async () => {
      const { rows } = await inRolledBackTx("update public.client set name = 'Nuovo Nome' where id = $1 returning code, name_key", [
        client.id,
      ]);
      expect(rows).toEqual([{ code: client.code, name_key: "nuovo nome" }]);
    });

    it.each([
      ["DELETE", "delete from public.client where id = $1"],
      ["TRUNCATE", "truncate public.client cascade"],
    ])("rejects %s on client", async (_label, sql) => {
      await expect(inRolledBackTx(sql, sql.includes("$1") ? [client.id] : [])).rejects.toMatchObject({ code: "P0001" });
    });

    it("update_client refuses an unknown client and a taken name", async () => {
      await expect(
        inRolledBackTx("select public.update_client($1, 'x', null, null, null, $2)", [UNKNOWN_ID, DEV_ACTOR_ID]),
      ).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NOT_FOUND" });
      await expect(
        inRolledBackTx("select public.update_client($1, $2, null, null, null, $3)", [client.id, ` ${acme.name.toUpperCase()} `, DEV_ACTOR_ID]),
      ).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NAME_TAKEN" });
    });
  });

  it("listClients returns every client with its code, sorted by name", async () => {
    const { listClients } = await loadCaseStudy();
    const result = await listClients();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContainEqual(acme);
    const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });
    const names = result.value.map((c) => c.name);
    expect(names).toEqual([...names].sort(collator.compare));
  });

  it("case_study carries client_id, number and code as NOT NULL; the free-text client column is gone", async () => {
    const { rows } = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'case_study' and column_name in ('client', 'client_id', 'number', 'code')
       order by column_name`,
    );
    expect(rows).toEqual([
      { column_name: "client_id", is_nullable: "NO" },
      { column_name: "code", is_nullable: "NO" },
      { column_name: "number", is_nullable: "NO" },
    ]);
  });
});

describe("client info (Story 2.14, AD-22)", () => {
  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

  /** Inserts one `client_logo` row for `clientId` directly (as the confirm step would). */
  async function insertLogo(clientId: string) {
    const id = randomUUID();
    await pool.query(
      "insert into public.client_logo (id, client_id, path, mime_type, size_bytes, created_by) values ($1, $2, $3, 'image/png', 2048, $4)",
      [id, clientId, `clients/${clientId}/logos/${id}.png`, DEV_ACTOR_ID],
    );
    return id;
  }

  it("adds nullable sector, description and logo_id; an existing client starts empty", async () => {
    const { rows: columns } = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'client' and column_name in ('sector', 'description', 'logo_id')
        order by column_name`,
    );
    expect(columns).toEqual([
      { column_name: "description", is_nullable: "YES" },
      { column_name: "logo_id", is_nullable: "YES" },
      { column_name: "sector", is_nullable: "YES" },
    ]);
    const { rows } = await pool.query("select sector, description, logo_id from public.client where id = $1", [acme.id]);
    expect(rows).toEqual([{ sector: null, description: null, logo_id: null }]);
  });

  it("creates client_logo with the AD-22 columns", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'client_logo' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["client_id", "created_at", "created_by", "id", "mime_type", "path", "size_bytes"]);
  });

  it.each([
    ["description", 400],
    ["sector", 60],
  ])("accepts a %s of %i characters (emoji = 1) and refuses one more", async (column, max) => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const { rows } = await inRolledBackTx(`update public.client set ${column} = $2 where id = $1 returning char_length(${column}) as n`, [
      client.id,
      "😀".repeat(max),
    ]);
    expect(rows).toEqual([{ n: max }]);
    await expect(
      inRolledBackTx(`update public.client set ${column} = $2 where id = $1`, [client.id, "x".repeat(max + 1)]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(inRolledBackTx(`update public.client set ${column} = '   ' where id = $1`, [client.id])).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("create_client and update_client store trimmed info and blank as null", async () => {
    const name = nameWithLetters(await freshPrefix(pool));
    const { rows } = await inRolledBackTx(
      `with created as (select * from public.create_client($1, '  Moda ', E'\n\t ', $2))
       select sector, description from created`,
      [name, DEV_ACTOR_ID],
    );
    expect(rows).toEqual([{ sector: "Moda", description: null }]);
  });

  it("update_client trims padded non-blank sector and description and stores blank as null", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const { rows: padded } = await inRolledBackTx(
      "select sector, description from public.update_client($1, $2, $3, $4, null, $5)",
      [client.id, client.name, "  Moda \t", "\n Brand di moda.  ", DEV_ACTOR_ID],
    );
    expect(padded).toEqual([{ sector: "Moda", description: "Brand di moda." }]);
    const { rows: blank } = await inRolledBackTx(
      "select sector, description from public.update_client($1, $2, $3, $4, null, $5)",
      [client.id, client.name, "   ", "\n\t", DEV_ACTOR_ID],
    );
    expect(blank).toEqual([{ sector: null, description: null }]);
  });

  it("through the action: saves the info, refuses 401 characters with CLIENT_FIELD_TOO_LONG and writes nothing", async () => {
    const { createClient, updateClient } = await loadClientActions();
    const before = await counts();
    const tooLong = await createClient({ name: nameWithLetters(await freshPrefix(pool)), description: "x".repeat(401) });
    expect(tooLong).toEqual({
      ok: false,
      status: 400,
      error: { code: "CLIENT_FIELD_TOO_LONG", message: expect.any(String), fields: ["description"] },
    });
    expect(await counts()).toEqual(before);

    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)), sector: " Moda ", description: "😀".repeat(400) });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    expect(added.value).toMatchObject({ sector: "Moda", description: "😀".repeat(400), logoId: null });

    const sectorTooLong = await updateClient({
      clientId: added.value.id,
      name: added.value.name,
      sector: "s".repeat(61),
      description: null,
      logoId: null,
    });
    expect(sectorTooLong).toMatchObject({ ok: false, status: 400, error: { code: "CLIENT_FIELD_TOO_LONG", fields: ["sector"] } });
    const { rows } = await pool.query("select sector from public.client where id = $1", [added.value.id]);
    expect(rows).toEqual([{ sector: "Moda" }]);
  });

  it.each([
    ["mime_type", "image/svg+xml", 2048],
    ["mime_type", "image/gif", 2048],
    ["size_bytes", "image/png", 0],
    ["size_bytes", "image/png", 5 * 1024 * 1024 + 1],
  ])("client_logo refuses a %s outside the limits (%s, %i B)", async (_label, mime, size) => {
    await expect(
      inRolledBackTx(
        "insert into public.client_logo (client_id, path, mime_type, size_bytes, created_by) values ($1, $2, $3, $4, $5)",
        [acme.id, `clients/${acme.id}/logos/${randomUUID()}.x`, mime, size, DEV_ACTOR_ID],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("client_logo rows can now be updated and deleted directly (no append-only guard)", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await insertLogo(client.id);
    const { rows } = await inRolledBackTx("update public.client_logo set path = 'x' where id = $1 returning path", [logoId]);
    expect(rows).toEqual([{ path: "x" }]);
    const deleted = await inRolledBackTx("delete from public.client_logo where id = $1", [logoId]);
    expect(deleted.rowCount).toBe(1);
    const { rows: triggers } = await pool.query(
      "select tgname from pg_catalog.pg_trigger where tgrelid = 'public.client_logo'::regclass and not tgisinternal",
    );
    expect(triggers).toEqual([]);
  });

  it("delete_client_logo deletes a logo no client shows, and refuses one in use with CLIENT_LOGO_IN_USE", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const first = await insertLogo(client.id);
    const second = await insertLogo(client.id);
    await pool.query("select public.update_client($1, $2, null, null, $3, $4)", [client.id, client.name, second, DEV_ACTOR_ID]);

    await expect(pool.query("select public.delete_client_logo($1)", [second])).rejects.toMatchObject({
      code: "P0001",
      message: "CLIENT_LOGO_IN_USE",
    });
    expect((await pool.query("select count(*)::int as n from public.client_logo where id = $1", [second])).rows[0].n).toBe(1);

    expect((await pool.query("select public.delete_client_logo($1) as deleted", [first])).rows).toEqual([{ deleted: true }]);
    expect((await pool.query("select public.delete_client_logo($1) as deleted", [first])).rows).toEqual([{ deleted: false }]);
    expect((await pool.query("select count(*)::int as n from public.client_logo where id = $1", [first])).rows[0].n).toBe(0);
  });

  it("through the action, replacing and removing a logo deletes the old row and object", async () => {
    const { createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)) });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    const clientId = added.value.id;
    const upload = async () => {
      const bytes = await png(800, 400);
      const presigned = await requestClientLogoUpload({ clientId, contentType: "image/png", sizeBytes: bytes.byteLength });
      if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
      const { logoId, url, method, headers } = presigned.value;
      expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);
      expect(await confirmClientLogoUpload({ clientId, logoId, contentType: "image/png" })).toEqual({ ok: true, value: { logoId } });
      return logoId;
    };
    const link = (logoId: string | null) => updateClient({ clientId, name: added.value.name, sector: null, description: null, logoId });
    const objects = async () => {
      const { data } = await createSupabaseAdmin().storage.from("material").list(`clients/${clientId}/logos`);
      return (data ?? []).map((o) => o.name).sort();
    };
    const rows = async () =>
      (await pool.query("select id from public.client_logo where client_id = $1", [clientId])).rows.map((r) => r.id);

    const first = await upload();
    expect(await link(first)).toMatchObject({ ok: true, value: { logoId: first } });
    const second = await upload();
    expect(await link(second)).toMatchObject({ ok: true, value: { logoId: second } });
    expect(await rows()).toEqual([second]);
    expect(await objects()).toEqual([`${second}.png`]);

    expect(await link(null)).toMatchObject({ ok: true, value: { logoId: null } });
    expect(await rows()).toEqual([]);
    expect(await objects()).toEqual([]);
  });

  it.each([
    ["another client's logo", true],
    ["an unknown logo", false],
  ])("update_client refuses %s with CLIENT_LOGO_INVALID; nothing written", async (_label, foreign) => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const other = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = foreign ? await insertLogo(other.id) : randomUUID();
    await expect(
      pool.query("select public.update_client($1, 'Renamed too', 'Moda', null, $2, $3)", [client.id, logoId, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "CLIENT_LOGO_INVALID" });
    const { rows } = await pool.query("select name, sector, logo_id from public.client where id = $1", [client.id]);
    expect(rows).toEqual([{ name: client.name, sector: null, logo_id: null }]);
  });

  it("getClientInfoForCase returns the client's current values; a deleted or unknown case is NOT_FOUND", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await insertLogo(client.id);
    await pool.query("select public.update_client($1, $2, 'Moda', 'Brand.', $3, $4)", [client.id, client.name, logoId, DEV_ACTOR_ID]);
    const created = await createCase({ clientId: client.id });
    const { getClientInfoForCase } = await loadCaseStudy();
    expect(await getClientInfoForCase(created.id)).toEqual({
      ok: true,
      value: { clientId: client.id, name: client.name, sector: "Moda", description: "Brand.", logoId },
    });
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    expect(await getClientInfoForCase(created.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getClientInfoForCase(UNKNOWN_ID)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("round trip: presign → PUT under clients/{clientId}/logos/ → confirm → link → signed GET on the client page", async () => {
    const { createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)) });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    const clientId = added.value.id;
    const bytes = await png(800, 400);

    const presigned = await requestClientLogoUpload({ clientId, contentType: "image/png", sizeBytes: bytes.byteLength });
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { logoId, url, method, headers } = presigned.value;
    expect(new URL(url).pathname).toContain(`/object/upload/sign/material/clients/${clientId}/logos/${logoId}.png`);
    expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);

    const confirmed = await confirmClientLogoUpload({ clientId, logoId, contentType: "image/png" });
    expect(confirmed).toEqual({ ok: true, value: { logoId } });
    const { rows } = await pool.query("select client_id, path, mime_type, size_bytes::int as size from public.client_logo where id = $1", [logoId]);
    expect(rows).toEqual([{ client_id: clientId, path: `clients/${clientId}/logos/${logoId}.png`, mime_type: "image/png", size: bytes.byteLength }]);

    const linked = await updateClient({ clientId, name: added.value.name, sector: null, description: null, logoId });
    expect(linked).toMatchObject({ ok: true, value: { logoId } });
    const { getClient } = await loadCaseStudy();
    const read = await getClient(clientId);
    if (!read.ok || read.value.logoUrl === null) throw new Error("no logo url");
    const fetched = await fetch(read.value.logoUrl);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/png");
    const jwt = new URL(read.value.logoUrl).searchParams.get("token") as string;
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(900);
  });

  it.each([
    ["a 300 px PNG", () => png(300, 900), "image/png"],
    ["bytes that are not the declared type", async () => Buffer.from("GIF89a not really"), "image/png"],
  ])("confirm refuses %s with CLIENT_LOGO_INVALID and writes no row", async (_label, make, contentType) => {
    const { requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const bytes = await make();
    const presigned = await requestClientLogoUpload({ clientId: acme.id, contentType, sizeBytes: bytes.byteLength });
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { logoId, url, method, headers } = presigned.value;
    expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);
    const before = await counts();
    expect(await confirmClientLogoUpload({ clientId: acme.id, logoId, contentType })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "CLIENT_LOGO_INVALID" },
    });
    expect(await counts()).toEqual(before);
  });

  it("confirming the same logo id twice is CLIENT_LOGO_INVALID; the first row stands", async () => {
    const { requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const bytes = await png(800, 400);
    const presigned = await requestClientLogoUpload({ clientId: acme.id, contentType: "image/png", sizeBytes: bytes.byteLength });
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { logoId, url, method, headers } = presigned.value;
    expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);
    expect(await confirmClientLogoUpload({ clientId: acme.id, logoId, contentType: "image/png" })).toEqual({ ok: true, value: { logoId } });
    const before = await counts();
    expect(await confirmClientLogoUpload({ clientId: acme.id, logoId, contentType: "image/png" })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "CLIENT_LOGO_INVALID" },
    });
    expect(await counts()).toEqual(before);
  });

  it("presign refuses SVG, GIF, PDF and a file over 5 MB with CLIENT_LOGO_INVALID", async () => {
    const { requestClientLogoUpload } = await loadClientActions();
    for (const declared of [
      { contentType: "image/svg+xml", sizeBytes: 10 },
      { contentType: "image/gif", sizeBytes: 10 },
      { contentType: "application/pdf", sizeBytes: 10 },
      { contentType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 },
    ]) {
      expect(await requestClientLogoUpload({ clientId: acme.id, ...declared })).toMatchObject({
        ok: false,
        status: 400,
        error: { code: "CLIENT_LOGO_INVALID" },
      });
    }
  });
});

describe("the 2.12 data migration (scratch database)", () => {
  const MIGRATIONS = join(fileURLToPath(new URL("../..", import.meta.url)), "supabase", "migrations");
  const PRIOR = [
    "20261009120000_access_profile.sql",
    "20261009140000_case_study.sql",
    "20261012120000_case_study_transition.sql",
  ];
  const STORY_2_12 = "20261015120000_case_study_clients_and_codes.sql";
  const read = (file: string) => readFileSync(join(MIGRATIONS, file), "utf8");

  /** The free-text cases a pre-2.12 environment may hold, soft-deleted and name-key duplicates included. */
  const LEGACY_CASES = `
    insert into public.case_study (id, name, client, year, created_by, created_at, updated_at, deleted_at) values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'Test Lumen', 'Lumen Srl', 2026, '${DEV_ACTOR_ID}', '2026-10-10T08:00:00Z', '2026-10-11T09:00:00Z', null),
      ('aaaaaaaa-0000-4000-8000-000000000002', 'Lumen deleted', ' lumen  srl ', 2026, '${DEV_ACTOR_ID}', '2026-10-12T08:00:00Z', '2026-10-13T09:00:00Z', '2026-10-13T09:00:00Z'),
      ('aaaaaaaa-0000-4000-8000-000000000003', 'Lumen 2025', 'LUMEN SRL', 2025, '${DEV_ACTOR_ID}', '2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z', null),
      ('aaaaaaaa-0000-4000-8000-000000000004', 'Lumina', 'Lumina S.p.A.', 2026, '${DEV_ACTOR_ID}', '2026-10-11T08:00:00Z', '2026-10-11T08:00:00Z', null),
      ('aaaaaaaa-0000-4000-8000-000000000005', 'Torino', 'Città di Torino', 2026, '${DEV_ACTOR_ID}', '2026-10-09T08:00:00Z', '2026-10-09T08:00:00Z', null),
      ('aaaaaaaa-0000-4000-8000-000000000006', 'Lumen tie', 'Lumen Srl', 2026, '${DEV_ACTOR_ID}', '2026-10-12T08:00:00Z', '2026-10-12T08:00:00Z', null);
  `;

  /** Creates a scratch database with the pre-2.12 schema plus `setup`, runs `body` against it, then drops it. */
  async function withScratchDb(setup: string, body: (db: pg.Client) => Promise<void>) {
    const name = `scratch_2_12_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`create database ${name}`);
    const url = new URL(env.SUPABASE_DB_URL);
    url.pathname = `/${name}`;
    const db = new pg.Client({ connectionString: url.toString() });
    try {
      await db.connect();
      await db.query("create schema extensions");
      for (const file of PRIOR) await db.query(read(file));
      await db.query(setup);
      await body(db);
    } finally {
      await db.end().catch(() => undefined);
      await pool.query(`drop database if exists ${name} with (force)`);
    }
  }

  it("gives every case (soft-deleted included) a client, number and code, one client per name key, and drops client", async () => {
    await withScratchDb(LEGACY_CASES, async (db) => {
      const before = (await db.query("select id, updated_at from public.case_study order by id")).rows;
      // One simple-protocol query: the whole file runs as one transaction.
      await db.query(read(STORY_2_12));

      const clients = (await db.query("select name, name_key, code, created_by from public.client order by code")).rows;
      expect(clients).toEqual([
        { name: "Città di Torino", name_key: "citta di torino", code: "CIT", created_by: DEV_ACTOR_ID },
        // Named with the earliest case's trimmed spelling; created before Lumina (earlier first case), so it gets LUM.
        { name: "Lumen Srl", name_key: "lumen srl", code: "LUM", created_by: DEV_ACTOR_ID },
        { name: "Lumina S.p.A.", name_key: "lumina s.p.a.", code: "LUMI", created_by: DEV_ACTOR_ID },
      ]);

      const cases = (
        await db.query(
          `select cs.name, c.code as client_code, cs.number, cs.code
             from public.case_study cs join public.client c on c.id = cs.client_id order by cs.code`,
        )
      ).rows;
      expect(cases).toEqual([
        { name: "Torino", client_code: "CIT", number: 1, code: "CIT-2026-01" },
        { name: "Lumen 2025", client_code: "LUM", number: 1, code: "LUM-2025-01" },
        { name: "Test Lumen", client_code: "LUM", number: 1, code: "LUM-2026-01" },
        // Same created_at: the id breaks the tie.
        { name: "Lumen deleted", client_code: "LUM", number: 2, code: "LUM-2026-02" },
        { name: "Lumen tie", client_code: "LUM", number: 3, code: "LUM-2026-03" },
        { name: "Lumina", client_code: "LUMI", number: 1, code: "LUMI-2026-01" },
      ]);

      const counters = (
        await db.query(
          `select c.code, n.year, n.last_number from public.case_number_counter n
             join public.client c on c.id = n.client_id order by c.code, n.year`,
        )
      ).rows;
      expect(counters).toEqual([
        { code: "CIT", year: 2026, last_number: 1 },
        { code: "LUM", year: 2025, last_number: 1 },
        { code: "LUM", year: 2026, last_number: 3 },
        { code: "LUMI", year: 2026, last_number: 1 },
      ]);

      expect((await db.query("select id, updated_at from public.case_study order by id")).rows).toEqual(before);
      expect(
        (await db.query("select 1 from information_schema.columns where table_name = 'case_study' and column_name = 'client'")).rows,
      ).toEqual([]);

      // The next case continues the backfilled numbering.
      const lum = (await db.query("select id from public.client where code = 'LUM'")).rows[0].id;
      const next = await db.query("select code from public.create_case_study('Nuovo', $1, 2026, 'it', $2)", [lum, DEV_ACTOR_ID]);
      expect(next.rows).toEqual([{ code: "LUM-2026-04" }]);
    });
  });

  it("aborts with nothing applied when a case would be left without a client or code", async () => {
    // A stand-in for a backfill bug: a trigger that clears client_id on one case.
    const sabotage = `${LEGACY_CASES}
      create function public.sabotage() returns trigger language plpgsql as $$
      begin new.client_id := null; return new; end $$;
      create trigger sabotage before update on public.case_study
        for each row when (new.name = 'Torino') execute function public.sabotage();`;
    await withScratchDb(sabotage, async (db) => {
      await expect(db.query(read(STORY_2_12))).rejects.toThrow(/backfill incomplete: 1 case/);
      expect((await db.query("select to_regclass('public.client') as t, to_regclass('public.case_number_counter') as c")).rows).toEqual([
        { t: null, c: null },
      ]);
      expect(
        (await db.query("select 1 from information_schema.columns where table_name = 'case_study' and column_name = 'client'")).rows,
      ).toHaveLength(1);
    });
  });
});
