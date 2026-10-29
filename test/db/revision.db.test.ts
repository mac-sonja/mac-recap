// Story 3.3: DB-level checks of the `revision` table and `create_working_revision`,
// and the real case-study revision reads and write, against the local Supabase
// stack. Run with `npm run test:db`. Cases and revisions are never deleted, so
// every test works on its own fresh case.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import { REVISION_CREATED, REVISION_SAVED, REVISION_STATUSES } from "@/modules/case-study/domain/revision";
import { caseHistoryV0, caseHistoryV1, caseHistoryV2 } from "@/modules/generation/domain/document-fixtures";
import { UPGRADE_ID_PREFIX } from "@/modules/generation";
import { FORMAT_IDS, starterPages } from "@/modules/rendering";
import { createTestClient } from "../helpers/db-clients";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";
const v2 = () => caseHistoryV2(FORMAT_IDS);
const v1 = () => caseHistoryV1();
const v0 = () => caseHistoryV0();
/** What a stored v1 or v0 case history reads as: the template's starter pages, built with no texts, images or results and counter ids. */
const upgradedV2 = {
  schemaVersion: 2,
  kind: "case_history",
  template: "mac-case@1",
  formats: Object.fromEntries(
    FORMAT_IDS.map((id) => {
      let n = 0;
      const newId = () => `${UPGRADE_ID_PREFIX}${String(++n).padStart(12, "0")}`;
      return [id, { pages: starterPages("mac-case@1", "case_history", id, { newId, texts: {}, images: [], resultRows: 0, hasTestimonial: false }) }];
    }),
  ),
};

let pool: pg.Pool;
let clientId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 4 });
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [TEST_ACTOR_ID]);
  clientId = (await createTestClient(pool, TEST_ACTOR_ID)).id;
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
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

/** A dedicated connection (outside the pool) for the concurrency test. */
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

async function signedInActor() {
  const { getActor } = await import("@/modules/access");
  const actor = await getActor();
  if (!actor.ok) throw new Error(`signed-in test actor did not resolve: ${actor.error.code}`);
  return actor.value;
}

async function createCase() {
  const { create } = await loadCaseStudy();
  const result = await create(await signedInActor(), { name: "Revisions", clientId, year: 2026, businessLines: ["branding"] });
  if (!result.ok) throw new Error(`setup create failed: ${result.error.code}`);
  return result.value;
}

const createSql = "select * from public.create_working_revision($1, $2, $3, $4, $5, $6)";
const META = { model: null, fellBack: false, promptVersion: null };

/** Calls `create_working_revision` directly (as postgres). */
async function createRevision(caseId: string, expected: number, doc: unknown = v2()) {
  const { rows } = await pool.query(createSql, [caseId, JSON.stringify(doc), "{}", JSON.stringify(META), expected, TEST_ACTOR_ID]);
  return rows[0] as { id: string; status: string };
}

async function caseRow(caseId: string) {
  const { rows } = await pool.query(
    "select head_revision_id, approved_revision_id, head_version, updated_at, deleted_at from public.case_study where id = $1",
    [caseId],
  );
  return rows[0];
}

async function revisionEvents(caseId: string) {
  const { rows } = await pool.query(
    "select revision_id, actor_id, data from public.case_event where case_id = $1 and type = $2 order by at",
    [caseId, REVISION_CREATED],
  );
  return rows;
}

