// Story 4.12b: the order of a client's cases (`client_case_order`, `set_client_case_order`) and
// the module's `setClientCaseOrder` / `listClientCasesInOrder` against the local Supabase stack.
// Run with `npm run test:db`. Clients and cases are never deleted, so every test uses its own client.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import { createTestClient } from "../helpers/db-clients";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 2 });
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [TEST_ACTOR_ID]);
});

afterAll(async () => {
  await pool.end();
});

async function actor() {
  const { getActor } = await import("@/modules/access");
  const result = await getActor();
  if (!result.ok) throw new Error(`signed-in test actor did not resolve: ${result.error.code}`);
  return result.value;
}

const caseStudy = () => import("@/modules/case-study");

/** A committed case of `clientId`; walked to Approvato through the repository's transitions when `approved`. */
async function caseOf(clientId: string, name: string, approved = true) {
  const { create } = await caseStudy();
  const created = await create(await actor(), { name, clientId, year: 2026, businessLines: ["branding"] });
  if (!created.ok) throw new Error(`setup create failed: ${created.error.code}`);
  if (approved) {
    const { createSupabaseCaseStudyRepository } = await import("@/modules/case-study/adapters/supabase/case-study-repository");
    const repo = createSupabaseCaseStudyRepository();
    for (const [event, from, to] of [
      ["generate", "draft", "generating"],
      ["generation_succeeded", "generating", "in_review"],
      ["approve", "in_review", "approved"],
    ] as const) {
      const moved = await repo.transition({ caseId: created.value.id, event, from, to, actorId: TEST_ACTOR_ID });
      if (!moved.ok) throw new Error(`setup ${event} failed: ${moved.error.code}`);
    }
  }
  return created.value.id;
}

const savedOf = async (clientId: string) =>
  ((await pool.query("select case_ids from public.client_case_order where client_id = $1", [clientId])).rows[0]?.case_ids ?? null) as string[] | null;

async function listedIds(clientId: string) {
  const { listClientCasesInOrder } = await caseStudy();
  const listed = await listClientCasesInOrder(clientId);
  if (!listed.ok) throw new Error(`list failed: ${listed.error.code}`);
  return listed.value.map((c) => c.id);
}

describe("set_client_case_order and listClientCasesInOrder (Story 4.12b)", () => {
  it("lists newest created first with no saved order, then follows the saved one", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const a = await caseOf(client.id, "A");
    const b = await caseOf(client.id, "B");
    const c = await caseOf(client.id, "C");
    await caseOf(client.id, "Draft", false);
    expect(await listedIds(client.id)).toEqual([c, b, a]);

    const { setClientCaseOrder } = await caseStudy();
    expect(await setClientCaseOrder(await actor(), { clientId: client.id, caseIds: [a, c, b] })).toEqual({ ok: true, value: { clientId: client.id, caseIds: [a, c, b] } });
    expect(await savedOf(client.id)).toEqual([a, c, b]);
    expect(await listedIds(client.id)).toEqual([a, c, b]);

    // Saved again: replaced, not added to.
    expect((await setClientCaseOrder(await actor(), { clientId: client.id, caseIds: [b, a, c] })).ok).toBe(true);
    expect(await savedOf(client.id)).toEqual([b, a, c]);
  });

  it("puts a case approved later at the end and skips a deleted one", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const a = await caseOf(client.id, "A");
    const b = await caseOf(client.id, "B");
    const { setClientCaseOrder } = await caseStudy();
    expect((await setClientCaseOrder(await actor(), { clientId: client.id, caseIds: [a, b] })).ok).toBe(true);
    const c = await caseOf(client.id, "C");
    expect(await listedIds(client.id)).toEqual([a, b, c]);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [b]);
    expect(await listedIds(client.id)).toEqual([a, c]);
  });

  it("refuses another client's case, an unknown or deleted case, a repeat and an unknown client, writing nothing", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const other = await createTestClient(pool, TEST_ACTOR_ID);
    const mine = await caseOf(client.id, "Mine", false);
    const theirs = await caseOf(other.id, "Theirs", false);
    const gone = await caseOf(client.id, "Gone", false);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [gone]);
    const { setClientCaseOrder } = await caseStudy();
    const codeOf = async (input: unknown) => {
      const result = await setClientCaseOrder(await actor(), input);
      return result.ok ? "ok" : result.error.code;
    };
    expect(await codeOf({ clientId: client.id, caseIds: [mine, theirs] })).toBe("INVALID_INPUT");
    expect(await codeOf({ clientId: client.id, caseIds: [mine, UNKNOWN_ID] })).toBe("INVALID_INPUT");
    expect(await codeOf({ clientId: client.id, caseIds: [mine, gone] })).toBe("INVALID_INPUT");
    expect(await codeOf({ clientId: UNKNOWN_ID, caseIds: [] })).toBe("CLIENT_NOT_FOUND");
    expect(await savedOf(client.id)).toBeNull();
    // A repeat, straight to the function (the use case refuses it before).
    await expect(pool.query("select public.set_client_case_order($1, $2, $3)", [client.id, [mine, mine], TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(pool.query("select public.set_client_case_order($1, array[null]::uuid[], $2)", [client.id, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    expect(await savedOf(client.id)).toBeNull();
  });

  it("refuses a deleted client", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const mine = await caseOf(client.id, "Mine", false);
    await pool.query("update public.client set deleted_at = now() where id = $1", [client.id]);
    await expect(pool.query("select public.set_client_case_order($1, $2, $3)", [client.id, [mine], TEST_ACTOR_ID])).rejects.toMatchObject({ message: "CLIENT_NOT_FOUND" });
  });

  it("changes no case and no revision", async () => {
    const client = await createTestClient(pool, TEST_ACTOR_ID);
    const a = await caseOf(client.id, "A");
    const b = await caseOf(client.id, "B");
    const snapshot = async () =>
      (await pool.query("select id, updated_at, head_version, head_revision_id from public.case_study where client_id = $1 order by id", [client.id])).rows;
    const before = await snapshot();
    const { setClientCaseOrder } = await caseStudy();
    expect((await setClientCaseOrder(await actor(), { clientId: client.id, caseIds: [a, b] })).ok).toBe(true);
    expect(await snapshot()).toEqual(before);
  });
});

describe("client_case_order lockout", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  it("the browser key is refused reading the table and calling the writer", async () => {
    const read = await browser().from("client_case_order").select("*");
    expect(read.data).toBeNull();
    expect(read.error?.code).toBe("42501");
    const call = await browser().rpc("set_client_case_order", { p_client_id: UNKNOWN_ID, p_case_ids: [], p_actor_id: TEST_ACTOR_ID });
    expect(call.data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(call.error?.code);
  });

  it("the service role may read but not write the table", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      await client.query("select * from public.client_case_order limit 1");
      await expect(
        client.query("insert into public.client_case_order (client_id, case_ids, updated_by) values ($1, '{}', $2)", [UNKNOWN_ID, TEST_ACTOR_ID]),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });
});
