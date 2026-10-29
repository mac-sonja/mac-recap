// Story 3.7a: the generate job end to end against the local Supabase stack, through the
// real case-study, material and jobs functions (no UI, no worker loop, no LLM): the
// action's steps (gate, manifest, enqueue, generate transition), then the handler.
// Run with `npm run test:db`. Cases are never deleted, so every test uses its own case.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import { createTestClient } from "../helpers/db-clients";
import { generateInputHash, TEST_DRAFT_MARKER } from "@/modules/generation";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const dbUrl = process.env.SUPABASE_DB_URL as string;

const CREATE_ASSET = "select (public.create_asset($1, $2, 'image', 'f.png', 'image/png', 10, $3, $4)).id";

let pool: pg.Pool;
let clientId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: dbUrl, max: 4 });
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [TEST_ACTOR_ID]);
  clientId = (await createTestClient(pool, TEST_ACTOR_ID)).id;
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

async function createCase() {
  const caseStudy = await import("@/modules/case-study");
  const created = await caseStudy.create(await actor(), { name: "Generate", clientId, year: 2026, businessLines: ["branding"] });
  if (!created.ok) throw new Error(`setup create failed: ${created.error.code}`);
  return created.value;
}

async function addAsset(caseId: string) {
  const id = randomUUID();
  await pool.query(CREATE_ASSET, [id, caseId, `cases/${caseId}/assets/${id}/original.png`, TEST_ACTOR_ID]);
  return id;
}

/** The action's steps after the gate: manifest, enqueue (idempotent), `generate` transition. */
async function press(caseId: string) {
  const [caseStudy, material, jobs] = await Promise.all([import("@/modules/case-study"), import("@/modules/material"), import("@/modules/jobs")]);
  const found = await caseStudy.get(caseId);
  if (!found.ok) throw new Error(found.error.code);
  const manifest = await material.buildManifest(caseId);
  if (!manifest.ok) throw new Error(manifest.error.code);
  const job = await jobs.enqueue({
    kind: "generate",
    subjectId: caseId,
    inputHash: generateInputHash(caseId, found.value.headVersion, manifest.value),
    payload: { baseHeadVersion: found.value.headVersion, manifest: manifest.value },
  });
  if (!job.ok) throw new Error(job.error.code);
  const moved = await caseStudy.transition(caseId, "generate", await actor());
  return { job: job.value, moved };
}

async function runHandler(job: { id: string; subjectId: string; payload: Record<string, unknown> }) {
  const { generateHandler } = await import("@/modules/generation/worker");
  const { getSystemActor } = await import("@/modules/access");
  const system = await getSystemActor();
  if (!system.ok) throw new Error(system.error.code);
  const handler = generateHandler({ getSystemActor: async () => system });
  return { handler, outcome: await handler.run(job as never, new AbortController().signal) };
}

const caseRow = async (caseId: string) =>
  (await pool.query("select status, head_revision_id, head_version from public.case_study where id = $1", [caseId])).rows[0];

describe("generate job against the real database (Story 3.7a)", () => {
  it("draft with material: the case ends in in_review with a new working head revision, the manifest and a job_ok event", async () => {
    const created = await createCase();
    const assetId = await addAsset(created.id);
    const { job, moved } = await press(created.id);
    expect(moved.ok).toBe(true);
    expect((await caseRow(created.id)).status).toBe("generating");

    const { outcome } = await runHandler(job);
    expect(outcome).toEqual({ ok: true, value: undefined });

    const row = await caseRow(created.id);
    expect(row).toMatchObject({ status: "in_review", head_version: 1 });
    const revision = (await pool.query("select status, manifest, generated_doc, doc, model from public.revision where id = $1", [row.head_revision_id])).rows[0];
    expect(revision).toMatchObject({ status: "working", model: null });
    expect(revision.manifest.assets).toEqual([{ id: assetId, sizeBytes: 10, contentType: "image/png" }]);
    expect(JSON.stringify(revision.doc)).toContain(TEST_DRAFT_MARKER);
    expect(revision.doc).toEqual(revision.generated_doc);
    const events = (await pool.query("select type, revision_id from public.case_event where case_id = $1 order by at, id", [created.id])).rows.map((e) => e.type);
    expect(events).toEqual(expect.arrayContaining(["transition", "revision_created", "job_ok"]));
  });

  it("a second press while the job is live returns the same job and the second transition is refused", async () => {
    const created = await createCase();
    await addAsset(created.id);
    const first = await press(created.id);
    const second = await press(created.id);
    expect(second.job.id).toBe(first.job.id);
    expect(second.moved).toMatchObject({ ok: false });
  });

  it("head moved after enqueue: the result is discarded and the case returns to draft", async () => {
    const created = await createCase();
    await addAsset(created.id);
    const { job } = await press(created.id);
    const caseStudy = await import("@/modules/case-study");
    const { caseHistoryV2 } = await import("@/modules/generation");
    const { FORMAT_IDS } = await import("@/modules/rendering");
    const bumped = await caseStudy.createWorkingRevision(await actor(), { caseId: created.id, doc: caseHistoryV2(FORMAT_IDS), expectedHeadVersion: 0 });
    expect(bumped.ok).toBe(true);

    const { outcome } = await runHandler(job);
    expect(outcome).toMatchObject({ ok: false, error: { code: "STALE_HEAD" } });
    expect(await caseRow(created.id)).toMatchObject({ status: "draft", head_version: 1 });
  });

  it("onPermanentFailure returns a generating case to draft", async () => {
    const created = await createCase();
    await addAsset(created.id);
    const { job } = await press(created.id);
    const { handler } = await runHandler({ ...job, payload: {} });
    await handler.onPermanentFailure?.(job);
    expect((await caseRow(created.id)).status).toBe("draft");
  });
});