describe("migration", () => {
  it("indexes the FK columns pointing at revision", async () => {
    const { rows } = await pool.query<{ name: string }>(
      `select indexname as name from pg_catalog.pg_indexes where schemaname = 'public'
          and indexname in ('case_study_head_revision_id_idx', 'case_study_approved_revision_id_idx', 'case_event_revision_id_idx') order by indexname`,
    );
    expect(rows.map((r) => r.name)).toEqual(["case_event_revision_id_idx", "case_study_approved_revision_id_idx", "case_study_head_revision_id_idx"]);
  });

  it("has exactly the story's columns", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'revision' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      "case_id",
      "client_intro_id",
      "created_at",
      "created_by",
      "doc",
      "fell_back",
      "generated_doc",
      "id",
      "manifest",
      "model",
      "prompt_version",
      "schema_version",
      "status",
      "updated_at",
      "version",
    ]);
  });

  it("enables RLS with no policies", async () => {
    const { rows } = await pool.query(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
         from pg_catalog.pg_class c where c.oid = 'public.revision'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
  });

  it("grants the service role select only, and anon and authenticated nothing", async () => {
    const { rows } = await pool.query(
      `select r.role, p.privilege, has_table_privilege(r.role, 'public.revision', p.privilege) as granted
         from unnest(array['service_role', 'anon', 'authenticated']) as r(role)
        cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(privilege)
        where has_table_privilege(r.role, 'public.revision', p.privilege)`,
    );
    expect(rows).toEqual([{ role: "service_role", privilege: "SELECT", granted: true }]);
  });

  it("checks status against exactly REVISION_STATUSES, defaulting to working, and version defaulting to 0", async () => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where conrelid = 'public.revision'::regclass and conname = 'revision_status_check'`,
    );
    expect([...rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...REVISION_STATUSES]);
    const { rows: defaults } = await pool.query(
      `select column_name, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'revision' and column_name in ('status', 'version') order by column_name`,
    );
    expect(defaults).toEqual([
      { column_name: "status", column_default: "'working'::text" },
      { column_name: "version", column_default: "0" },
    ]);
  });

  it("adds the revision FKs from case_study and case_event", async () => {
    const { rows } = await pool.query<{ conname: string; def: string }>(
      `select conname, pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where contype = 'f' and confrelid = 'public.revision'::regclass order by conname`,
    );
    expect(rows).toEqual([
      { conname: "case_event_revision_id_fkey", def: "FOREIGN KEY (revision_id) REFERENCES revision(id)" },
      { conname: "case_study_approved_revision_id_fkey", def: "FOREIGN KEY (approved_revision_id) REFERENCES revision(id)" },
      { conname: "case_study_head_revision_id_fkey", def: "FOREIGN KEY (head_revision_id) REFERENCES revision(id)" },
    ]);
  });

  it("create_working_revision is security definer with an empty search_path, executable by service_role only", async () => {
    const { rows } = await pool.query(
      `select p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'create_working_revision'`,
    );
    expect(rows).toEqual([{ definer: true, config: ['search_path=""'], service_role: true, anon: false, authenticated: false }]);
  });
});

describe("table guards", () => {
  const insert = `insert into public.revision (case_id, client_intro_id, generated_doc, doc, schema_version, created_by)
                  values ($1, $2, $3, $3, 2, '${TEST_ACTOR_ID}')`;

  it("needs exactly one subject", async () => {
    const created = await createCase();
    const doc = JSON.stringify(v2());
    await expect(inRolledBackTx(insert, [null, null, doc])).rejects.toMatchObject({ code: "23514", constraint: "revision_subject_check" });
    await expect(inRolledBackTx(insert, [created.id, UNKNOWN_ID, doc])).rejects.toMatchObject({ code: "23514", constraint: "revision_subject_check" });
    // A client intro subject has no FK until Story 3.9.
    await expect(inRolledBackTx(insert, [null, UNKNOWN_ID, doc])).resolves.toMatchObject({ rowCount: 1 });
  });

  it("checks the document shape and its schema version", async () => {
    const created = await createCase();
    await expect(inRolledBackTx(insert, [created.id, null, "[]"])).rejects.toMatchObject({ code: "23514" });
    await expect(inRolledBackTx(insert, [created.id, null, JSON.stringify({ ...v2(), schemaVersion: 3 })])).rejects.toMatchObject({
      code: "23514",
      constraint: "revision_doc_schema_version_check",
    });
    await expect(inRolledBackTx(insert, [created.id, null, JSON.stringify({ ...v2(), schemaVersion: "2" })])).rejects.toMatchObject({
      code: "23514",
    });
  });

  it("checks generated_doc's schemaVersion on its own", async () => {
    const created = await createCase();
    const sql = `insert into public.revision (case_id, generated_doc, doc, schema_version, created_by) values ($1, $2, $3, 2, '${TEST_ACTOR_ID}')`;
    for (const version of ['"2"', "null"]) {
      await expect(
        inRolledBackTx(sql, [created.id, `{"schemaVersion": ${version}}`, JSON.stringify(v2())]),
      ).rejects.toMatchObject({ code: "23514", constraint: "revision_generated_doc_schema_version_check" });
    }
    await expect(inRolledBackTx(sql, [created.id, '{"kind": "case_history"}', JSON.stringify(v2())])).rejects.toMatchObject({
      code: "23514",
      constraint: "revision_generated_doc_schema_version_check",
    });
  });

  it("allows at most one working revision per case", async () => {
    const created = await createCase();
    await createRevision(created.id, 0);
    await expect(inRolledBackTx(insert, [created.id, null, JSON.stringify(v2())])).rejects.toMatchObject({
      code: "23505",
      constraint: "revision_one_working_per_case_idx",
    });
    // Another status is fine.
    await expect(
      inRolledBackTx(
        `insert into public.revision (case_id, status, generated_doc, doc, schema_version, created_by) values ($1, 'superseded', $2, $2, 2, '${TEST_ACTOR_ID}')`,
        [created.id, JSON.stringify(v2())],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it("allows at most one working revision per client intro", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const doc = JSON.stringify(v2());
      await client.query(insert, [null, UNKNOWN_ID, doc]);
      await expect(client.query(insert, [null, UNKNOWN_ID, doc])).rejects.toMatchObject({
        code: "23505",
        constraint: "revision_one_working_per_client_intro_idx",
      });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("refuses deleting or truncating revisions", async () => {
    const created = await createCase();
    const revision = await createRevision(created.id, 0);
    await expect(inRolledBackTx("delete from public.revision where id = $1", [revision.id])).rejects.toThrow(/never deleted/);
    await expect(inRolledBackTx("truncate public.revision cascade")).rejects.toThrow(/never deleted/);
  });

  describe("after insert", () => {
    let caseId: string;
    let revisionId: string;

    beforeAll(async () => {
      caseId = (await createCase()).id;
      revisionId = (await createRevision(caseId, 0)).id;
    });

    it.each([
      ["generated_doc", "generated_doc = '{\"schemaVersion\": 1}'::jsonb"],
      ["case_id", "case_id = gen_random_uuid()"],
      ["client_intro_id", "client_intro_id = gen_random_uuid()"],
      ["created_by", "created_by = gen_random_uuid()"],
      ["created_at", "created_at = now() - interval '1 day'"],
      ["id", "id = gen_random_uuid()"],
    ])("refuses a change to %s", async (_column, set) => {
      await expect(inRolledBackTx(`update public.revision set ${set} where id = $1`, [revisionId])).rejects.toThrow(/immutable/);
    });

    it("allows a change to doc and version (working → approved), and bumps updated_at", async () => {
      const { rows } = await inRolledBackTx(
        "update public.revision set doc = doc, status = 'approved', version = version + 1 where id = $1 returning updated_at > created_at as touched",
        [revisionId],
      );
      expect(rows).toEqual([{ touched: true }]);
    });

    /** Applies each status in `steps` in turn, in one rolled-back transaction; returns the last status. */
    async function walk(steps: string[]) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        let status = "working";
        for (const step of steps) {
          status = (await client.query("update public.revision set status = $2 where id = $1 returning status", [revisionId, step])).rows[0].status;
        }
        return status;
      } finally {
        await client.query("rollback").catch(() => undefined);
        client.release();
      }
    }

    it.each([[["working"]], [["approved"]], [["superseded"]], [["approved", "superseded"]], [["approved", "approved"]]])(
      "allows the status walk %j",
      async (steps) => {
        await expect(walk(steps)).resolves.toBe(steps.at(-1));
      },
    );

    it.each([[["approved", "working"]], [["superseded", "working"]], [["superseded", "approved"]], [["approved", "superseded", "approved"]]])(
      "refuses the status walk %j with REVISION_STATUS_INVALID",
      async (steps) => {
        await expect(walk(steps)).rejects.toMatchObject({ code: "P0001", message: "REVISION_STATUS_INVALID" });
      },
    );
  });
});

describe("create_working_revision", () => {
  it("creates a working revision, sets the head, increments head_version and writes one event", async () => {
    const created = await createCase();
    const meta = { model: "claude-opus-5-5", fellBack: true, promptVersion: "narrative@1" };
    const { rows } = await pool.query(createSql, [created.id, JSON.stringify(v2()), '{"assets": []}', JSON.stringify(meta), 0, TEST_ACTOR_ID]);
    const revision = rows[0];
    expect(revision).toMatchObject({
      case_id: created.id,
      client_intro_id: null,
      status: "working",
      version: 0,
      generated_doc: v2(),
      doc: v2(),
      manifest: { assets: [] },
      model: "claude-opus-5-5",
      fell_back: true,
      prompt_version: "narrative@1",
      schema_version: 2,
      created_by: TEST_ACTOR_ID,
    });
    expect(await caseRow(created.id)).toMatchObject({ head_revision_id: revision.id, approved_revision_id: null, head_version: 1 });
    expect(await revisionEvents(created.id)).toEqual([
      {
        revision_id: revision.id,
        actor_id: TEST_ACTOR_ID,
        data: { headVersion: 1, previousHeadRevisionId: null, supersededRevisionId: null },
      },
    ]);
  });

  it("supersedes a previous working head", async () => {
    const created = await createCase();
    const first = await createRevision(created.id, 0);
    const second = await createRevision(created.id, 1);
    const { rows } = await pool.query("select id, status from public.revision where case_id = $1", [created.id]);
    expect(new Map(rows.map((r) => [r.id, r.status]))).toEqual(
      new Map([
        [first.id, "superseded"],
        [second.id, "working"],
      ]),
    );
    expect(await caseRow(created.id)).toMatchObject({ head_revision_id: second.id, head_version: 2 });
    expect((await revisionEvents(created.id)).at(-1)?.data).toEqual({ headVersion: 2, previousHeadRevisionId: first.id, supersededRevisionId: first.id });
  });

  it("leaves a previous head that is not working as it is", async () => {
    const created = await createCase();
    const first = await createRevision(created.id, 0);
    await pool.query("update public.revision set status = 'approved' where id = $1", [first.id]);
    await createRevision(created.id, 1);
    const { rows } = await pool.query("select status from public.revision where id = $1", [first.id]);
    expect(rows).toEqual([{ status: "approved" }]);
  });

  it("refuses a stale head with STALE_HEAD and writes nothing", async () => {
    const created = await createCase();
    await createRevision(created.id, 0);
    const before = await caseRow(created.id);
    await expect(createRevision(created.id, 0)).rejects.toMatchObject({ code: "P0001", message: "STALE_HEAD" });
    expect(await caseRow(created.id)).toEqual(before);
    const { rows } = await pool.query("select count(*)::int as n from public.revision where case_id = $1", [created.id]);
    expect(rows).toEqual([{ n: 1 }]);
    expect(await revisionEvents(created.id)).toHaveLength(1);
  });

  it("of two concurrent calls with the same expected version, exactly one wins; the other is STALE_HEAD", async () => {
    const created = await createCase();
    const a = await connection();
    const b = await connection();
    try {
      await a.query("begin");
      await a.query(createSql, [created.id, JSON.stringify(v2()), "{}", JSON.stringify(META), 0, TEST_ACTOR_ID]);
      const bPid = await backendPid(b);
      const second = b.query(createSql, [created.id, JSON.stringify(v2()), "{}", JSON.stringify(META), 0, TEST_ACTOR_ID]).then(
        () => "ok",
        (error: { message: string }) => error.message,
      );
      await waitUntilBlocked(bPid);
      await a.query("commit");
      expect(await second).toBe("STALE_HEAD");
    } finally {
      await a.query("rollback").catch(() => undefined);
      await a.end();
      await b.end();
    }
    const { rows } = await pool.query("select count(*)::int as n from public.revision where case_id = $1", [created.id]);
    expect(rows).toEqual([{ n: 1 }]);
    expect(await revisionEvents(created.id)).toHaveLength(1);
    expect(await caseRow(created.id)).toMatchObject({ head_version: 1 });
  });

  it("refuses an unknown or soft-deleted case with NOT_FOUND", async () => {
    await expect(createRevision(UNKNOWN_ID, 0)).rejects.toMatchObject({ message: "NOT_FOUND" });
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    await expect(createRevision(created.id, 0)).rejects.toMatchObject({ message: "NOT_FOUND" });
  });

  it.each([
    ["a non-object doc", ["[]", "{}", "{}"]],
    ["a doc without schemaVersion", ["{}", "{}", "{}"]],
    ["a fractional schemaVersion", ['{"schemaVersion": 1.5}', "{}", "{}"]],
    ["a non-object manifest", ['{"schemaVersion": 1}', "[]", "{}"]],
    ["a non-boolean fellBack", ['{"schemaVersion": 1}', "{}", '{"fellBack": "yes"}']],
    ["a non-string model", ['{"schemaVersion": 1}', "{}", '{"model": 5}']],
  ])("refuses %s with INVALID_INPUT", async (_name, [doc, manifest, meta]) => {
    const created = await createCase();
    await expect(pool.query(createSql, [created.id, doc, manifest, meta, 0, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    expect(await caseRow(created.id)).toMatchObject({ head_revision_id: null, head_version: 0 });
  });
});

describe("RLS lockout", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const service = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  it("the browser key is refused reading revision and calling create_working_revision", async () => {
    const read = await browser().from("revision").select("*");
    expect(read.data).toBeNull();
    expect(read.error?.code).toBe("42501");
    const call = await browser().rpc("create_working_revision", {
      p_case_id: UNKNOWN_ID,
      p_doc: v2(),
      p_manifest: {},
      p_meta: META,
      p_expected_head_version: 0,
      p_actor_id: TEST_ACTOR_ID,
    });
    expect(call.data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(call.error?.code);
  });

  it.each(["anon", "authenticated"])("%s may not touch revision or execute create_working_revision", async (role) => {
    await expect(inRolledBackTx("select * from public.revision", [], role)).rejects.toMatchObject({ code: "42501" });
    await expect(
      inRolledBackTx(`select public.create_working_revision('${UNKNOWN_ID}', '{}', '{}', '{}', 0, '${TEST_ACTOR_ID}')`, [], role),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("the service role may read but not write directly", async () => {
    const created = await createCase();
    const revision = await createRevision(created.id, 0);
    const read = await service().from("revision").select("id").eq("id", revision.id);
    expect(read.data).toEqual([{ id: revision.id }]);
    const update = await service().from("revision").update({ status: "approved" }).eq("id", revision.id).select("id");
    expect(update.error?.code).toBe("42501");
    const insert = await service()
      .from("revision")
      .insert({ case_id: created.id, generated_doc: v2(), doc: v2(), schema_version: 2, created_by: TEST_ACTOR_ID });
    expect(insert.error?.code).toBe("42501");
    await expect(inRolledBackTx(`delete from public.revision where id = '${revision.id}'`, [], "service_role")).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("the case-study revision use cases (real adapter)", () => {
  it("createWorkingRevision writes a validated document; a stale head writes nothing", async () => {
    const created = await createCase();
    const { createWorkingRevision } = await loadCaseStudy();
    const actor = await signedInActor();
    const first = await createWorkingRevision(actor, { caseId: created.id, doc: v2(), expectedHeadVersion: 0 });
    expect(first).toMatchObject({ ok: true, value: { caseId: created.id, status: "working", doc: v2(), generatedDoc: v2() } });
    const stale = await createWorkingRevision(actor, { caseId: created.id, doc: v2(), expectedHeadVersion: 0 });
    expect(stale).toMatchObject({ ok: false, error: { code: "STALE_HEAD" } });
    expect(await caseRow(created.id)).toMatchObject({ head_version: 1 });
  });

  it("createWorkingRevision records meta and manifest", async () => {
    const created = await createCase();
    const { createWorkingRevision } = await loadCaseStudy();
    const meta = { model: "m", fellBack: true, promptVersion: "p@1" };
    const manifest = { refs: [{ kind: "form_field", id: "context" }], hash: "abc" };
    const result = await createWorkingRevision(await signedInActor(), { caseId: created.id, doc: v2(), manifest, meta, expectedHeadVersion: 0 });
    expect(result).toMatchObject({ ok: true, value: { manifest, ...meta, schemaVersion: 2, version: 0, status: "working" } });
    if (!result.ok) return;
    const { rows } = await pool.query(
      "select manifest, model, fell_back, prompt_version, schema_version, status, generated_doc, doc from public.revision where id = $1",
      [result.value.id],
    );
    expect(rows).toEqual([
      { manifest, model: "m", fell_back: true, prompt_version: "p@1", schema_version: 2, status: "working", generated_doc: v2(), doc: v2() },
    ]);
    expect(await revisionEvents(created.id)).toEqual([expect.objectContaining({ revision_id: result.value.id })]);
  });

  it("createWorkingRevision is NOT_FOUND for an unknown case", async () => {
    const { createWorkingRevision } = await loadCaseStudy();
    const result = await createWorkingRevision(await signedInActor(), { caseId: UNKNOWN_ID, doc: v2(), expectedHeadVersion: 0 });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    const { rows } = await pool.query("select count(*)::int as n from public.revision where case_id = $1", [UNKNOWN_ID]);
    expect(rows).toEqual([{ n: 0 }]);
  });

  it("createWorkingRevision is NOT_FOUND for a soft-deleted case, which stays unchanged", async () => {
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    const before = await caseRow(created.id);
    const { createWorkingRevision } = await loadCaseStudy();
    const result = await createWorkingRevision(await signedInActor(), { caseId: created.id, doc: v2(), expectedHeadVersion: 0 });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await caseRow(created.id)).toEqual(before);
    expect(await revisionEvents(created.id)).toEqual([]);
  });

  it("createWorkingRevision refuses a format set off the registry before any write", async () => {
    const created = await createCase();
    const { createWorkingRevision } = await loadCaseStudy();
    const doc = v2();
    delete doc.formats.video_9_16;
    const result = await createWorkingRevision(await signedInActor(), { caseId: created.id, doc, expectedHeadVersion: 0 });
    expect(result).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION" } });
    expect(await caseRow(created.id)).toMatchObject({ head_revision_id: null, head_version: 0 });
  });

  it("live is null with only a working head; editable is the head", async () => {
    const created = await createCase();
    const head = await createRevision(created.id, 0);
    const { getEditableRevision, getLiveRevision } = await loadCaseStudy();
    expect(await getLiveRevision({ kind: "case", id: created.id })).toEqual({ ok: true, value: null });
    expect(await getEditableRevision({ kind: "case", id: created.id })).toMatchObject({ ok: true, value: { id: head.id, status: "working" } });
  });

  it.each([
    ["v1", v1, 1],
    ["v0", v0, 0],
  ] as const)("reads a stored %s approved revision upgraded to v2, leaving the row unchanged", async (_name, fixture, version) => {
    const created = await createCase();
    const { rows } = await pool.query(
      `insert into public.revision (case_id, status, generated_doc, doc, schema_version, created_by)
       values ($1, 'approved', $2, $2, $3, $4) returning id, doc, generated_doc, updated_at`,
      [created.id, JSON.stringify(fixture()), version, TEST_ACTOR_ID],
    );
    const stored = rows[0];
    await pool.query("update public.case_study set approved_revision_id = $2 where id = $1", [created.id, stored.id]);

    const { getLiveRevision } = await loadCaseStudy();
    const live = await getLiveRevision({ kind: "case", id: created.id });
    expect(live).toMatchObject({ ok: true, value: { id: stored.id, status: "approved", schemaVersion: version } });
    if (!live.ok || live.value === null) return;
    expect(live.value.doc).toEqual(upgradedV2);
    expect(live.value.generatedDoc).toEqual(upgradedV2);

    const { rows: after } = await pool.query("select doc, generated_doc, updated_at from public.revision where id = $1", [stored.id]);
    expect(after).toEqual([{ doc: fixture(), generated_doc: fixture(), updated_at: stored.updated_at }]);
  });

  it("createWorkingRevision refuses a v1 document before any write", async () => {
    const created = await createCase();
    const { createWorkingRevision } = await loadCaseStudy();
    const result = await createWorkingRevision(await signedInActor(), { caseId: created.id, doc: v1(), expectedHeadVersion: 0 });
    expect(result).toMatchObject({ ok: false, error: { code: "DOCUMENT_SCHEMA_UNSUPPORTED" } });
    expect(await caseRow(created.id)).toMatchObject({ head_revision_id: null, head_version: 0 });
  });

  it("skips a soft-deleted case", async () => {
    const created = await createCase();
    await createRevision(created.id, 0);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    const { getEditableRevision, getLiveRevision } = await loadCaseStudy();
    expect(await getEditableRevision({ kind: "case", id: created.id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await getLiveRevision({ kind: "case", id: created.id })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("a client_intro subject is SUBJECT_NOT_SUPPORTED", async () => {
    const { getEditableRevision, getLiveRevision } = await loadCaseStudy();
    expect(await getLiveRevision({ kind: "client_intro", id: UNKNOWN_ID })).toMatchObject({ ok: false, error: { code: "SUBJECT_NOT_SUPPORTED" } });
    expect(await getEditableRevision({ kind: "client_intro", id: UNKNOWN_ID })).toMatchObject({ ok: false, error: { code: "SUBJECT_NOT_SUPPORTED" } });
  });
});

// Story 4.3a: the configurator's autosave.
describe("save_revision_doc", () => {
  const saveSql = "select * from public.save_revision_doc($1, $2, $3, $4)";
  const edited = () => {
    const doc = v2();
    doc.formats.presentazione_16_9!.pages[0]!.name = "Copertina nuova";
    return doc;
  };

  /** Calls `save_revision_doc` directly (as postgres). */
  async function save(revisionId: string, expected: number, doc: unknown = edited()) {
    const { rows } = await pool.query(saveSql, [revisionId, JSON.stringify(doc), expected, TEST_ACTOR_ID]);
    return rows[0] as { id: string; version: number; doc: unknown; generated_doc: unknown; schema_version: number };
  }

  /** A fresh case moved to `in_review` with a working head revision. */
  async function editableCase() {
    const created = await createCase();
    const revision = await createRevision(created.id, 0);
    const { transition } = await loadCaseStudy();
    const actor = await signedInActor();
    for (const event of ["generate", "generation_succeeded"] as const) {
      const moved = await transition(created.id, event, actor);
      if (!moved.ok) throw new Error(`setup transition ${event} failed: ${moved.error.code}`);
    }
    return { caseId: created.id, revisionId: revision.id };
  }

  async function revisionRow(id: string) {
    const { rows } = await pool.query("select doc, generated_doc, version, status from public.revision where id = $1", [id]);
    return rows[0];
  }

  async function savedEvents(caseId: string) {
    const { rows } = await pool.query("select revision_id, actor_id, data from public.case_event where case_id = $1 and type = $2 order by at", [
      caseId,
      REVISION_SAVED,
    ]);
    return rows;
  }

  it("is security definer with an empty search_path, executable by service_role only", async () => {
    const { rows } = await pool.query(
      `select p.prosecdef, p.proconfig,
              has_function_privilege('service_role', p.oid, 'execute') as service,
              has_function_privilege('authenticated', p.oid, 'execute') as authed,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'save_revision_doc'`,
    );
    expect(rows).toEqual([{ prosecdef: true, proconfig: ["search_path=\"\""], service: true, authed: false, anon: false }]);
  });

  it("writes doc, increments version, leaves generated_doc and writes one event", async () => {
    const { caseId, revisionId } = await editableCase();
    const saved = await save(revisionId, 0);
    expect(saved).toMatchObject({ id: revisionId, version: 1, doc: edited(), generated_doc: v2(), schema_version: 2 });
    expect(await savedEvents(caseId)).toEqual([{ revision_id: revisionId, actor_id: TEST_ACTOR_ID, data: { version: 1 } }]);
    expect((await save(revisionId, 1, v2())).version).toBe(2);
  });

  it("refuses a stale version with STALE_REVISION and writes nothing", async () => {
    const { caseId, revisionId } = await editableCase();
    await save(revisionId, 0);
    const before = await revisionRow(revisionId);
    await expect(save(revisionId, 0, v2())).rejects.toMatchObject({ code: "P0001", message: "STALE_REVISION" });
    expect(await revisionRow(revisionId)).toEqual(before);
    expect(await savedEvents(caseId)).toHaveLength(1);
  });

  it("refuses a case that is not in_review with CASE_NOT_EDITABLE", async () => {
    const created = await createCase();
    const revision = await createRevision(created.id, 0);
    await expect(save(revision.id, 0)).rejects.toMatchObject({ code: "P0001", message: "CASE_NOT_EDITABLE" });
    expect(await revisionRow(revision.id)).toMatchObject({ version: 0, doc: v2() });
  });

  it("refuses a revision that is no longer the head with STALE_HEAD", async () => {
    const { caseId, revisionId } = await editableCase();
    await createRevision(caseId, 1);
    await expect(save(revisionId, 0)).rejects.toMatchObject({ code: "P0001", message: "STALE_HEAD" });
  });

  it("refuses a head that is not working with REVISION_NOT_WRITABLE", async () => {
    const { revisionId } = await editableCase();
    await pool.query("update public.revision set status = 'approved' where id = $1", [revisionId]);
    await expect(save(revisionId, 0)).rejects.toMatchObject({ code: "P0001", message: "REVISION_NOT_WRITABLE" });
  });

  it("refuses an unknown revision or a deleted case with NOT_FOUND", async () => {
    await expect(save(UNKNOWN_ID, 0)).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
    const { caseId, revisionId } = await editableCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [caseId]);
    await expect(save(revisionId, 0)).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
  });

  it.each([
    ["a non-object doc", "[]"],
    ["a doc without schemaVersion", "{}"],
    ["a string schemaVersion", '{"schemaVersion": "2"}'],
  ])("refuses %s with INVALID_INPUT", async (_name, doc) => {
    const { revisionId } = await editableCase();
    await expect(pool.query(saveSql, [revisionId, doc, 0, TEST_ACTOR_ID])).rejects.toMatchObject({ code: "P0001", message: "INVALID_INPUT" });
  });

  it.each([
    ["STALE_HEAD", async (caseId: string) => void (await createRevision(caseId, 1))],
    ["REVISION_NOT_WRITABLE", async (_caseId: string, revisionId: string) => void (await pool.query("update public.revision set status = 'approved' where id = $1", [revisionId]))],
    ["NOT_FOUND", async (caseId: string) => void (await pool.query("update public.case_study set deleted_at = now() where id = $1", [caseId]))],
  ] as const)("saveRevisionDoc maps the refusal %s through the adapter", async (code, arrange) => {
    const { caseId, revisionId } = await editableCase();
    await arrange(caseId, revisionId);
    const { saveRevisionDoc } = await loadCaseStudy();
    expect(await saveRevisionDoc(await signedInActor(), { caseId, revisionId, doc: edited(), expectedVersion: 0 })).toMatchObject({
      ok: false,
      error: { code },
    });
  });

  it("saveRevisionDoc maps CASE_NOT_EDITABLE through the adapter", async () => {
    const created = await createCase();
    const revision = await createRevision(created.id, 0);
    const { saveRevisionDoc } = await loadCaseStudy();
    expect(await saveRevisionDoc(await signedInActor(), { caseId: created.id, revisionId: revision.id, doc: edited(), expectedVersion: 0 })).toMatchObject({
      ok: false,
      error: { code: "CASE_NOT_EDITABLE" },
    });
  });

  it("saveRevisionDoc saves through the module and maps a stale save", async () => {
    const { caseId, revisionId } = await editableCase();
    const { saveRevisionDoc } = await loadCaseStudy();
    const actor = await signedInActor();
    const saved = await saveRevisionDoc(actor, { caseId, revisionId, doc: edited(), expectedVersion: 0 });
    expect(saved).toMatchObject({ ok: true, value: { version: 1, doc: edited(), generatedDoc: v2() } });
    expect(await saveRevisionDoc(actor, { caseId, revisionId, doc: v2(), expectedVersion: 0 })).toMatchObject({
      ok: false,
      error: { code: "STALE_REVISION" },
    });
  });
});
