// Story 3.2: DB-level checks of the `rendition` table and `upsert_rendition`, the
// real rendition and storage adapters, `getRendition` and the rendition handler
// (real sharp, real DB and bucket) against the local Supabase stack. Run with
// `npm run test:db`. Asset, case and stored objects are never deleted, so every
// test works on its own fresh case and asset ids.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import type { Job } from "@/modules/jobs";
import { assetKey, renditionKey } from "@/modules/material/adapters/asset-key";
import { createSupabaseAdminClient } from "@/modules/material/adapters/supabase/admin";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseObjectStorage, MATERIAL_BUCKET } from "@/modules/material/adapters/supabase/object-storage";
import { createSupabaseRenditionRepository } from "@/modules/material/adapters/supabase/rendition-repository";
import { makeGetRendition } from "@/modules/material/application/get-rendition";
import { specHashOf } from "@/modules/material/application/spec-hash";
import { RENDITION_CONTENT_TYPES } from "@/modules/material/domain/rendition";
import { backfillRenditions, renditionHandler } from "@/modules/material/worker";
import { createTestClient } from "../helpers/db-clients";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";
const THUMB = specHashOf("image.thumb");
const DISPLAY = specHashOf("image.display");

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

async function signedInActor() {
  const { getActor } = await import("@/modules/access");
  const actor = await getActor();
  if (!actor.ok) throw new Error(`signed-in test actor did not resolve: ${actor.error.code}`);
  return actor.value;
}

async function createCase() {
  const { create } = await import("@/modules/case-study");
  const result = await create(await signedInActor(), { name: "Renditions", clientId, year: 2026, businessLines: ["branding"] });
  if (!result.ok) throw new Error(`setup create failed: ${result.error.code}`);
  return result.value;
}

/** A live asset row of a fresh case (no object stored). */
async function seedAsset(kind: "image" | "video" | "document" = "image") {
  const created = await createCase();
  const id = randomUUID();
  const contentType = kind === "image" ? "image/png" : kind === "video" ? "video/mp4" : "application/pdf";
  await pool.query("select public.create_asset($1, $2, $3, 'f', $4, 10, $5, $6)", [
    id,
    created.id,
    kind,
    contentType,
    assetKey(created.id, id, contentType),
    TEST_ACTOR_ID,
  ]);
  return { caseId: created.id, assetId: id, contentType };
}

const upsertSql = "select * from public.upsert_rendition($1, $2, $3, 'image/webp', 480, 320, 1234)";

describe("migration", () => {
  it("creates rendition with RLS on, no policies, and the (asset_id, spec_hash) key", async () => {
    const { rows } = await pool.query(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
         from pg_catalog.pg_class c where c.oid = 'public.rendition'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
    const { rows: key } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where conrelid = 'public.rendition'::regclass and contype in ('p', 'u')`,
    );
    expect(key.map((k) => k.def)).toEqual(["PRIMARY KEY (asset_id, spec_hash)"]);
  });

  it("has exactly the story's columns", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'rendition' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["asset_id", "content_type", "created_at", "height", "path", "size_bytes", "spec_hash", "width"]);
  });

  it("checks content_type against exactly RENDITION_CONTENT_TYPES", async () => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where conrelid = 'public.rendition'::regclass and conname = 'rendition_content_type_check'`,
    );
    expect([...rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...RENDITION_CONTENT_TYPES].sort());
  });

  it("upsert_rendition is security definer with an empty search_path, executable by service_role only", async () => {
    const { rows } = await pool.query(
      `select p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'upsert_rendition'`,
    );
    expect(rows).toEqual([{ definer: true, config: ['search_path=""'], service_role: true, anon: false, authenticated: false }]);
  });

  it("leaves the bucket's allowed types alone: WebP and MP4 are already allowed", async () => {
    const { rows } = await pool.query<{ types: string[] }>("select allowed_mime_types as types from storage.buckets where id = $1", [MATERIAL_BUCKET]);
    expect(rows[0].types).toEqual(expect.arrayContaining(["image/webp", "video/mp4"]));
  });
});

