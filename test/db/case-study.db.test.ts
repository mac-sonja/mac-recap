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
import { CASE_DELETED } from "@/modules/case-study/domain/case-event";
import { CLIENT_INDUSTRIES, LOCALES, YEAR_MAX, YEAR_MIN } from "@/modules/case-study/domain/case-study";
import { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";
import {
  TEST_DESCRIPTION,
  TEST_INDUSTRIES,
  addTestLogo,
  createTestClient,
  freshPrefix,
  nameWithLetters,
  type TestClient,
} from "../helpers/db-clients";

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
  const { rows } = await pool.query<{
    cases: number;
    events: number;
    clients: number;
    logos: number;
    briefs: number;
    assets: number;
    counters: number;
    numbers: number;
  }>(
    `select (select count(*)::int from public.case_study) as cases,
            (select count(*)::int from public.case_event) as events,
            (select count(*)::int from public.client) as clients,
            (select count(*)::int from public.client_logo) as logos,
            (select count(*)::int from public.client_brief) as briefs,
            (select count(*)::int from public.client_asset) as assets,
            (select count(*)::int from public.case_number_counter) as counters,
            (select coalesce(sum(last_number), 0)::int from public.case_number_counter) as numbers`,
  );
  return rows[0];
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

    expect(await summaryOf(client.id)).toEqual({ ...client, caseCount: 2, complete: false });
    expect(await summaryOf(onlyDeleted.id)).toEqual({ ...onlyDeleted, caseCount: 0, complete: false });
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
    const added = await createClient({ name: `  ${name} `, industries: ["lusso"], description: "Brand." });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    expect(added.value).toMatchObject({ name, industries: ["lusso"], description: "Brand.", logoId: null });
    const created = await createCase({ name: "Rename keeps codes", clientId: added.value.id });
    const logoId = await addTestLogo(pool, added.value.id, DEV_ACTOR_ID);

    const before = await counts();
    const duplicate = await createClient({ name: name.toUpperCase().replace(" ", "  "), industries: ["lusso"], description: "Brand." });
    expect(duplicate).toEqual({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: expect.any(String) } });
    expect(await counts()).toEqual(before);

    const edit = (over: Record<string, unknown>) =>
      updateClient({ clientId: added.value.id, industries: ["lusso"], description: "Brand.", logoId, ...over });
    const renamed = await edit({ name: `${name} S.r.l.` });
    expect(renamed).toEqual({
      ok: true,
      value: { id: added.value.id, name: `${name} S.r.l.`, code: added.value.code, industries: ["lusso"], description: "Brand.", logoId },
    });
    const { get } = await loadCaseStudy();
    const reread = await get(created.id);
    expect(reread.ok && reread.value).toMatchObject({ code: created.code, client: { name: `${name} S.r.l.`, code: added.value.code } });

    // Its own name, and a case/space variant of it, are not "taken": saved as typed, code unchanged.
    for (const own of [`${name} S.r.l.`, `${name.toLowerCase().replace(" ", "  ")} s.r.l.`]) {
      const same = await edit({ name: own });
      expect(same).toMatchObject({ ok: true, value: { id: added.value.id, name: own.replace(/\s+/g, " "), code: added.value.code } });
    }

    const unknown = await updateClient({ clientId: UNKNOWN_ID, name: "Nobody", industries: ["lusso"], description: "Brand.", logoId });
    expect(unknown).toMatchObject({ ok: false, status: 404, error: { code: "CLIENT_NOT_FOUND" } });
  });

  it("returns 403 FORBIDDEN for a role that cannot manage clients on every client action, and writes nothing", async () => {
    const {
      createClient,
      updateClient,
      saveClientBriefField,
      requestClientLogoUpload,
      confirmClientLogoUpload,
      requestClientMaterialUpload,
      confirmClientMaterialUpload,
      listClientMaterial,
      removeClientMaterial,
    } = await loadClientActions();
    for (const role of ["account_sales_social", "admin"]) {
      await pool.query("update public.profile set role = $2 where id = $1", [DEV_ACTOR_ID, role]);
      try {
        const before = await counts();
        const forbidden = { ok: false, status: 403, error: { code: "FORBIDDEN", message: expect.any(String) } };
        expect(await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["lusso"], description: "Brand." })).toEqual(
          forbidden,
        );
        expect(
          await updateClient({ clientId: acme.id, name: "Intruder", industries: ["lusso"], description: "Brand.", logoId: randomUUID() }),
        ).toEqual(forbidden);
        expect(await saveClientBriefField({ clientId: acme.id, field: "context", text: "Intruder" })).toEqual(forbidden);
        expect(await requestClientLogoUpload({ clientId: acme.id, contentType: "image/png", sizeBytes: 10 })).toEqual(forbidden);
        expect(await confirmClientLogoUpload({ clientId: acme.id, logoId: randomUUID(), contentType: "image/png" })).toEqual(forbidden);
        expect(await requestClientMaterialUpload({ clientId: acme.id, contentType: "image/jpeg", sizeBytes: 10 })).toEqual(forbidden);
        expect(await confirmClientMaterialUpload({ clientId: acme.id, assetId: randomUUID(), contentType: "image/jpeg", fileName: "a.jpg" })).toEqual(
          forbidden,
        );
        expect(await listClientMaterial({ clientId: acme.id })).toEqual(forbidden);
        expect(await removeClientMaterial({ clientId: acme.id, assetId: randomUUID() })).toEqual(forbidden);
        expect(await counts()).toEqual(before);
        const { rows } = await pool.query("select name, industries, description, logo_id from public.client where id = $1", [acme.id]);
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
  it.each(["case_study", "case_event", "client", "client_brief", "case_number_counter"])("enables RLS with no policies on %s", async (table) => {
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

  it.each(["case_study", "case_event", "client", "client_logo", "client_brief", "client_asset", "case_number_counter"])("the browser key is refused reading %s", async (table) => {
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

  type Table = "case_study" | "case_event" | "client" | "client_logo" | "client_brief" | "client_asset" | "case_number_counter";
  const INSERTS: Record<Table, string> = {
    case_study: `insert into public.case_study (name, client_id, number, code, year, created_by) values ('I', '${UNKNOWN_ID}', 1, 'I', 2026, '${DEV_ACTOR_ID}')`,
    case_event: `insert into public.case_event (case_id, actor_id, type) values ('${UNKNOWN_ID}', '${DEV_ACTOR_ID}', 'x')`,
    client: `insert into public.client (name, name_key, code, created_by) values ('I', 'i', 'III', '${DEV_ACTOR_ID}')`,
    client_logo: `insert into public.client_logo (client_id, path, mime_type, size_bytes, created_by) values ('${UNKNOWN_ID}', 'p', 'image/png', 1, '${DEV_ACTOR_ID}')`,
    client_brief: `insert into public.client_brief (client_id, updated_by) values ('${UNKNOWN_ID}', '${DEV_ACTOR_ID}')`,
    client_asset: `insert into public.client_asset (client_id, position, path, file_name, mime_type, size_bytes, created_by) values ('${UNKNOWN_ID}', 1, 'p', 'f', 'application/pdf', 1, '${DEV_ACTOR_ID}')`,
    case_number_counter: `insert into public.case_number_counter (client_id, year, last_number) values ('${UNKNOWN_ID}', 2026, 1)`,
  };
  const UPDATES: Record<Table, string> = {
    case_study: "name = 'x'",
    case_event: "type = 'x'",
    client: "name = 'x'",
    client_logo: "path = 'x'",
    client_brief: "context = 'x'",
    client_asset: "path = 'x'",
    case_number_counter: "last_number = 1",
  };
  const statements = (table: Table) => ({
    select: `select * from public.${table}`,
    insert: INSERTS[table],
    update: `update public.${table} set ${UPDATES[table]}`,
    delete: `delete from public.${table}`,
  });
  const cases = (["anon", "authenticated"] as const).flatMap((role) =>
    (["case_study", "case_event", "client", "client_logo", "client_brief", "client_asset", "case_number_counter"] as const).flatMap((table) =>
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
    `public.save_client_brief_field('${UNKNOWN_ID}', 'context', 'x', '${DEV_ACTOR_ID}')`,
    "public.client_info_text(' x ')",
    `public.delete_client_logo('${UNKNOWN_ID}')`,
    `public.insert_client_asset('${UNKNOWN_ID}', '${UNKNOWN_ID}', 'p', 'f', 'application/pdf', 1, null, null, '${DEV_ACTOR_ID}')`,
    `public.delete_client_asset('${UNKNOWN_ID}')`,
    `public.delete_client('${UNKNOWN_ID}', 'x', '${DEV_ACTOR_ID}')`,
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

  it("the old create_client, update_client and rename_client signatures are gone", async () => {
    await expect(inRolledBackTx(`select public.create_client('I', '${DEV_ACTOR_ID}'::uuid)`)).rejects.toMatchObject({ code: "42883" });
    await expect(
      inRolledBackTx(`select public.create_client('I', 'Moda'::text, 'D'::text, '${DEV_ACTOR_ID}'::uuid)`),
    ).rejects.toMatchObject({ code: "42883" });
    await expect(
      inRolledBackTx(`select public.update_client('${UNKNOWN_ID}'::uuid, 'I', 'Moda'::text, 'D'::text, null::uuid, '${DEV_ACTOR_ID}'::uuid)`),
    ).rejects.toMatchObject({ code: "42883" });
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

  const createClientSql = "select id, name, code from public.create_client($1, array['lusso'], 'Cliente di prova.', $2)";
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
        const logoId = await addTestLogo(client, created.id, DEV_ACTOR_ID);
        const { rows } = await client.query("select name, name_key from public.update_client($1, $2, $3, $4, $5, $6)", [
          created.id,
          "  Lumen\t\tGroup \n",
          TEST_INDUSTRIES,
          TEST_DESCRIPTION,
          logoId,
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
      const logoId = await addTestLogo(pool, client.id, DEV_ACTOR_ID);
      const { rows } = await pool.query("select name, code from public.update_client($1, $2, $3, $4, $5, $6)", [
        client.id,
        renamed,
        TEST_INDUSTRIES,
        TEST_DESCRIPTION,
        logoId,
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

  it("keeps description and logo_id nullable (legacy dev clients); a new client starts without a logo", async () => {
    const { rows: columns } = await pool.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'client' and column_name in ('description', 'logo_id')
        order by column_name`,
    );
    expect(columns).toEqual([
      { column_name: "description", is_nullable: "YES" },
      { column_name: "logo_id", is_nullable: "YES" },
    ]);
    const { rows } = await pool.query("select description, logo_id from public.client where id = $1", [acme.id]);
    expect(rows).toEqual([{ description: TEST_DESCRIPTION, logo_id: null }]);
  });

  it("creates client_logo with the AD-22 columns", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'client_logo' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["client_id", "created_at", "created_by", "id", "mime_type", "path", "size_bytes"]);
  });

  it.each([["description", 400]])("accepts a %s of %i characters (emoji = 1) and refuses one more", async (column, max) => {
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

  it("create_client and update_client store trimmed info", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await insertLogo(client.id);
    const { rows } = await inRolledBackTx(
      "select industries, description from public.update_client($1, $2, $3, $4, $5, $6)",
      [client.id, client.name, ["energia", "lusso"], "\n Brand di moda.  ", logoId, DEV_ACTOR_ID],
    );
    expect(rows).toEqual([{ industries: ["energia", "lusso"], description: "Brand di moda." }]);
  });

  it("through the action: saves the info, refuses 401 characters with CLIENT_FIELD_TOO_LONG and writes nothing", async () => {
    const { createClient, updateClient } = await loadClientActions();
    const before = await counts();
    const tooLong = await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["lusso"], description: "x".repeat(401) });
    expect(tooLong).toEqual({
      ok: false,
      status: 400,
      error: { code: "CLIENT_FIELD_TOO_LONG", message: expect.any(String), fields: ["description"] },
    });
    expect(await counts()).toEqual(before);

    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["lusso"], description: "😀".repeat(400) });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    expect(added.value).toMatchObject({ industries: ["lusso"], description: "😀".repeat(400), logoId: null });

    const logoId = await insertLogo(added.value.id);
    const descriptionTooLong = await updateClient({
      clientId: added.value.id,
      name: added.value.name,
      industries: ["lusso"],
      description: "d".repeat(401),
      logoId,
    });
    expect(descriptionTooLong).toMatchObject({ ok: false, status: 400, error: { code: "CLIENT_FIELD_TOO_LONG", fields: ["description"] } });
    const { rows } = await pool.query("select description, logo_id from public.client where id = $1", [added.value.id]);
    expect(rows).toEqual([{ description: "😀".repeat(400), logo_id: null }]);
  });

  it("client_logo accepts image/svg+xml (20261019160000) alongside PNG, JPEG and WebP", async () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      const { rowCount } = await inRolledBackTx(
        "insert into public.client_logo (client_id, path, mime_type, size_bytes, created_by) values ($1, $2, $3, 2048, $4)",
        [acme.id, `clients/${acme.id}/logos/${randomUUID()}.x`, mime, DEV_ACTOR_ID],
      );
      expect(rowCount, mime).toBe(1);
    }
  });

  it("the material bucket allows image/svg+xml for the signed logo PUT", async () => {
    const { rows } = await pool.query<{ types: string[] }>("select allowed_mime_types as types from storage.buckets where id = 'material'");
    expect(rows).toHaveLength(1);
    expect(rows[0].types).toContain("image/svg+xml");
    expect(rows[0].types.filter((t) => t === "image/svg+xml")).toHaveLength(1);
  });

  it.each([
    ["mime_type", "image/gif", 2048],
    ["mime_type", "image/svg", 2048],
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
    await pool.query("select public.update_client($1, $2, $3, $4, $5, $6)", [
      client.id,
      client.name,
      TEST_INDUSTRIES,
      TEST_DESCRIPTION,
      second,
      DEV_ACTOR_ID,
    ]);

    await expect(pool.query("select public.delete_client_logo($1)", [second])).rejects.toMatchObject({
      code: "P0001",
      message: "CLIENT_LOGO_IN_USE",
    });
    expect((await pool.query("select count(*)::int as n from public.client_logo where id = $1", [second])).rows[0].n).toBe(1);

    expect((await pool.query("select public.delete_client_logo($1) as deleted", [first])).rows).toEqual([{ deleted: true }]);
    expect((await pool.query("select public.delete_client_logo($1) as deleted", [first])).rows).toEqual([{ deleted: false }]);
    expect((await pool.query("select count(*)::int as n from public.client_logo where id = $1", [first])).rows[0].n).toBe(0);
  });

  it("through the action, replacing a logo deletes the old row and object; it can't be cleared", async () => {
    const { createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["lusso"], description: "Brand." });
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
    const link = (logoId: string | null) =>
      updateClient({ clientId, name: added.value.name, industries: ["lusso"], description: "Brand.", logoId });
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

    expect(await link(null)).toMatchObject({ ok: false, status: 400, error: { code: "CLIENT_FIELD_INVALID", fields: ["logoId"] } });
    expect(await rows()).toEqual([second]);
    expect(await objects()).toEqual([`${second}.png`]);
  });

  it.each([
    ["another client's logo", true],
    ["an unknown logo", false],
  ])("update_client refuses %s with CLIENT_LOGO_INVALID; nothing written", async (_label, foreign) => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const other = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = foreign ? await insertLogo(other.id) : randomUUID();
    await expect(
      pool.query("select public.update_client($1, 'Renamed too', $2, 'Brand.', $3, $4)", [client.id, ["energia"], logoId, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "CLIENT_LOGO_INVALID" });
    const { rows } = await pool.query("select name, industries, logo_id from public.client where id = $1", [client.id]);
    expect(rows).toEqual([{ name: client.name, industries: TEST_INDUSTRIES, logo_id: null }]);
  });

  it("getClientInfoForCase returns the client's current values and brief; a deleted or unknown case is NOT_FOUND", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await insertLogo(client.id);
    const created = await createCase({ clientId: client.id });
    const { getClientInfoForCase } = await loadCaseStudy();
    // No brief row yet: the empty brief.
    expect(await getClientInfoForCase(created.id)).toMatchObject({ ok: true, value: { brief: { context: "", solution: "", results: "" } } });
    await pool.query("select public.update_client($1, $2, $3, 'Brand.', $4, $5)", [client.id, client.name, ["energia", "lusso"], logoId, DEV_ACTOR_ID]);
    await pool.query("select public.save_client_brief_field($1, 'results', 'Più clienti.', $2)", [client.id, DEV_ACTOR_ID]);
    // Read live: the edit shows at once.
    expect(await getClientInfoForCase(created.id)).toEqual({
      ok: true,
      value: {
        clientId: client.id,
        name: client.name,
        industries: ["energia", "lusso"],
        description: "Brand.",
        logoId,
        brief: { context: "", solution: "", results: "Più clienti." },
      },
    });
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    expect(await getClientInfoForCase(created.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getClientInfoForCase(UNKNOWN_ID)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("round trip: presign → PUT under clients/{clientId}/logos/ → confirm → link → signed GET on the client page", async () => {
    const { createClient, updateClient, requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["lusso"], description: "Brand." });
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

    const linked = await updateClient({ clientId, name: added.value.name, industries: ["lusso"], description: "Brand.", logoId });
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

  it("round trip: a clean 10 px SVG is presigned, PUT as .svg, confirmed with no pixel rule and served as image/svg+xml", async () => {
    const { requestClientLogoUpload, confirmClientLogoUpload } = await loadClientActions();
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
    const presigned = await requestClientLogoUpload({ clientId: acme.id, contentType: "image/svg+xml", sizeBytes: bytes.byteLength });
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { logoId, url, method, headers } = presigned.value;
    expect(new URL(url).pathname).toContain(`/object/upload/sign/material/clients/${acme.id}/logos/${logoId}.svg`);
    expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);
    expect(await confirmClientLogoUpload({ clientId: acme.id, logoId, contentType: "image/svg+xml" })).toEqual({ ok: true, value: { logoId } });
    const { rows } = await pool.query("select mime_type, size_bytes::int as size from public.client_logo where id = $1", [logoId]);
    expect(rows).toEqual([{ mime_type: "image/svg+xml", size: bytes.byteLength }]);
  });

  it.each([
    ["an SVG with a script", async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml"],
    ["an SVG with an external link", async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'), "image/svg+xml"],
    ["PNG bytes declared as SVG", () => png(800, 400), "image/svg+xml"],
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

  it("presign refuses GIF, PDF, a file over 5 MB and a 6 MB SVG with CLIENT_LOGO_INVALID", async () => {
    const { requestClientLogoUpload } = await loadClientActions();
    for (const declared of [
      { contentType: "image/svg+xml", sizeBytes: 6 * 1024 * 1024 },
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

describe("client wizard (Story 2.15)", () => {
  const save = (clientId: string, field: string, text: string, db: pg.Pool | pg.PoolClient = pool) =>
    db.query<{ previous: string }>("select public.save_client_brief_field($1, $2, $3, $4) as previous", [clientId, field, text, DEV_ACTOR_ID]);

  it("replaces sector with industries (text array, not null, default empty)", async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'client' and column_name in ('sector', 'industries')`,
    );
    expect(rows).toEqual([{ column_name: "industries", data_type: "ARRAY", is_nullable: "NO", column_default: "'{}'::text[]" }]);
  });

  it("checks industries against exactly CLIENT_INDUSTRIES, with at least one", async () => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where conrelid = 'public.client'::regclass and conname = 'client_industries_check'`,
    );
    expect(rows).toHaveLength(1);
    expect([...rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((v) => v !== "{}")).toEqual([...CLIENT_INDUSTRIES]);
    expect(rows[0].def).toContain("NOT VALID");
  });

  it.each([
    ["an unknown industry", ["moda"]],
    ["no industry", []],
    ["a null element", [null]],
  ])("create_client refuses %s with the industries check; nothing written", async (_label, industries) => {
    const before = await counts();
    await expect(
      pool.query("select public.create_client($1, $2, 'Brand.', $3)", [nameWithLetters(await freshPrefix(pool)), industries, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("client_industries_check") });
    expect(await counts()).toEqual(before);
  });

  it("create_client refuses a blank description with P0001 CLIENT_FIELD_INVALID naming it", async () => {
    await expect(
      pool.query("select public.create_client($1, $2, '  ', $3)", [nameWithLetters(await freshPrefix(pool)), ["lusso"], DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "CLIENT_FIELD_INVALID", detail: "description" });
  });

  it("update_client refuses an unknown industry, a blank description and a null logo; nothing written", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await addTestLogo(pool, client.id, DEV_ACTOR_ID);
    const sql = "select public.update_client($1, $2, $3, $4, $5, $6)";
    await expect(pool.query(sql, [client.id, client.name, ["moda"], "Brand.", logoId, DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "23514",
    });
    await expect(pool.query(sql, [client.id, client.name, ["lusso"], "", logoId, DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "P0001",
      message: "CLIENT_FIELD_INVALID",
      detail: "description",
    });
    await expect(pool.query(sql, [client.id, client.name, ["lusso"], "Brand.", null, DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "P0001",
      message: "CLIENT_FIELD_INVALID",
      detail: "logoId",
    });
    const { rows } = await pool.query("select industries, description, logo_id from public.client where id = $1", [client.id]);
    expect(rows).toEqual([{ industries: TEST_INDUSTRIES, description: TEST_DESCRIPTION, logo_id: null }]);
  });

  it("keeps a legacy client with no industries readable, and the wizard's save then fills them", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await addTestLogo(pool, client.id, DEV_ACTOR_ID);
    const db = await pool.connect();
    try {
      await db.query("begin");
      // A 2.14 dev client: no industries, no description. Recreating the check NOT VALID
      // around the write mirrors the migration, which left such rows in place.
      const { rows: [{ def }] } = await db.query<{ def: string }>(
        "select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint where conname = 'client_industries_check'",
      );
      await db.query("alter table public.client drop constraint client_industries_check");
      await db.query("update public.client set industries = '{}', description = null where id = $1", [client.id]);
      await db.query(`alter table public.client add constraint client_industries_check ${def.replace(/ NOT VALID$/, "")} not valid`);
      const legacy = await db.query("select industries, description from public.client where id = $1", [client.id]);
      expect(legacy.rows).toEqual([{ industries: [], description: null }]);
      // Any other write to the row is checked.
      await db.query("savepoint touch");
      await expect(db.query("update public.client set name = name where id = $1", [client.id])).rejects.toMatchObject({ code: "23514" });
      await db.query("rollback to savepoint touch");
      const saved = await db.query("select industries from public.update_client($1, $2, $3, 'Brand.', $4, $5)", [
        client.id,
        client.name,
        ["risorse_umane"],
        logoId,
        DEV_ACTOR_ID,
      ]);
      expect(saved.rows).toEqual([{ industries: ["risorse_umane"] }]);
    } finally {
      await db.query("rollback").catch(() => undefined);
      db.release();
    }
  });

  it("creates client_brief with one row per client, RLS on and the 5000-character checks", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'client_brief' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["client_id", "context", "results", "solution", "updated_at", "updated_by"]);
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    for (const field of ["context", "solution", "results"]) {
      const at = await inRolledBackTx(
        `insert into public.client_brief (client_id, ${field}, updated_by) values ($1, $2, $3) returning char_length(${field}) as n`,
        [client.id, ` ${"😀".repeat(5000)} `, DEV_ACTOR_ID],
      );
      expect(at.rows).toEqual([{ n: 5002 }]);
      await expect(
        inRolledBackTx(`insert into public.client_brief (client_id, ${field}, updated_by) values ($1, $2, $3)`, [
          client.id,
          "x".repeat(5001),
          DEV_ACTOR_ID,
        ]),
      ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining(`client_brief_${field}_check`) });
    }
  });

  it("save_client_brief_field creates the row on the first change, updates one field, and returns the previous text", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    expect((await save(client.id, "context", "")).rows).toEqual([{ previous: "" }]);
    expect((await pool.query("select count(*)::int as n from public.client_brief where client_id = $1", [client.id])).rows[0].n).toBe(0);
    expect((await save(client.id, "context", "Primo.")).rows).toEqual([{ previous: "" }]);
    expect((await save(client.id, "results", "Esiti.")).rows).toEqual([{ previous: "" }]);
    const { rows: [first] } = await pool.query("select updated_at from public.client_brief where client_id = $1", [client.id]);
    // Saving the stored text again writes nothing.
    expect((await save(client.id, "context", "Primo.")).rows).toEqual([{ previous: "Primo." }]);
    const { rows } = await pool.query("select context, solution, results, updated_by, updated_at from public.client_brief where client_id = $1", [
      client.id,
    ]);
    expect(rows).toEqual([{ context: "Primo.", solution: "", results: "Esiti.", updated_by: DEV_ACTOR_ID, updated_at: first.updated_at }]);
  });

  it("save_client_brief_field refuses an unknown client, an unknown field and an over-long text; nothing written", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const before = await counts();
    await expect(save(UNKNOWN_ID, "context", "x")).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NOT_FOUND" });
    await expect(save(client.id, "sector", "x")).rejects.toMatchObject({ code: "P0001", message: "UNKNOWN_FIELD" });
    await expect(save(client.id, "solution", "x".repeat(5001))).rejects.toMatchObject({ code: "23514" });
    expect(await counts()).toEqual(before);
  });

  it("through the actions: CLIENT_FIELD_INVALID and CLIENT_FIELD_TOO_LONG write nothing; a full client lists as complete", async () => {
    const { createClient, updateClient, saveClientBriefField } = await loadClientActions();
    const { listClientSummaries, getClient } = await loadCaseStudy();
    const before = await counts();
    expect(await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["moda"], description: "Brand." })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "CLIENT_FIELD_INVALID", fields: ["industries"] },
    });
    expect(await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: [], description: "Brand." })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "CLIENT_FIELD_INVALID" },
    });
    expect(await counts()).toEqual(before);

    const added = await createClient({ name: nameWithLetters(await freshPrefix(pool)), industries: ["lusso", "energia"], description: "Brand." });
    if (!added.ok) throw new Error(`createClient failed: ${added.error.code}`);
    expect(added.value.industries).toEqual(["energia", "lusso"]);
    const clientId = added.value.id;
    const summary = async () => {
      const listed = await listClientSummaries();
      if (!listed.ok) throw new Error("listClientSummaries failed");
      return listed.value.find((c) => c.id === clientId);
    };
    expect(await summary()).toMatchObject({ complete: false });

    expect(await saveClientBriefField({ clientId, field: "context", text: "x".repeat(5001) })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "CLIENT_FIELD_TOO_LONG", fields: ["context"] },
    });
    for (const field of ["context", "solution", "results"]) {
      expect(await saveClientBriefField({ clientId, field, text: `${field}.` })).toEqual({ ok: true, value: { field, text: `${field}.` } });
    }
    expect(await summary()).toMatchObject({ complete: false });
    const logoId = await addTestLogo(pool, clientId, DEV_ACTOR_ID);
    expect(await updateClient({ clientId, name: added.value.name, industries: ["energia", "lusso"], description: "Brand.", logoId })).toMatchObject({
      ok: true,
    });
    expect(await summary()).toMatchObject({ complete: true });
    const read = await getClient(clientId);
    expect(read.ok && read.value.brief).toEqual({ context: "context.", solution: "solution.", results: "results." });
  });
});

describe("client material (Story 2.16)", () => {
  const jpeg = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
  const insert = (clientId: string, over: { id?: string; mime?: string; width?: number | null; height?: number | null } = {}, db: pg.Pool | pg.PoolClient = pool) => {
    const id = over.id ?? randomUUID();
    const mime = over.mime ?? "image/jpeg";
    const image = mime.startsWith("image/");
    return db.query<{ id: string; position: number }>(
      "select id, position from public.insert_client_asset($1, $2, $3, ' foto.jpg ', $4, 2048, $5, $6, $7)",
      [id, clientId, `clients/${clientId}/material/${id}.x`, mime, over.width === undefined ? (image ? 2400 : null) : over.width, over.height === undefined ? (image ? 1600 : null) : over.height, DEV_ACTOR_ID],
    );
  };
  const positions = async (clientId: string) =>
    (await pool.query<{ position: number }>("select position from public.client_asset where client_id = $1 order by position", [clientId])).rows.map(
      (r) => r.position,
    );

  it("creates client_asset with the 2.16 columns, RLS on and an index on client_id", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'client_asset' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      "client_id",
      "created_at",
      "created_by",
      "file_name",
      "height",
      "id",
      "mime_type",
      "path",
      "position",
      "size_bytes",
      "width",
    ]);
    const rls = await pool.query("select relrowsecurity from pg_class where oid = 'public.client_asset'::regclass");
    expect(rls.rows).toEqual([{ relrowsecurity: true }]);
    const index = await pool.query("select 1 from pg_indexes where schemaname = 'public' and indexname = 'client_asset_client_id_idx'");
    expect(index.rows).toHaveLength(1);
  });

  it.each([
    ["position 0", "position = 0"],
    ["position 4", "position = 4"],
    ["a GIF", "mime_type = 'image/gif'"],
    ["0 bytes", "size_bytes = 0"],
    ["50 MB + 1", "size_bytes = 52428801"],
    ["a blank path", "path = '  '"],
    ["a blank file name", "file_name = ''"],
    ["an untrimmed file name", "file_name = ' a.jpg'"],
    ["a file name over 255 characters", "file_name = repeat('x', 256)"],
    ["a side over 8000 px", "width = 8001"],
    ["an image without pixels", "width = null, height = null"],
    ["one side only", "height = null"],
  ])("checks refuse %s", async (_label, set) => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const { rows } = await insert(client.id);
    await expect(inRolledBackTx(`update public.client_asset set ${set} where id = $1`, [rows[0].id])).rejects.toMatchObject({ code: "23514" });
  });

  it("checks refuse pixels on a non-image and accept every case material type", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await expect(insert(client.id, { mime: "application/pdf", width: 10, height: 10 })).rejects.toMatchObject({ code: "23514" });
    for (const mime of ["video/mp4", "video/quicktime", "application/pdf", "text/plain", "text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
      const other = await createTestClient(pool, DEV_ACTOR_ID);
      expect((await insert(other.id, { mime })).rows[0].position).toBe(1);
    }
  });

  it("insert_client_asset takes the lowest free position and refuses a 4th with CLIENT_MATERIAL_LIMIT; nothing written", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const first = (await insert(client.id)).rows[0];
    expect(first.position).toBe(1);
    // The name is stored trimmed.
    expect((await pool.query("select file_name from public.client_asset where id = $1", [first.id])).rows).toEqual([{ file_name: "foto.jpg" }]);
    expect((await insert(client.id, { mime: "application/pdf" })).rows[0].position).toBe(2);
    expect((await insert(client.id)).rows[0].position).toBe(3);
    const before = await counts();
    await expect(insert(client.id)).rejects.toMatchObject({ code: "P0001", message: "CLIENT_MATERIAL_LIMIT" });
    expect(await counts()).toEqual(before);
    // A freed position is taken again.
    expect((await pool.query("select public.delete_client_asset($1) as deleted", [first.id])).rows).toEqual([{ deleted: true }]);
    expect(await positions(client.id)).toEqual([2, 3]);
    expect((await insert(client.id)).rows[0].position).toBe(1);
  });

  it("insert_client_asset refuses an unknown client and an id confirmed twice", async () => {
    await expect(insert(UNKNOWN_ID)).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NOT_FOUND" });
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const id = randomUUID();
    await insert(client.id, { id });
    await expect(insert(client.id, { id })).rejects.toMatchObject({ code: "P0001", message: "ASSET_ALREADY_CONFIRMED" });
    expect(await positions(client.id)).toEqual([1]);
  });

  it("keeps (client_id, position) unique", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await insert(client.id);
    await expect(
      inRolledBackTx(
        "insert into public.client_asset (client_id, position, path, file_name, mime_type, size_bytes, created_by) values ($1, 1, 'dup', 'f', 'application/pdf', 1, $2)",
        [client.id, DEV_ACTOR_ID],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("gives four parallel confirms positions 1–3 and refuses exactly one", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const parallel = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 4 });
    try {
      const results = await Promise.allSettled([0, 1, 2, 3].map(() => insert(client.id, {}, parallel)));
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(await positions(client.id)).toEqual([1, 2, 3]);
    } finally {
      await parallel.end();
    }
  });

  it("delete_client_asset answers false for an unknown id", async () => {
    expect((await pool.query("select public.delete_client_asset($1) as deleted", [UNKNOWN_ID])).rows).toEqual([{ deleted: false }]);
  });

  it("grants the functions to service_role only", async () => {
    for (const fn of ["public.insert_client_asset(uuid, uuid, text, text, text, bigint, integer, integer, uuid)", "public.delete_client_asset(uuid)"]) {
      const { rows } = await pool.query(
        `select has_function_privilege('service_role', $1, 'execute') as service,
                has_function_privilege('anon', $1, 'execute') as anon,
                has_function_privilege('authenticated', $1, 'execute') as authenticated`,
        [fn],
      );
      expect(rows).toEqual([{ service: true, anon: false, authenticated: false }]);
    }
  });

  it("round trip through the actions: two images and a PDF, the button rule, a 4th file, removal and the listing", async () => {
    const { requestClientMaterialUpload, confirmClientMaterialUpload, listClientMaterial, removeClientMaterial } = await loadClientActions();
    const { getClient } = await loadCaseStudy();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const clientId = client.id;
    const upload = async (bytes: Buffer, contentType: string, fileName = "foto.jpg") => {
      const presigned = await requestClientMaterialUpload({ clientId, contentType, sizeBytes: bytes.byteLength });
      if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
      const { assetId, url, method, headers } = presigned.value;
      expect(new URL(url).pathname).toContain(`/object/upload/sign/material/clients/${clientId}/material/${assetId}.`);
      expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);
      return { assetId, confirmed: await confirmClientMaterialUpload({ clientId, assetId, contentType, fileName }) };
    };
    const objects = async () => {
      const { data } = await createSupabaseAdmin().storage.from("material").list(`clients/${clientId}/material`);
      return (data ?? []).map((o) => o.name).sort();
    };

    const a = await upload(await jpeg(2400, 1600), "image/jpeg", " Vetrina.jpg ");
    expect(a.confirmed).toMatchObject({ ok: true, value: { id: a.assetId, position: 1, fileName: "Vetrina.jpg", kind: "image", width: 2400, height: 1600 } });
    const doc = await upload(Buffer.from("%PDF-1.7\n"), "application/pdf", "brief.pdf");
    expect(doc.confirmed).toMatchObject({ ok: true, value: { position: 2, kind: "document", width: null, height: null } });
    const b = await upload(await jpeg(1600, 3000), "image/jpeg");
    expect(b.confirmed).toMatchObject({ ok: true, value: { position: 3 } });

    // The client page's read carries no files; the wizard lists them.
    const read = await getClient(clientId);
    expect(read.ok && "assets" in read.value).toBe(false);
    const files = await listClientMaterial({ clientId });
    if (!files.ok) throw new Error("listClientMaterial failed");
    expect(files.value.map((x) => [x.position, x.kind, x.fileName])).toEqual([
      [1, "image", "Vetrina.jpg"],
      [2, "document", "brief.pdf"],
      [3, "image", "foto.jpg"],
    ]);
    const thumbnail = files.value[0].thumbnailUrl as string;
    expect((await fetch(thumbnail)).status).toBe(200);
    const jwt = new URL(thumbnail).searchParams.get("token") as string;
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(900);
    expect(files.value[1].thumbnailUrl).toBeNull();

    const before = await counts();
    expect(await requestClientMaterialUpload({ clientId, contentType: "image/jpeg", sizeBytes: 10 })).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "CLIENT_MATERIAL_LIMIT" },
    });
    expect(await counts()).toEqual(before);

    expect(await removeClientMaterial({ clientId, assetId: b.assetId })).toEqual({ ok: true, value: undefined });
    expect(await positions(clientId)).toEqual([1, 2]);
    expect(await objects()).toEqual([`${a.assetId}.jpg`, `${doc.assetId}.pdf`].sort());
    expect(await removeClientMaterial({ clientId, assetId: b.assetId })).toMatchObject({ ok: false, status: 404, error: { code: "NOT_FOUND" } });
    const listed = await listClientMaterial({ clientId });
    expect(listed.ok && listed.value.map((x) => x.id)).toEqual([a.assetId, doc.assetId]);
  });

  it.each([
    ["a 1200 px short side", () => jpeg(2400, 1200), "image/jpeg", "CLIENT_IMAGE_SIZE_INVALID"],
    ["a stored type that is not the declared one", () => jpeg(2400, 1600), "image/png", "UPLOAD_REJECTED"],
  ])("confirm refuses %s with %s and writes no row", async (_label, make, contentType, code) => {
    const { requestClientMaterialUpload, confirmClientMaterialUpload } = await loadClientActions();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const bytes = await make();
    const presigned = await requestClientMaterialUpload({ clientId: client.id, contentType, sizeBytes: bytes.byteLength });
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { assetId, url, method, headers } = presigned.value;
    expect((await fetch(url, { method, headers, body: new Blob([new Uint8Array(bytes)]) })).status).toBe(200);
    const before = await counts();
    expect(await confirmClientMaterialUpload({ clientId: client.id, assetId, contentType, fileName: "foto.jpg" })).toMatchObject({
      ok: false,
      status: 400,
      error: { code },
    });
    expect(await counts()).toEqual(before);
  });

  it("presign refuses a .zip and a 60 MB file", async () => {
    const { requestClientMaterialUpload } = await loadClientActions();
    expect(await requestClientMaterialUpload({ clientId: acme.id, contentType: "application/zip", sizeBytes: 10 })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "FILE_TYPE_NOT_ALLOWED" },
    });
    expect(await requestClientMaterialUpload({ clientId: acme.id, contentType: "video/mp4", sizeBytes: 60 * 1024 * 1024 })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "FILE_TOO_LARGE" },
    });
  });
});

describe("client delete (owner, 2026-10-19)", () => {
  const remove = (clientId: string, confirmName: string, db: pg.Pool | pg.PoolClient = pool) =>
    db.query<{ deleted: number }>("select public.delete_client($1, $2, $3) as deleted", [clientId, confirmName, DEV_ACTOR_ID]);

  /** Moves a case to `approved` the way only `transition_case_study` may (the status flag). */
  async function approve(caseId: string) {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("select pg_catalog.set_config('mac_recap.status_transition', 'on', true)");
      await db.query("update public.case_study set status = 'approved' where id = $1", [caseId]);
      await db.query("commit");
    } finally {
      db.release();
    }
  }

  const clientRow = async (id: string) =>
    (await pool.query<{ deleted_at: Date | null; deleted_by: string | null }>("select deleted_at, deleted_by from public.client where id = $1", [id]))
      .rows[0];
  const caseRows = async (clientId: string) =>
    (
      await pool.query<{ id: string; deleted_at: Date | null; status: string }>(
        "select id, deleted_at, status from public.case_study where client_id = $1 order by created_at, id",
        [clientId],
      )
    ).rows;
  const deletedEvents = async (caseIds: string[]) =>
    (
      await pool.query<{ case_id: string; type: string; actor_id: string; data: Record<string, unknown> }>(
        "select case_id, type, actor_id, data from public.case_event where type = $2 and case_id = any($1::uuid[]) order by case_id",
        [caseIds, CASE_DELETED],
      )
    ).rows;

  it("writes the case_deleted type (CASE_DELETED) and no other event type per deleted case", async () => {
    expect(CASE_DELETED).toBe("case_deleted");
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const created = await createCase({ name: "Event type", clientId: client.id });
    await remove(client.id, client.name);
    const { rows } = await pool.query<{ type: string }>("select type from public.case_event where case_id = $1 order by at, id", [created.id]);
    expect(rows.map((r) => r.type)).toEqual(["case_created", CASE_DELETED]);
  });

  it("adds client.deleted_at and replaces the name key constraint with a partial unique index; the code key stays", async () => {
    const { rows } = await pool.query(
      "select data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'client' and column_name = 'deleted_at'",
    );
    expect(rows).toEqual([{ data_type: "timestamp with time zone", is_nullable: "YES" }]);
    const index = await pool.query<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = 'public' and indexname = 'client_name_key_key'");
    expect(index.rows[0].indexdef).toMatch(/UNIQUE INDEX .* \(name_key\) WHERE \(deleted_at IS NULL\)/);
    const constraints = await pool.query<{ conname: string }>(
      "select conname from pg_constraint where conrelid = 'public.client'::regclass and contype = 'u' order by conname",
    );
    expect(constraints.rows.map((r) => r.conname)).toEqual(["client_code_key"]);
  });

  it("deletes a client with 2 cases (1 approved): both cases and the client get deleted_at, with one deleted event each", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const draft = await createCase({ name: "Delete draft", clientId: client.id });
    const approved = await createCase({ name: "Delete approved", clientId: client.id });
    await approve(approved.id);
    // An already soft-deleted case is left as it is, with no new event.
    const earlier = await createCase({ name: "Delete earlier", clientId: client.id });
    await pool.query("update public.case_study set deleted_at = '2026-01-01' where id = $1", [earlier.id]);

    expect((await remove(client.id, client.name)).rows).toEqual([{ deleted: 2 }]);

    expect(await clientRow(client.id)).toEqual({ deleted_at: expect.any(Date), deleted_by: DEV_ACTOR_ID });
    const rows = await caseRows(client.id);
    expect(rows.map((r) => r.deleted_at)).toEqual([expect.any(Date), expect.any(Date), new Date("2026-01-01T00:00:00Z")]);
    expect(rows.find((r) => r.id === approved.id)?.status).toBe("approved");
    const events = await deletedEvents([draft.id, approved.id, earlier.id]);
    expect(events.map((e) => e.case_id).sort()).toEqual([draft.id, approved.id].sort());
    for (const event of events) {
      expect(event).toMatchObject({ type: CASE_DELETED, actor_id: DEV_ACTOR_ID, data: { reason: "client_deleted", clientId: client.id, clientCode: client.code } });
    }
  });

  it("deletes a client with no cases and returns 0", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    expect((await remove(client.id, client.name)).rows).toEqual([{ deleted: 0 }]);
    expect((await clientRow(client.id)).deleted_at).toBeInstanceOf(Date);
  });

  it("refuses a wrong name with CLIENT_DELETE_NAME_MISMATCH; nothing written", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID, `${nameWithLetters(await freshPrefix(pool))} S.r.l.`);
    await createCase({ name: "Mismatch", clientId: client.id });
    const before = await counts();
    await expect(remove(client.id, client.name.split(" ")[0])).rejects.toMatchObject({ code: "P0001", message: "CLIENT_DELETE_NAME_MISMATCH" });
    await expect(remove(client.id, client.name.toLowerCase())).rejects.toMatchObject({ code: "P0001", message: "CLIENT_DELETE_NAME_MISMATCH" });
    expect(await counts()).toEqual(before);
    expect(await clientRow(client.id)).toEqual({ deleted_at: null, deleted_by: null });
    expect((await caseRows(client.id)).every((r) => r.deleted_at === null)).toBe(true);
  });

  it("accepts the name with extra ASCII whitespace, trimmed and collapsed", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const spaced = ` \t${client.name.replace(" ", " \n  ")}\r `;
    expect((await remove(client.id, spaced)).rows).toEqual([{ deleted: 0 }]);
  });

  it("does not count a no-break space as a space (the browser rule, normalizeClientConfirmName)", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await expect(remove(client.id, client.name.replace(" ", "\u00a0"))).rejects.toMatchObject({
      code: "P0001",
      message: "CLIENT_DELETE_NAME_MISMATCH",
    });
  });

  it("waits for a case being created for the client, then deletes it too", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await createCase({ name: "Before", clientId: client.id });
    const creator = await connection();
    const deleter = await connection();
    try {
      await creator.query("begin");
      const { rows: [created] } = await creator.query<{ id: string }>(
        "select id from public.create_case_study('During', $1, 2026, 'it', $2)",
        [client.id, DEV_ACTOR_ID],
      );
      const deleterPid = await backendPid(deleter);
      const pending = deleter.query<{ deleted: number }>("select public.delete_client($1, $2, $3) as deleted", [client.id, client.name, DEV_ACTOR_ID]);
      await waitUntilBlocked(deleterPid);
      await creator.query("commit");
      expect((await pending).rows).toEqual([{ deleted: 2 }]);
      const rows = await caseRows(client.id);
      expect(rows.find((r) => r.id === created.id)?.deleted_at).toBeInstanceOf(Date);
      expect((await deletedEvents([created.id])).map((e) => e.type)).toEqual([CASE_DELETED]);
    } finally {
      await creator.query("rollback").catch(() => undefined);
      await creator.end();
      await deleter.end();
    }
  });

  it("refuses an unknown or already deleted client with CLIENT_NOT_FOUND; nothing changes", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await createCase({ name: "Twice", clientId: client.id });
    await remove(client.id, client.name);
    const deletedAt = (await clientRow(client.id)).deleted_at;
    const before = await counts();
    await expect(remove(client.id, client.name)).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NOT_FOUND" });
    await expect(remove(UNKNOWN_ID, "x")).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NOT_FOUND" });
    expect(await counts()).toEqual(before);
    expect((await clientRow(client.id)).deleted_at).toEqual(deletedAt);
  });

  it("lets a new client take a deleted client's name, with a new code; the code is never reused", async () => {
    const prefix = await freshPrefix(pool);
    const name = nameWithLetters(prefix);
    const first = await createTestClient(pool, DEV_ACTOR_ID, name);
    await expect(createTestClient(pool, DEV_ACTOR_ID, name)).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NAME_TAKEN" });
    await remove(first.id, first.name);
    const second = await createTestClient(pool, DEV_ACTOR_ID, name);
    expect(second.id).not.toBe(first.id);
    expect(second.name).toBe(first.name);
    expect(second.code).not.toBe(first.code);
    expect(second.code.startsWith(prefix)).toBe(true);
    // Renaming another client to the name is refused again while `second` holds it.
    const other = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await addTestLogo(pool, other.id, DEV_ACTOR_ID);
    await expect(
      pool.query("select public.update_client($1, $2, $3, $4, $5, $6)", [other.id, name, TEST_INDUSTRIES, TEST_DESCRIPTION, logoId, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "CLIENT_NAME_TAKEN" });
  });

  it("hides a deleted client from list, listWithCaseCounts, findById (getClient) and the case wizard's picker", async () => {
    const { listClients, listClientSummaries, getClient } = await loadCaseStudy();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    expect((await getClient(client.id)).ok).toBe(true);
    await remove(client.id, client.name);
    const listed = await listClients();
    expect(listed.ok && listed.value.some((c) => c.id === client.id)).toBe(false);
    const summaries = await listClientSummaries();
    expect(summaries.ok && summaries.value.some((c) => c.id === client.id)).toBe(false);
    expect(await getClient(client.id)).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND" } });
  });

  it("hides a deleted client's cases from the table, get and getClientInfoForCase", async () => {
    const { list, get, getClientInfoForCase } = await loadCaseStudy();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const created = await createCase({ name: "Hidden", clientId: client.id });
    await approve(created.id);
    await remove(client.id, client.name);
    const all = await list({});
    expect(all.ok && all.value.some((c) => c.id === created.id)).toBe(false);
    const own = await list({ clientId: client.id });
    expect(own).toEqual({ ok: true, value: [] });
    expect(await get(created.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getClientInfoForCase(created.id)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("refuses every client write on a deleted client with CLIENT_NOT_FOUND; nothing written", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await addTestLogo(pool, client.id, DEV_ACTOR_ID);
    const assetId = randomUUID();
    await pool.query("select public.insert_client_asset($1, $2, $3, 'a.pdf', 'application/pdf', 10, null, null, $4)", [
      assetId,
      client.id,
      `clients/${client.id}/material/${assetId}.pdf`,
      DEV_ACTOR_ID,
    ]);
    await remove(client.id, client.name);
    const before = await counts();
    const notFound = { code: "P0001", message: "CLIENT_NOT_FOUND" };
    await expect(
      pool.query("select public.update_client($1, $2, $3, $4, $5, $6)", [client.id, client.name, TEST_INDUSTRIES, TEST_DESCRIPTION, logoId, DEV_ACTOR_ID]),
    ).rejects.toMatchObject(notFound);
    await expect(
      pool.query("select public.save_client_brief_field($1, 'context', 'x', $2)", [client.id, DEV_ACTOR_ID]),
    ).rejects.toMatchObject(notFound);
    const newAsset = randomUUID();
    await expect(
      pool.query("select public.insert_client_asset($1, $2, $3, 'b.pdf', 'application/pdf', 10, null, null, $4)", [
        newAsset,
        client.id,
        `clients/${client.id}/material/${newAsset}.pdf`,
        DEV_ACTOR_ID,
      ]),
    ).rejects.toMatchObject(notFound);
    await expect(pool.query("select public.delete_client_asset($1)", [assetId])).rejects.toMatchObject(notFound);
    await expect(pool.query("select public.delete_client_logo($1)", [logoId])).rejects.toMatchObject(notFound);
    await expect(
      pool.query("select public.create_case_study('Late', $1, 2026, 'it', $2)", [client.id, DEV_ACTOR_ID]),
    ).rejects.toMatchObject(notFound);
    expect(await counts()).toEqual(before);
  });

  it("refuses every client action on a deleted client (a stale wizard tab) with CLIENT_NOT_FOUND", async () => {
    const actions = await loadClientActions();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    const logoId = await addTestLogo(pool, client.id, DEV_ACTOR_ID);
    await remove(client.id, client.name);
    const clientId = client.id;
    const results = [
      await actions.updateClient({ clientId, name: client.name, industries: TEST_INDUSTRIES, description: TEST_DESCRIPTION, logoId }),
      await actions.saveClientBriefField({ clientId, field: "context", text: "x" }),
      await actions.requestClientLogoUpload({ clientId, contentType: "image/png", sizeBytes: 10 }),
      await actions.confirmClientLogoUpload({ clientId, logoId: randomUUID(), contentType: "image/png" }),
      await actions.requestClientMaterialUpload({ clientId, contentType: "application/pdf", sizeBytes: 10 }),
      await actions.confirmClientMaterialUpload({ clientId, assetId: randomUUID(), contentType: "application/pdf", fileName: "brief.pdf" }),
      await actions.removeClientMaterial({ clientId, assetId: randomUUID() }),
      await actions.listClientMaterial({ clientId }),
      await actions.deleteClient({ clientId, confirmName: client.name }),
    ];
    // One line per action, so a failure names every action that answered differently.
    expect(results.map((result) => (result.ok ? "ok" : `${result.status} ${result.error.code}`))).toEqual(
      results.map(() => "404 CLIENT_NOT_FOUND"),
    );
  });

  it("deletes through the action and reports the count", async () => {
    const { deleteClient } = await loadClientActions();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await createCase({ name: "Via action", clientId: client.id });
    expect(await deleteClient({ clientId: client.id, confirmName: "nope" })).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "CLIENT_DELETE_NAME_MISMATCH" },
    });
    expect(await deleteClient({ clientId: client.id, confirmName: ` ${client.name} ` })).toEqual({ ok: true, value: { deletedCases: 1 } });
  });

  it("returns 403 FORBIDDEN to any other role and writes nothing", async () => {
    const { deleteClient } = await loadClientActions();
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    for (const role of ["account_sales_social", "admin"]) {
      await pool.query("update public.profile set role = $2 where id = $1", [DEV_ACTOR_ID, role]);
      try {
        const before = await counts();
        expect(await deleteClient({ clientId: client.id, confirmName: client.name })).toMatchObject({
          ok: false,
          status: 403,
          error: { code: "FORBIDDEN" },
        });
        expect(await counts()).toEqual(before);
      } finally {
        await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
      }
    }
    expect((await clientRow(client.id)).deleted_at).toBeNull();
  });

  it("grants delete_client to service_role only", async () => {
    const { rows } = await pool.query(
      `select has_function_privilege('service_role', $1, 'execute') as service,
              has_function_privilege('anon', $1, 'execute') as anon,
              has_function_privilege('authenticated', $1, 'execute') as authenticated`,
      ["public.delete_client(uuid, text, uuid)"],
    );
    expect(rows).toEqual([{ service: true, anon: false, authenticated: false }]);
  });

  it("keeps the client delete and truncate triggers: a hard delete is still refused", async () => {
    const client = await createTestClient(pool, DEV_ACTOR_ID);
    await expect(inRolledBackTx("delete from public.client where id = $1", [client.id])).rejects.toThrow(/never deleted/);
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
