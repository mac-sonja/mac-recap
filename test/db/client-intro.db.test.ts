// Story 3.11: the client intro (`client_intro`, `client_event`, the FK on
// `revision.client_intro_id` and their functions) against the local Supabase stack, and
// the start rule and the generate job end to end through the real case-study, generation
// and jobs functions (no UI, no worker loop, no LLM). Run with `npm run test:db`. Clients
// and intros are never deleted, so every test uses its own client.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import { createTestClient } from "../helpers/db-clients";
import { clientIntroV2, TEST_DRAFT_MARKER } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";
const META = JSON.stringify({ model: null, fellBack: false, promptVersion: null });

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 4 });
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [TEST_ACTOR_ID]);
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

async function actor() {
  const { getActor } = await import("@/modules/access");
  const result = await getActor();
  if (!result.ok) throw new Error(`signed-in test actor did not resolve: ${result.error.code}`);
  return result.value;
}

/** A fresh client with `images` image rows and `documents` PDF rows in `client_asset`. */
async function clientWith(images: number, documents = 0) {
  const client = await createTestClient(pool, TEST_ACTOR_ID);
  const add = async (mime: string, ext: string, size: number | null) => {
    const id = randomUUID();
    await pool.query("select public.insert_client_asset($1, $2, $3, $4, $5, 10, $6, $7, $8)", [
      id,
      client.id,
      `clients/${client.id}/material/${id}.${ext}`,
      `f.${ext}`,
      mime,
      size,
      size,
      TEST_ACTOR_ID,
    ]);
    return id;
  };
  const imageIds: string[] = [];
  for (let i = 0; i < images; i++) imageIds.push(await add("image/jpeg", "jpg", 2000));
  for (let i = 0; i < documents; i++) await add("application/pdf", "pdf", null);
  return { ...client, imageIds };
}

const introRow = async (clientId: string) =>
  (await pool.query("select id, status, head_revision_id, head_version from public.client_intro where client_id = $1", [clientId])).rows[0] as
    | { id: string; status: string; head_revision_id: string | null; head_version: number }
    | undefined;
const eventsOf = async (introId: string) =>
  (await pool.query("select type, data, revision_id from public.client_event where client_intro_id = $1 order by at, id", [introId])).rows as {
    type: string;
    data: Record<string, unknown>;
    revision_id: string | null;
  }[];

/** The panel's call after a save: the start rule, with the real `jobs.enqueue`. */
async function start(clientId: string) {
  const [caseStudy, jobs] = await Promise.all([import("@/modules/case-study"), import("@/modules/jobs")]);
  return caseStudy.startClientIntro(await actor(), { clientId }, jobs.enqueue);
}

async function jobOf(jobId: string) {
  return (await pool.query("select id, subject_id, payload, status from public.job where id = $1", [jobId])).rows[0] as {
    id: string;
    subject_id: string;
    payload: Record<string, unknown>;
    status: string;
  };
}

/** The worker's generate handler, as the system actor, with `overrides`. */
async function runHandler(jobId: string, overrides: Record<string, unknown> = {}) {
  const { generateHandler } = await import("@/modules/generation/worker");
  const { getSystemActor } = await import("@/modules/access");
  const system = await getSystemActor();
  if (!system.ok) throw new Error(system.error.code);
  const handler = generateHandler({ getSystemActor: async () => system, ...overrides });
  const row = await jobOf(jobId);
  const job = { id: row.id, subjectId: row.subject_id, payload: row.payload };
  return { handler, job, outcome: await handler.run(job as never, new AbortController().signal) };
}