describe("upsert_rendition", () => {
  it("inserts a row, and a second call for the same (asset, spec) replaces it: one row", async () => {
    const { caseId, assetId } = await seedAsset();
    const path = renditionKey(caseId, assetId, THUMB, "webp");
    await pool.query(upsertSql, [assetId, THUMB, path]);
    await pool.query("select * from public.upsert_rendition($1, $2, $3, 'image/webp', 400, 300, 999)", [assetId, THUMB, path]);
    const { rows } = await pool.query("select spec_hash, path, width, height, size_bytes::int as size from public.rendition where asset_id = $1", [assetId]);
    expect(rows).toEqual([{ spec_hash: THUMB, path, width: 400, height: 300, size: 999 }]);
  });

  it("keeps one row per spec", async () => {
    const { caseId, assetId } = await seedAsset();
    await pool.query(upsertSql, [assetId, THUMB, renditionKey(caseId, assetId, THUMB, "webp")]);
    await pool.query(upsertSql, [assetId, DISPLAY, renditionKey(caseId, assetId, DISPLAY, "webp")]);
    const { rows } = await pool.query("select spec_hash from public.rendition where asset_id = $1 order by spec_hash", [assetId]);
    expect(rows.map((r) => r.spec_hash)).toEqual([THUMB, DISPLAY].sort());
  });

  it.each([
    ["another asset's key", (caseId: string) => renditionKey(caseId, UNKNOWN_ID, THUMB, "webp")],
    ["another spec hash", (caseId: string, assetId: string) => renditionKey(caseId, assetId, DISPLAY, "webp")],
    ["the original's key", (caseId: string, assetId: string) => assetKey(caseId, assetId, "image/png")],
    ["the wrong extension", (caseId: string, assetId: string) => renditionKey(caseId, assetId, THUMB, "mp4")],
  ])("refuses %s as path (RENDITION_PATH_INVALID), nothing written", async (_label, pathOf) => {
    const { caseId, assetId } = await seedAsset();
    await expect(pool.query(upsertSql, [assetId, THUMB, pathOf(caseId, assetId)])).rejects.toMatchObject({ code: "P0001", message: "RENDITION_PATH_INVALID" });
    const { rows } = await pool.query("select 1 from public.rendition where asset_id = $1", [assetId]);
    expect(rows).toEqual([]);
  });

  it("a soft-deleted asset → NOT_FOUND, nothing written", async () => {
    const { caseId, assetId } = await seedAsset();
    await pool.query("update public.asset set deleted_at = now() where id = $1", [assetId]);
    await expect(pool.query(upsertSql, [assetId, THUMB, renditionKey(caseId, assetId, THUMB, "webp")])).rejects.toMatchObject({
      code: "P0001",
      message: "NOT_FOUND",
    });
    const { rows } = await pool.query("select 1 from public.rendition where asset_id = $1", [assetId]);
    expect(rows).toEqual([]);
  });

  it("an unknown asset → NOT_FOUND", async () => {
    await expect(pool.query(upsertSql, [UNKNOWN_ID, THUMB, "x"])).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
  });

  const insertSql = (specHash: string, contentType: string, width: number, size: number) =>
    `insert into public.rendition (asset_id, spec_hash, path, content_type, width, height, size_bytes)
     values ($1, '${specHash}', 'x', '${contentType}', ${width}, 1, ${size})`;

  it.each([
    ["a malformed spec hash", insertSql("ABC", "image/webp", 1, 1)],
    ["a content type outside the list", insertSql("0123456789abcdef", "image/png", 1, 1)],
    ["a zero width", insertSql("0123456789abcdef", "image/webp", 0, 1)],
    ["an empty size", insertSql("0123456789abcdef", "image/webp", 1, 0)],
  ])("the table checks reject %s", async (_label, sql) => {
    const { assetId } = await seedAsset();
    await expect(inRolledBackTx(sql, [assetId])).rejects.toMatchObject({ code: "23514" });
  });

  it("the adapter maps rows and refusals", async () => {
    const { caseId, assetId } = await seedAsset();
    const repo = createSupabaseRenditionRepository();
    const path = renditionKey(caseId, assetId, THUMB, "webp");
    const saved = await repo.upsert({ assetId, specHash: THUMB, path, contentType: "image/webp", width: 480, height: 320, sizeBytes: 77 });
    expect(saved).toEqual({ ok: true, value: expect.objectContaining({ assetId, specHash: THUMB, path, width: 480, height: 320, sizeBytes: 77 }) });
    expect(await repo.get(assetId, THUMB)).toEqual(saved);
    expect(await repo.get(assetId, DISPLAY)).toEqual({ ok: true, value: null });
    expect(await repo.listForAsset(assetId)).toEqual({ ok: true, value: [expect.objectContaining({ specHash: THUMB })] });
    expect(await repo.listFor([assetId, UNKNOWN_ID], [THUMB])).toEqual({ ok: true, value: [expect.objectContaining({ specHash: THUMB })] });
    expect(await repo.listFor([assetId], [DISPLAY])).toEqual({ ok: true, value: [] });
    const refused = await repo.upsert({ assetId: UNKNOWN_ID, specHash: THUMB, path, contentType: "image/webp", width: 1, height: 1, sizeBytes: 1 });
    expect(refused).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("RLS and grants", () => {
  const statements = {
    select: "select * from public.rendition",
    insert: `insert into public.rendition (asset_id, spec_hash, path, content_type, width, height, size_bytes)
             values ('${UNKNOWN_ID}', '0123456789abcdef', 'x', 'image/webp', 1, 1, 1)`,
    update: "update public.rendition set width = 1",
    delete: "delete from public.rendition",
    upsert_rendition: `select public.upsert_rendition('${UNKNOWN_ID}', '0123456789abcdef', 'x', 'image/webp', 1, 1, 1)`,
  };

  it.each((["anon", "authenticated"] as const).flatMap((role) => Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const)))(
    "%s gets permission denied on %s",
    async (role, _verb, sql) => {
      await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
    },
  );

  it("the service role may read rendition but write it only through upsert_rendition", async () => {
    await inRolledBackTx("select * from public.rendition limit 1", [], "service_role");
    for (const verb of ["insert", "update", "delete"] as const) {
      await expect(inRolledBackTx(statements[verb], [], "service_role"), verb).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("the browser key is refused reading rendition and calling upsert_rendition", async () => {
    const browser = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const read = await browser.from("rendition").select("*");
    expect(read.data).toBeNull();
    expect(read.error?.code).toBe("42501");
    const call = await browser.rpc("upsert_rendition", {
      p_asset_id: UNKNOWN_ID,
      p_spec_hash: THUMB,
      p_path: "x",
      p_content_type: "image/webp",
      p_width: 1,
      p_height: 1,
      p_size_bytes: 1,
    });
    expect(call.data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(call.error?.code);
  });
});

describe("storage adapter: rendition objects", () => {
  const storage = () => createSupabaseObjectStorage();

  it("uploads to a rendition key (replacing on retry), downloads it, and signs it by key", async () => {
    const { caseId, assetId } = await seedAsset();
    const key = renditionKey(caseId, assetId, THUMB, "webp");
    const first = new Uint8Array(await sharp({ create: { width: 4, height: 2, channels: 3, background: "#00f" } }).webp().toBuffer());
    expect(await storage().upload(key, first, "image/webp")).toEqual({ ok: true, value: undefined });
    const second = new Uint8Array(await sharp({ create: { width: 6, height: 2, channels: 3, background: "#0f0" } }).webp().toBuffer());
    expect(await storage().upload(key, second, "image/webp")).toEqual({ ok: true, value: undefined });
    expect(await storage().download(key)).toEqual({ ok: true, value: second });

    const signed = await storage().presignKeys([key], 900);
    if (!signed.ok || signed.value[0] === null) throw new Error("not signed");
    const fetched = await fetch(signed.value[0]);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/webp");
  });

  it("refuses to write an original's key, and a missing object downloads as null", async () => {
    const { caseId, assetId } = await seedAsset();
    const original = assetKey(caseId, assetId, "image/png");
    expect(await storage().upload(original, new Uint8Array([1]), "image/png")).toMatchObject({ ok: false, error: { code: "STORAGE_WRITE_REFUSED" } });
    expect(await storage().head({ caseId, assetId, contentType: "image/png" })).toEqual({ ok: true, value: null });
    expect(await storage().download(original)).toEqual({ ok: true, value: null });
  });
});

describe("the rendition handler and getRendition, end to end (real sharp, DB and bucket)", () => {
  const getRendition = () =>
    makeGetRendition({
      assets: createSupabaseAssetRepository(),
      renditions: createSupabaseRenditionRepository(),
      storage: createSupabaseObjectStorage(),
      cases: { get: async (id: unknown) => (await import("@/modules/case-study")).get(id), recordEvent: async () => ({ ok: true, value: {} }) },
    });

  const job = (assetId: string, caseId: string): Job => ({
    id: randomUUID(),
    kind: "rendition",
    subjectId: assetId,
    inputHash: "h",
    payload: { caseId },
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    lockedUntil: new Date(Date.now() + 600_000).toISOString(),
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
  });

  it("makes thumb and display from a stored 1200×800 PNG; a rerun writes nothing new; the original is untouched", async () => {
    const { caseId, assetId } = await seedAsset("image");
    const originalBytes = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#c33" } }).png().toBuffer();
    const originalKey = assetKey(caseId, assetId, "image/png");
    const { error } = await createSupabaseAdminClient().storage.from(MATERIAL_BUCKET).upload(originalKey, originalBytes, { contentType: "image/png" });
    expect(error).toBeNull();

    expect(await getRendition()(assetId, "image.thumb")).toMatchObject({ ok: false, error: { code: "RENDITION_NOT_READY" } });

    const handler = renditionHandler();
    expect(await handler.run(job(assetId, caseId), new AbortController().signal)).toEqual({ ok: true, value: undefined });
    const { rows } = await pool.query<{ spec_hash: string; width: number; height: number; path: string; created_at: Date }>(
      "select spec_hash, width, height, path, created_at from public.rendition where asset_id = $1 order by width",
      [assetId],
    );
    expect(rows.map(({ spec_hash, width, height, path }) => ({ spec_hash, width, height, path }))).toEqual([
      { spec_hash: THUMB, width: 480, height: 320, path: renditionKey(caseId, assetId, THUMB, "webp") },
      { spec_hash: DISPLAY, width: 1200, height: 800, path: renditionKey(caseId, assetId, DISPLAY, "webp") },
    ]);

    const link = await getRendition()(assetId, "image.thumb");
    expect(link).toEqual({ ok: true, value: { url: expect.any(String), width: 480, height: 320, contentType: "image/webp" } });
    if (link.ok) {
      const fetched = await fetch(link.value.url);
      expect(fetched.status).toBe(200);
      expect((await sharp(new Uint8Array(await fetched.arrayBuffer())).metadata()).width).toBe(480);
    }

    // A retry finds both rows and writes nothing.
    expect(await handler.run(job(assetId, caseId), new AbortController().signal)).toEqual({ ok: true, value: undefined });
    const { rows: again } = await pool.query<{ created_at: Date }>("select created_at from public.rendition where asset_id = $1 order by width", [assetId]);
    expect(again.map((r) => r.created_at.getTime())).toEqual(rows.map((r) => r.created_at.getTime()));

    // The original is byte-identical.
    const original = await createSupabaseObjectStorage().download(originalKey);
    expect(original).toEqual({ ok: true, value: new Uint8Array(originalBytes) });

    // A soft-deleted asset is NOT_FOUND, renditions or not.
    await pool.query("update public.asset set deleted_at = now() where id = $1", [assetId]);
    expect(await getRendition()(assetId, "image.thumb")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("getRendition of a live asset whose case is soft-deleted → NOT_FOUND", async () => {
    const { caseId, assetId } = await seedAsset("image");
    await pool.query(upsertSql, [assetId, THUMB, renditionKey(caseId, assetId, THUMB, "webp")]);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [caseId]);
    expect(await getRendition()(assetId, "image.thumb")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("an undecodable stored image fails for good with no rows", async () => {
    const { caseId, assetId } = await seedAsset("image");
    const { error } = await createSupabaseAdminClient()
      .storage.from(MATERIAL_BUCKET)
      .upload(assetKey(caseId, assetId, "image/png"), new TextEncoder().encode("not a png"), { contentType: "image/png" });
    expect(error).toBeNull();
    const outcome = await renditionHandler().run(job(assetId, caseId), new AbortController().signal);
    expect(outcome).toMatchObject({ ok: false, error: { code: "RENDITION_UNDECODABLE", retryable: false } });
    const { rows } = await pool.query("select 1 from public.rendition where asset_id = $1", [assetId]);
    expect(rows).toEqual([]);
  });
});

describe("the renditions backfill (dev tooling)", () => {
  it("lists live images/videos of live cases only, and enqueues a job only for those missing a current row", async () => {
    const image = await seedAsset("image");
    const done = await seedAsset("image");
    const video = await seedAsset("video");
    const document = await seedAsset("document");
    const removed = await seedAsset("image");
    const deletedCase = await seedAsset("video");
    await pool.query(upsertSql, [done.assetId, THUMB, renditionKey(done.caseId, done.assetId, THUMB, "webp")]);
    await pool.query(upsertSql, [done.assetId, DISPLAY, renditionKey(done.caseId, done.assetId, DISPLAY, "webp")]);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [removed.assetId]);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [deletedCase.caseId]);

    const listed: string[] = [];
    let after: string | null = null;
    const repo = createSupabaseAssetRepository();
    for (;;) {
      const page = await repo.listLiveMediaPage(after, 500);
      if (!page.ok) throw new Error(page.error.code);
      listed.push(...page.value.map((a) => a.id));
      if (page.value.length < 500) break;
      after = page.value[page.value.length - 1].id;
    }
    expect(listed).toEqual([...listed].sort());
    expect(listed).toEqual(expect.arrayContaining([image.assetId, done.assetId, video.assetId]));
    for (const gone of [document.assetId, removed.assetId, deletedCase.assetId]) expect(listed).not.toContain(gone);

    const summary = await backfillRenditions();
    expect(summary.ok).toBe(true);
    const { rows } = await pool.query<{ subject_id: string; status: string; payload: unknown }>(
      "select subject_id, status, payload from public.job where kind = 'rendition' and subject_id = any($1::uuid[])",
      [[image.assetId, done.assetId, video.assetId, document.assetId, removed.assetId, deletedCase.assetId]],
    );
    expect(rows.map((r) => r.subject_id).sort()).toEqual([image.assetId, video.assetId].sort());
    expect(rows.every((r) => r.status === "queued")).toBe(true);
    expect(rows.find((r) => r.subject_id === image.assetId)?.payload).toEqual({ caseId: image.caseId });

    // Idempotent: a second run reuses the live jobs.
    expect((await backfillRenditions()).ok).toBe(true);
    const { rows: again } = await pool.query("select 1 from public.job where kind = 'rendition' and subject_id = any($1::uuid[])", [
      [image.assetId, video.assetId],
    ]);
    expect(again).toHaveLength(2);
  });
});