describe("client_intro and client_event (Story 3.11 migration)", () => {
  it("create_client_intro makes one Bozza intro per client with one client_intro_created event, and returns it again after", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const first = (await pool.query("select * from public.create_client_intro($1, $2)", [client.id, TEST_ACTOR_ID])).rows[0];
    const again = (await pool.query("select * from public.create_client_intro($1, $2)", [client.id, TEST_ACTOR_ID])).rows[0];
    expect(first).toMatchObject({ client_id: client.id, status: "draft", head_revision_id: null, approved_revision_id: null, head_version: 0 });
    expect(again.id).toBe(first.id);
    expect((await eventsOf(first.id)).map((e) => e.type)).toEqual(["client_intro_created"]);
  });

  it("refuses an unknown or deleted client with CLIENT_NOT_FOUND", async () => {
    await expect(pool.query("select public.create_client_intro($1, $2)", [UNKNOWN_ID, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "CLIENT_NOT_FOUND" });
  });

  it("changes status only through transition_client_intro, compare-and-set, with a transition event", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const intro = (await pool.query("select id from public.create_client_intro($1, $2)", [client.id, TEST_ACTOR_ID])).rows[0];
    await expect(pool.query("update public.client_intro set status = 'approved' where id = $1", [intro.id])).rejects.toMatchObject({
      message: expect.stringContaining("transition_client_intro"),
    });
    const transition = "select status from public.transition_client_intro($1, 'generate', $2, $3, $4)";
    expect((await pool.query(transition, [intro.id, "draft", "generating", TEST_ACTOR_ID])).rows[0].status).toBe("generating");
    await expect(pool.query(transition, [intro.id, "draft", "generating", TEST_ACTOR_ID])).rejects.toMatchObject({ message: "STALE_STATUS" });
    await expect(pool.query(transition, [UNKNOWN_ID, "draft", "generating", TEST_ACTOR_ID])).rejects.toMatchObject({ message: "NOT_FOUND" });
    await expect(pool.query(transition, [intro.id, "generating", "generating", TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_TRANSITION" });
    const events = await eventsOf(intro.id);
    expect(events.map((e) => e.type)).toEqual(["client_intro_created", "transition"]);
    expect(events[1].data).toEqual({ event: "generate", from: "draft", to: "generating" });
  });

  it("keeps client_event append-only", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const intro = (await pool.query("select id from public.create_client_intro($1, $2)", [client.id, TEST_ACTOR_ID])).rows[0];
    await expect(inRolledBackTx("update public.client_event set type = 'x' where client_intro_id = $1", [intro.id])).rejects.toMatchObject({ code: "P0001" });
    await expect(inRolledBackTx("delete from public.client_event where client_intro_id = $1", [intro.id])).rejects.toMatchObject({ code: "P0001" });
    await expect(inRolledBackTx("delete from public.client_intro where id = $1", [intro.id])).rejects.toMatchObject({ code: "P0001" });
  });

  it("create_working_revision_for_client_intro makes the head by compare-and-set, supersedes the previous working one and logs revision_created", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const intro = (await pool.query("select id from public.create_client_intro($1, $2)", [client.id, TEST_ACTOR_ID])).rows[0];
    const create = "select id, status, client_intro_id, case_id from public.create_working_revision_for_client_intro($1, $2, '{}', $3, $4, $5)";
    const doc = JSON.stringify(clientIntroV2(FORMAT_IDS));
    const first = (await pool.query(create, [intro.id, doc, META, 0, TEST_ACTOR_ID])).rows[0];
    expect(first).toMatchObject({ status: "working", client_intro_id: intro.id, case_id: null });
    await expect(pool.query(create, [intro.id, doc, META, 0, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "STALE_HEAD" });
    const second = (await pool.query(create, [intro.id, doc, META, 1, TEST_ACTOR_ID])).rows[0];
    expect((await pool.query("select status from public.revision where id = $1", [first.id])).rows[0].status).toBe("superseded");
    expect(await introRow(client.id)).toMatchObject({ head_revision_id: second.id, head_version: 2 });
    const created = (await eventsOf(intro.id)).filter((e) => e.type === "revision_created");
    expect(created.map((e) => e.revision_id)).toEqual([first.id, second.id]);
    // A case history document is refused, and so is an unknown intro.
    const caseDoc = JSON.stringify({ ...clientIntroV2(FORMAT_IDS), kind: "case_history" });
    await expect(pool.query(create, [intro.id, caseDoc, META, 2, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(pool.query(create, [UNKNOWN_ID, doc, META, 0, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "NOT_FOUND" });
  });

  it("gives revision.client_intro_id its foreign key", async () => {
    await expect(
      inRolledBackTx(
        `insert into public.revision (client_intro_id, generated_doc, doc, schema_version, created_by) values ($1, '{"schemaVersion":2}', '{"schemaVersion":2}', 2, $2)`,
        [UNKNOWN_ID, TEST_ACTOR_ID],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  describe("RLS lockout", () => {
    const browser = () =>
      createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

    it.each(["client_intro", "client_event"])("the browser key is refused reading %s", async (table) => {
      const { data, error } = await browser().from(table).select("*");
      expect(data).toBeNull();
      expect(error?.code).toBe("42501");
    });

    it.each(
      (["anon", "authenticated", "service_role"] as const).flatMap((role) => [
        [role, `insert into public.client_intro (client_id, created_by) values ('${UNKNOWN_ID}', '${TEST_ACTOR_ID}')`],
        [role, `update public.client_intro set head_version = 1`],
        [role, `insert into public.client_event (client_intro_id, actor_id, type) values ('${UNKNOWN_ID}', '${TEST_ACTOR_ID}', 'x')`],
      ]),
    )("%s gets permission denied on %s", async (role, sql) => {
      await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
    });

    it.each(["anon", "authenticated"])("%s gets permission denied reading and calling the intro functions", async (role) => {
      await expect(inRolledBackTx("select * from public.client_intro", [], role)).rejects.toMatchObject({ code: "42501" });
      await expect(inRolledBackTx("select * from public.client_event", [], role)).rejects.toMatchObject({ code: "42501" });
      await expect(inRolledBackTx(`select public.create_client_intro('${UNKNOWN_ID}', '${TEST_ACTOR_ID}')`, [], role)).rejects.toMatchObject({ code: "42501" });
      await expect(
        inRolledBackTx(`select public.transition_client_intro('${UNKNOWN_ID}', 'generate', 'draft', 'generating', '${TEST_ACTOR_ID}')`, [], role),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("start rule and the generate job (Story 3.11)", () => {
  it("happy path: a new client with 3 images ends with its intro Da approvare, a working revision in every format and 4 client events", async () => {
    const client = await clientWith(3);
    const started = await start(client.id);
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value).toMatchObject({ outcome: "started" });
    if (started.value.outcome !== "started") return;
    expect(await introRow(client.id)).toMatchObject({ status: "generating" });

    const { outcome } = await runHandler(started.value.jobId);
    expect(outcome).toEqual({ ok: true, value: undefined });

    const row = await introRow(client.id);
    expect(row).toMatchObject({ status: "in_review", head_version: 1 });
    const revision = (await pool.query("select status, client_intro_id, manifest, doc, generated_doc, model from public.revision where id = $1", [row!.head_revision_id])).rows[0];
    expect(revision).toMatchObject({ status: "working", client_intro_id: row!.id, model: null, manifest: { testDraft: true, assetIds: client.imageIds } });
    expect(revision.doc).toEqual(revision.generated_doc);
    expect(revision.doc).toMatchObject({ kind: "client_intro", template: "mac-client@1" });
    expect(Object.keys(revision.doc.formats).sort()).toEqual([...FORMAT_IDS].sort());
    expect(JSON.stringify(revision.doc)).toContain(TEST_DRAFT_MARKER);
    expect(JSON.stringify(revision.doc)).not.toContain(client.name);

    const events = await eventsOf(row!.id);
    expect(events.map((e) => [e.type, e.data.event ?? null])).toEqual([
      ["client_intro_created", null],
      ["transition", "generate"],
      ["revision_created", null],
      ["transition", "generation_succeeded"],
    ]);

    // The subject reads serve the intro.
    const caseStudy = await import("@/modules/case-study");
    expect(await caseStudy.getEditableRevision({ kind: "client_intro", id: row!.id })).toMatchObject({ ok: true, value: { id: row!.head_revision_id } });
    expect(await caseStudy.getLiveRevision({ kind: "client_intro", id: row!.id })).toEqual({ ok: true, value: null });
    expect(await caseStudy.getClientIntro(client.id)).toMatchObject({ ok: true, value: { id: row!.id, status: "in_review" } });

    // The toast's read: the intro is ready for the person whose save started it.
    const ready = await caseStudy.listReadyDrafts(await actor(), { since: new Date(Date.now() - 60_000).toISOString() });
    expect(ready.ok && ready.value.find((d) => d.kind === "client_intro" && d.id === client.id)).toMatchObject({ name: client.name });
  });

  it("few images: NO_CLIENT_IMAGES, no intro row, no job", async () => {
    const client = await clientWith(1, 2);
    // A PDF and a second image's worth of files, but one image: the gate counts images.
    expect(await start(client.id)).toMatchObject({ ok: false, error: { code: "NO_CLIENT_IMAGES" } });
    expect(await introRow(client.id)).toBeUndefined();
    expect((await pool.query("select count(*)::int as n from public.job where kind = 'generate' and payload->>'subject' = 'client_intro' and subject_id in (select id from public.client_intro where client_id = $1)", [client.id])).rows[0].n).toBe(0);
  });

  it("a double save enqueues one job", async () => {
    const client = await clientWith(2);
    const [a, b] = await Promise.all([start(client.id), start(client.id)]);
    const jobIds = [a, b].map((r) => (r.ok && r.value.outcome === "started" ? r.value.jobId : r.ok ? "unchanged" : r.error.code));
    // Either both got the same live job, or the second already found the intro generating.
    expect(new Set(jobIds.filter((id) => id !== "unchanged")).size).toBe(1);
    const row = await introRow(client.id);
    expect(row?.status).toBe("generating");
    expect((await pool.query("select count(*)::int as n from public.job where subject_id = $1", [row!.id])).rows[0].n).toBe(1);
  });

  it("already drafted: saving again starts nothing", async () => {
    const client = await clientWith(2);
    const started = await start(client.id);
    if (!started.ok || started.value.outcome !== "started") throw new Error("setup start failed");
    await runHandler(started.value.jobId);
    expect(await start(client.id)).toMatchObject({ ok: true, value: { outcome: "unchanged", status: "in_review" } });
    const row = await introRow(client.id);
    expect((await pool.query("select count(*)::int as n from public.job where subject_id = $1", [row!.id])).rows[0].n).toBe(1);
  });

  it("worker fails: a failed revision write is retried; after the last attempt the intro is back in Bozza with a generation_failed event, and a new save retries", async () => {
    const client = await clientWith(2);
    const started = await start(client.id);
    if (!started.ok || started.value.outcome !== "started") throw new Error("setup start failed");
    const caseStudy = await import("@/modules/case-study");
    const failing = {
      intro: {
        getIntro: caseStudy.getClientIntroById,
        getClient: caseStudy.getClient,
        listClientAssets: caseStudy.listClientAssets,
        transitionIntro: caseStudy.transitionIntro,
        createIntroWorkingRevision: async () => ({ ok: false as const, error: { code: "REVISION_WRITE_FAILED", message: "down" } }),
      },
    };
    const { handler, job, outcome } = await runHandler(started.value.jobId, failing);
    expect(outcome).toMatchObject({ ok: false, error: { code: "REVISION_WRITE_FAILED", retryable: true } });
    expect((await introRow(client.id))?.status).toBe("generating");

    await handler.onPermanentFailure!(job as never);
    const row = await introRow(client.id);
    expect(row).toMatchObject({ status: "draft", head_revision_id: null });
    expect((await eventsOf(row!.id)).at(-1)).toMatchObject({ type: "transition", data: { event: "generation_failed", from: "generating", to: "draft" } });

    // The runner marks the job failed for good (as postgres: the job table's own functions need a lease).
    await pool.query(
      "update public.job set status = 'failed', attempts = max_attempts, locked_until = null, finished_at = now(), error = '{\"code\":\"REVISION_WRITE_FAILED\",\"message\":\"down\"}' where id = $1",
      [started.value.jobId],
    );

    // Salva on a Bozza intro tries again, with a new job.
    const again = await start(client.id);
    if (!again.ok || again.value.outcome !== "started") throw new Error("retry did not start");
    expect(again.value.jobId).not.toBe(started.value.jobId);
    expect((await jobOf(again.value.jobId)).status).toBe("queued");
    expect((await introRow(client.id))?.status).toBe("generating");
  });
});
