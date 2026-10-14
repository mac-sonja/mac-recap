// DB-level checks of the `asset` migration, `create_asset`, `restore_asset` (only
// `removeAsset`'s compensation since Story 2.8), `has_material`, the details form
// and the real material adapters against the local Supabase stack. Run with
// `npm run test:db`. Asset and case rows can never be deleted, so every test
// works on its own fresh case.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseDetailsFormRepository } from "@/modules/material/adapters/supabase/details-form-repository";
import { ALLOWED_CONTENT_TYPES, ASSET_KINDS, MAX_ASSETS_PER_CASE } from "@/modules/material/domain/files";
import type { ObjectStorage, StoredObject } from "@/modules/material/ports/object-storage";
import { err } from "@/shared/result";

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
const CREATE_ASSET = "select (public.create_asset($1, $2, 'image', 'f.png', 'image/png', 10, $3, $4)).id";

let pool: pg.Pool;

beforeAll(async () => {
  // Enough connections for the concurrent create_asset calls.
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 6 });
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

const loadCaseStudy = () => import("@/modules/case-study");
const loadAccess = () => import("@/modules/access");

async function devActor() {
  const { getActor } = await loadAccess();
  const actor = await getActor();
  if (!actor.ok) throw new Error(`dev actor did not resolve: ${actor.error.code}`);
  return actor.value;
}

async function createCase() {
  const { create } = await loadCaseStudy();
  const result = await create(await devActor(), { name: "Material", client: "Acme", year: 2026 });
  if (!result.ok) throw new Error(`setup create failed: ${result.error.code}`);
  return result.value;
}

const keyFor = (caseId: string, assetId: string) => `cases/${caseId}/assets/${assetId}/original.png`;

/** Inserts `n` live assets through `create_asset`; returns their ids. */
async function seedAssets(caseId: string, n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    await pool.query(CREATE_ASSET, [id, caseId, keyFor(caseId, id), DEV_ACTOR_ID]);
    ids.push(id);
  }
  return ids;
}

async function liveCount(caseId: string) {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from public.asset where case_id = $1 and deleted_at is null",
    [caseId],
  );
  return rows[0].n;
}

async function assetEvents(caseId: string) {
  const { rows } = await pool.query<{ type: string; actor_id: string; data: unknown }>(
    "select type, actor_id, data from public.case_event where case_id = $1 and type like 'asset_%' order by at, type",
    [caseId],
  );
  return rows;
}

const hasMaterialSql = async (caseId: string) => {
  const { rows } = await pool.query<{ has: boolean }>("select public.has_material($1) as has", [caseId]);
  return rows[0].has;
};

describe("create_asset", () => {
  it("inserts a row with the given id, key and actor", async () => {
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    const { rows } = await pool.query(
      "select case_id, kind, content_type, size_bytes::int as size, s3_key, created_by, deleted_at from public.asset where id = $1",
      [id],
    );
    expect(rows).toEqual([
      {
        case_id: created.id,
        kind: "image",
        content_type: "image/png",
        size: 10,
        s3_key: keyFor(created.id, id),
        created_by: DEV_ACTOR_ID,
        deleted_at: null,
      },
    ]);
  });

  it(`caps at ${MAX_ASSETS_PER_CASE} non-deleted assets; removed ones don't count`, async () => {
    const created = await createCase();
    const ids = await seedAssets(created.id, MAX_ASSETS_PER_CASE);
    const extra = randomUUID();
    await expect(pool.query(CREATE_ASSET, [extra, created.id, keyFor(created.id, extra), DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "P0001",
      message: "FILE_LIMIT_REACHED",
    });
    await pool.query("update public.asset set deleted_at = now() where id = $1", [ids[0]]);
    await expect(pool.query(CREATE_ASSET, [extra, created.id, keyFor(created.id, extra), DEV_ACTOR_ID])).resolves.toBeDefined();
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });

  it("lets exactly one of two concurrent calls take the 20th slot", async () => {
    const created = await createCase();
    await seedAssets(created.id, MAX_ASSETS_PER_CASE - 1);
    const [a, b] = [randomUUID(), randomUUID()];
    const results = await Promise.allSettled([
      pool.query(CREATE_ASSET, [a, created.id, keyFor(created.id, a), DEV_ACTOR_ID]),
      pool.query(CREATE_ASSET, [b, created.id, keyFor(created.id, b), DEV_ACTOR_ID]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "P0001", message: "FILE_LIMIT_REACHED" });
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });

  it("through the adapter, concurrent creates at 19 → one ok, one FILE_LIMIT_REACHED", async () => {
    const created = await createCase();
    await seedAssets(created.id, MAX_ASSETS_PER_CASE - 1);
    const repo = createSupabaseAssetRepository();
    const asset = (id: string) => ({
      id,
      caseId: created.id,
      kind: "document" as const,
      originalFileName: "brief.pdf",
      contentType: "application/pdf" as const,
      sizeBytes: 2048,
      createdBy: DEV_ACTOR_ID,
    });
    const results = await Promise.all([repo.create(asset(randomUUID())), repo.create(asset(randomUUID()))]);
    expect(results.map((r) => (r.ok ? "OK" : r.error.code)).sort()).toEqual(["FILE_LIMIT_REACHED", "OK"]);
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });

  it("the adapter builds the key from the content type and maps a duplicate id", async () => {
    const created = await createCase();
    const repo = createSupabaseAssetRepository();
    const id = randomUUID();
    const input = {
      id,
      caseId: created.id,
      kind: "document" as const,
      originalFileName: "brief.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const,
      sizeBytes: 2048,
      createdBy: DEV_ACTOR_ID,
    };
    const first = await repo.create(input);
    expect(first.ok).toBe(true);
    const { rows } = await pool.query("select s3_key from public.asset where id = $1", [id]);
    expect(rows).toEqual([{ s3_key: `cases/${created.id}/assets/${id}/original.docx` }]);
    const again = await repo.create(input);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("ASSET_ALREADY_CONFIRMED");
  });

  it("a repeated id at the cap raises ASSET_ALREADY_CONFIRMED, not FILE_LIMIT_REACHED", async () => {
    const created = await createCase();
    const [first] = await seedAssets(created.id, MAX_ASSETS_PER_CASE - 1);
    await seedAssets(created.id, 1);
    await expect(pool.query(CREATE_ASSET, [first, created.id, keyFor(created.id, first), DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "P0001",
      message: "ASSET_ALREADY_CONFIRMED",
    });

    const repo = createSupabaseAssetRepository();
    const again = await repo.create({
      id: first,
      caseId: created.id,
      kind: "image",
      originalFileName: "f.png",
      contentType: "image/png",
      sizeBytes: 10,
      createdBy: DEV_ACTOR_ID,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("ASSET_ALREADY_CONFIRMED");
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });

  it("raises NOT_FOUND for an unknown or soft-deleted case", async () => {
    const id = randomUUID();
    await expect(inRolledBackTx(CREATE_ASSET, [id, UNKNOWN_ID, keyFor(UNKNOWN_ID, id), DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "P0001",
      message: "NOT_FOUND",
    });
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    await expect(inRolledBackTx(CREATE_ASSET, [id, created.id, keyFor(created.id, id), DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "P0001",
      message: "NOT_FOUND",
    });
  });
});

describe("soft delete and its compensation (undoSoftDelete / restore_asset)", () => {
  it("removes, refuses a second removal, undoes the removal, then reports already live", async () => {
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    const repo = createSupabaseAssetRepository();
    expect(await repo.softDelete(created.id, id)).toEqual({ ok: true, value: true });
    expect(await repo.softDelete(created.id, id)).toEqual({ ok: true, value: false });
    expect(await liveCount(created.id)).toBe(0);
    expect(await repo.undoSoftDelete(created.id, id)).toEqual({ ok: true, value: true });
    expect(await repo.undoSoftDelete(created.id, id)).toEqual({ ok: true, value: false });
    expect(await liveCount(created.id)).toBe(1);
  });

  it("does not touch an asset of another case", async () => {
    const [a, b] = [await createCase(), await createCase()];
    const [id] = await seedAssets(a.id, 1);
    const repo = createSupabaseAssetRepository();
    expect(await repo.softDelete(b.id, id)).toEqual({ ok: true, value: false });
    const undone = await repo.undoSoftDelete(b.id, id);
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.error.code).toBe("NOT_FOUND");
    expect(await liveCount(a.id)).toBe(1);
  });

  it("restore_asset raises NOT_FOUND for a soft-deleted case and leaves the asset removed", async () => {
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [id]);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    await expect(pool.query("select public.restore_asset($1, $2)", [created.id, id])).rejects.toMatchObject({
      code: "P0001",
      message: "NOT_FOUND",
    });
    const result = await createSupabaseAssetRepository().undoSoftDelete(created.id, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    const { rows } = await pool.query("select deleted_at is not null as removed from public.asset where id = $1", [id]);
    expect(rows).toEqual([{ removed: true }]);
  });

  it("restore_asset racing a create at 19 live assets: exactly one takes the 20th slot", async () => {
    const created = await createCase();
    const [removed] = await seedAssets(created.id, 1);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [removed]);
    await seedAssets(created.id, MAX_ASSETS_PER_CASE - 1);
    const fresh = randomUUID();
    // pool.query checks out a separate connection for each call.
    const results = await Promise.allSettled([
      pool.query("select public.restore_asset($1, $2) as undone", [created.id, removed]),
      pool.query(CREATE_ASSET, [fresh, created.id, keyFor(created.id, fresh), DEV_ACTOR_ID]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "P0001", message: "FILE_LIMIT_REACHED" });
    if (results[0].status === "fulfilled") expect(results[0].value.rows).toEqual([{ undone: true }]);
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });

  it("undoSoftDelete re-checks the cap", async () => {
    const created = await createCase();
    const [first] = await seedAssets(created.id, 1);
    const repo = createSupabaseAssetRepository();
    await repo.softDelete(created.id, first);
    await seedAssets(created.id, MAX_ASSETS_PER_CASE);
    const result = await repo.undoSoftDelete(created.id, first);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FILE_LIMIT_REACHED");
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });
});

describe("listing assets", () => {
  it("listLive returns the case's live assets oldest first, leaving out removed ones and other cases'", async () => {
    const created = await createCase();
    const other = await createCase();
    const [first, removed, last] = await seedAssets(created.id, 3);
    await seedAssets(other.id, 1);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [removed]);

    const listed = await createSupabaseAssetRepository().listLive(created.id);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.map((a) => a.id)).toEqual([first, last]);
  });

  it("listLive breaks a created_at tie by id", async () => {
    const created = await createCase();
    const ids = await seedAssets(created.id, 3);
    await pool.query("update public.asset set created_at = '2026-10-13T10:00:00Z' where case_id = $1", [created.id]);
    const listed = await createSupabaseAssetRepository().listLive(created.id);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.map((a) => a.id)).toEqual([...ids].sort());
  });

  it("listLive returns [] for a case without files", async () => {
    const created = await createCase();
    expect(await createSupabaseAssetRepository().listLive(created.id)).toEqual({ ok: true, value: [] });
  });

  it("the listAssets use case reads through the real repository and case-study module (no S3: null URLs)", async () => {
    const caseStudy = await loadCaseStudy();
    const { makeListAssets } = await import("@/modules/material/application/list-assets");
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    const list = makeListAssets({
      assets: createSupabaseAssetRepository(),
      storage: null,
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
    });
    const result = await list({ caseId: created.id });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          id,
          kind: "image",
          originalFileName: "f.png",
          contentType: "image/png",
          sizeBytes: 10,
          createdAt: expect.any(String),
          thumbnailUrl: null,
        },
      ],
    });

    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    const gone = await list({ caseId: created.id });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("NOT_FOUND");
  });
});

describe("use cases against the real DB and case-study module (S3 stubbed)", () => {
  /** Real repository and case-study calls; storage answers HEAD from `objects`. */
  async function realDeps(objects: Map<string, StoredObject>) {
    const caseStudy = await loadCaseStudy();
    const storage: ObjectStorage = {
      presignUpload: async (target) => ({ ok: true, value: { url: "https://s3.test/", fields: { key: target.assetId } } }),
      presignDownload: async (target) => ({ ok: true, value: `https://s3.test/${target.assetId}` }),
      head: async (target) => ({ ok: true, value: objects.get(target.assetId) ?? null }),
    };
    return {
      assets: createSupabaseAssetRepository(),
      form: createSupabaseDetailsFormRepository(),
      storage,
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
      newId: randomUUID,
    };
  }

  it("confirm → remove writes the rows and one event each; status stays draft", async () => {
    const { makeConfirmUpload } = await import("@/modules/material/application/confirm-upload");
    const { makeRemoveAsset } = await import("@/modules/material/application/remove-asset");
    const actor = await devActor();
    const created = await createCase();
    const assetId = randomUUID();
    const deps = await realDeps(new Map([[assetId, { sizeBytes: 4096, contentType: "image/webp" }]]));

    const confirmed = await makeConfirmUpload(deps)(actor, {
      caseId: created.id,
      assetId,
      contentType: "image/webp",
      fileName: "hero.webp",
    });
    expect(confirmed.ok).toBe(true);
    expect(await makeRemoveAsset(deps)(actor, { caseId: created.id, assetId })).toEqual({ ok: true, value: undefined });

    const { rows } = await pool.query(
      "select kind, original_file_name, size_bytes::int as size, s3_key, deleted_at is not null as removed from public.asset where id = $1",
      [assetId],
    );
    expect(rows).toEqual([
      { kind: "image", original_file_name: "hero.webp", size: 4096, s3_key: `cases/${created.id}/assets/${assetId}/original.webp`, removed: true },
    ]);
    expect(await assetEvents(created.id)).toEqual([
      { type: "asset_uploaded", actor_id: actor.id, data: { assetId } },
      { type: "asset_removed", actor_id: actor.id, data: { assetId } },
    ]);
    const { rows: status } = await pool.query("select status from public.case_study where id = $1", [created.id]);
    expect(status).toEqual([{ status: "draft" }]);
  });

  it("remove whose event write fails: the asset is live again (undoSoftDelete) and the error is returned", async () => {
    const { makeRemoveAsset } = await import("@/modules/material/application/remove-asset");
    const actor = await devActor();
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    const real = await realDeps(new Map());
    const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
    const deps = { ...real, cases: { ...real.cases, recordEvent: async () => failure } };

    expect(await makeRemoveAsset(deps)(actor, { caseId: created.id, assetId })).toEqual(failure);
    expect(await liveCount(created.id)).toBe(1);
    expect(await hasMaterialSql(created.id)).toBe(true);
    expect(await assetEvents(created.id)).toEqual([]);
  });
});

describe("direct writes are rejected", () => {
  let assetId: string;

  beforeAll(async () => {
    const created = await createCase();
    [assetId] = await seedAssets(created.id, 1);
  });

  it("deleting an asset row", async () => {
    await expect(inRolledBackTx("delete from public.asset where id = $1", [assetId])).rejects.toThrow(/never deleted/);
  });

  it("truncating asset", async () => {
    await expect(inRolledBackTx("truncate public.asset")).rejects.toThrow(/never deleted/);
  });

  it.each([
    ["an unlisted content type", "update public.asset set content_type = 'application/zip' where id = $1"],
    ["an unknown kind", "update public.asset set kind = 'audio' where id = $1"],
    ["a size over 100 MB", "update public.asset set size_bytes = 104857601 where id = $1"],
    ["an empty size", "update public.asset set size_bytes = 0 where id = $1"],
  ])("the table checks reject %s", async (_label, sql) => {
    await expect(inRolledBackTx(sql, [assetId])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("schema guards", () => {
  it("enables RLS with no policies on asset", async () => {
    const { rows } = await pool.query<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls,
              (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
       from pg_catalog.pg_class c where c.oid = 'public.asset'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
  });

  const checkValues = async (column: string) => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
       where conrelid = 'public.asset'::regclass and contype = 'c'`,
    );
    const defs = rows.map(({ def }) => def).filter((def) => new RegExp(`\\b${column}\\b`).test(def));
    expect(defs).toHaveLength(1);
    return [...defs[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it("checks content_type against exactly the allowlist", async () => {
    expect((await checkValues("content_type")).sort()).toEqual([...ALLOWED_CONTENT_TYPES].sort());
  });

  it("checks kind against exactly ASSET_KINDS", async () => {
    expect(await checkValues("kind")).toEqual([...ASSET_KINDS]);
  });
});

describe("RLS lockout", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  it("the browser key is refused reading asset", async () => {
    const { data, error } = await browser().from("asset").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it.each([
    [
      "create_asset",
      {
        p_id: UNKNOWN_ID,
        p_case_id: UNKNOWN_ID,
        p_kind: "image",
        p_original_file_name: "x.png",
        p_content_type: "image/png",
        p_size_bytes: 1,
        p_s3_key: "x",
        p_actor_id: DEV_ACTOR_ID,
      },
    ],
    ["restore_asset", { p_case_id: UNKNOWN_ID, p_asset_id: UNKNOWN_ID }],
    ["has_material", { p_case_id: UNKNOWN_ID }],
  ])("the browser key is refused calling %s", async (fn, args) => {
    const { data, error } = await browser().rpc(fn as "restore_asset", args as never);
    expect(data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(error?.code);
  });

  const statements = {
    select: "select * from public.asset",
    insert: `insert into public.asset (case_id, kind, original_file_name, content_type, size_bytes, s3_key, created_by)
             values ('${UNKNOWN_ID}', 'image', 'x.png', 'image/png', 1, 'x', '${DEV_ACTOR_ID}')`,
    update: "update public.asset set deleted_at = now()",
    delete: "delete from public.asset",
    "create_asset": `select public.create_asset('${UNKNOWN_ID}', '${UNKNOWN_ID}', 'image', 'x.png', 'image/png', 1, 'x', '${DEV_ACTOR_ID}')`,
    "restore_asset": `select public.restore_asset('${UNKNOWN_ID}', '${UNKNOWN_ID}')`,
    has_material: `select public.has_material('${UNKNOWN_ID}')`,
  };
  const cases = (["anon", "authenticated"] as const).flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(cases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });
});

// has_material (Story 2.8: live assets only; pasted text and the taxonomy are retired).

describe("has_material", () => {
  it("none: no assets → false", async () => {
    const created = await createCase();
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseAssetRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  it("an unknown case → false", async () => {
    expect(await hasMaterialSql(UNKNOWN_ID)).toBe(false);
    expect(await createSupabaseAssetRepository().hasMaterial(UNKNOWN_ID)).toEqual({ ok: true, value: false });
  });

  it("one live asset → true", async () => {
    const created = await createCase();
    await seedAssets(created.id, 1);
    expect(await hasMaterialSql(created.id)).toBe(true);
    expect(await createSupabaseAssetRepository().hasMaterial(created.id)).toEqual({ ok: true, value: true });
  });

  it("only removed files: every asset soft-deleted → false", async () => {
    const created = await createCase();
    const ids = await seedAssets(created.id, 2);
    await pool.query("update public.asset set deleted_at = now() where id = any($1::uuid[])", [ids]);
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseAssetRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  it("a soft-deleted case with a live asset → false", async () => {
    const created = await createCase();
    await seedAssets(created.id, 1);
    expect(await hasMaterialSql(created.id)).toBe(true);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseAssetRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  it("only counts the given case", async () => {
    const [a, b] = [await createCase(), await createCase()];
    await seedAssets(a.id, 1);
    expect(await hasMaterialSql(b.id)).toBe(false);
  });

  it("keeps security invoker, search_path = '' and service-role-only execute", async () => {
    const { rows } = await pool.query(
      `select p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
       from pg_catalog.pg_proc p where p.oid = 'public.has_material(uuid)'::regprocedure`,
    );
    expect(rows).toEqual([{ definer: false, config: ['search_path=""'], service_role: true, anon: false, authenticated: false }]);
  });
});

describe("retired objects (Story 2.8)", () => {
  it("the pasted-text and taxonomy tables and functions are gone", async () => {
    const { rows: tables } = await pool.query(
      `select pg_catalog.to_regclass('public.text_item') as text_item,
              pg_catalog.to_regclass('public.material_term') as material_term,
              pg_catalog.to_regclass('public.taxonomy_term') as taxonomy_term`,
    );
    expect(tables).toEqual([{ text_item: null, material_term: null, taxonomy_term: null }]);
    const { rows: functions } = await pool.query(
      `select p.proname from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1::text[])`,
      [["set_material_terms", "case_material_terms", "text_item_touch_updated_at", "text_item_reject_delete", "taxonomy_term_reject_delete"]],
    );
    expect(functions).toEqual([]);
  });
});

describe("restore_asset after Story 2.8", () => {
  it("restore_asset stays, documented as compensation only", async () => {
    const { rows } = await pool.query(
      "select pg_catalog.obj_description('public.restore_asset(uuid, uuid)'::regprocedure, 'pg_proc') as comment",
    );
    expect(rows[0].comment).toMatch(/^Compensation only/);
  });
});

// Story 2.10: context_form and save_context_field.

describe("details form (context_form)", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  async function formDeps() {
    const caseStudy = await loadCaseStudy();
    return {
      assets: createSupabaseAssetRepository(),
      form: createSupabaseDetailsFormRepository(),
      storage: null,
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
      newId: randomUUID,
    };
  }

  async function saveField(input: Record<string, unknown>) {
    const { makeSaveDetailsField } = await import("@/modules/material/application/save-details-field");
    return makeSaveDetailsField(await formDeps())(await devActor(), input);
  }

  async function readForm(caseId: string) {
    const { makeGetDetailsForm } = await import("@/modules/material/application/get-details-form");
    return makeGetDetailsForm(await formDeps())({ caseId });
  }

  async function formRow(caseId: string) {
    const { rows } = await pool.query("select context, solution, results, updated_by from public.context_form where case_id = $1", [
      caseId,
    ]);
    return rows;
  }

  async function detailsEvents(caseId: string) {
    const { rows } = await pool.query<{ type: string; actor_id: string; data: unknown }>(
      "select type, actor_id, data from public.case_event where case_id = $1 and type = 'details_saved' order by at",
      [caseId],
    );
    return rows;
  }

  const codeOf = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);

  it("first save → next save → unchanged → clear: one row, one details_saved { field } per change; status unchanged", async () => {
    const actor = await devActor();
    const created = await createCase();
    const caseId = created.id;

    expect(await readForm(caseId)).toEqual({ ok: true, value: { context: "", solution: "", results: "" } });
    expect(await formRow(caseId)).toEqual([]);

    expect(codeOf(await saveField({ caseId, field: "context", text: "Bando PNRR" }))).toBe("OK");
    expect(await formRow(caseId)).toEqual([{ context: "Bando PNRR", solution: "", results: "", updated_by: actor.id }]);

    expect(codeOf(await saveField({ caseId, field: "results", text: "+30% iscritti" }))).toBe("OK");
    expect(await readForm(caseId)).toEqual({ ok: true, value: { context: "Bando PNRR", solution: "", results: "+30% iscritti" } });

    const { rows: before } = await pool.query("select updated_at from public.context_form where case_id = $1", [caseId]);
    expect(codeOf(await saveField({ caseId, field: "results", text: "+30% iscritti" }))).toBe("OK");
    const { rows: after } = await pool.query("select updated_at from public.context_form where case_id = $1", [caseId]);
    expect(after).toEqual(before);

    expect(codeOf(await saveField({ caseId, field: "context", text: "" }))).toBe("OK");
    expect(await readForm(caseId)).toEqual({ ok: true, value: { context: "", solution: "", results: "+30% iscritti" } });

    expect(await detailsEvents(caseId)).toEqual([
      { type: "details_saved", actor_id: actor.id, data: { field: "context" } },
      { type: "details_saved", actor_id: actor.id, data: { field: "results" } },
      { type: "details_saved", actor_id: actor.id, data: { field: "context" } },
    ]);
    const { rows: status } = await pool.query("select status from public.case_study where id = $1", [caseId]);
    expect(status).toEqual([{ status: "draft" }]);
  });

  it("save_context_field returns the previous text; a first save of '' creates no row", async () => {
    const created = await createCase();
    const repo = createSupabaseDetailsFormRepository();
    expect(await repo.saveField(created.id, "solution", "", DEV_ACTOR_ID)).toEqual({ ok: true, value: "" });
    expect(await formRow(created.id)).toEqual([]);
    expect(await repo.saveField(created.id, "solution", "App", DEV_ACTOR_ID)).toEqual({ ok: true, value: "" });
    expect(await repo.saveField(created.id, "solution", "Sito", DEV_ACTOR_ID)).toEqual({ ok: true, value: "App" });
  });

  it("an unknown field → UNKNOWN_FIELD; nothing written", async () => {
    const created = await createCase();
    expect(codeOf(await saveField({ caseId: created.id, field: "budget", text: "x" }))).toBe("UNKNOWN_FIELD");
    await expect(
      pool.query("select public.save_context_field($1, 'budget', 'x', $2)", [created.id, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "UNKNOWN_FIELD" });
    expect(await formRow(created.id)).toEqual([]);
  });

  it("5,000 characters are stored; 5,001 are refused by the use case and the table check", async () => {
    const created = await createCase();
    expect(codeOf(await saveField({ caseId: created.id, field: "context", text: "è".repeat(5_000) }))).toBe("OK");
    const tooLong = await saveField({ caseId: created.id, field: "context", text: "x".repeat(5_001) });
    expect(codeOf(tooLong)).toBe("INVALID_INPUT");
    if (!tooLong.ok) expect((tooLong.error.details as { fields: string[] }).fields).toEqual(["text"]);
    await expect(
      inRolledBackTx("select public.save_context_field($1, 'context', $2, $3)", [created.id, "x".repeat(5_001), DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "23514" });
    const repo = createSupabaseDetailsFormRepository();
    const viaAdapter = await repo.saveField(created.id, "results", "x".repeat(5_001), DEV_ACTOR_ID);
    expect(codeOf(viaAdapter)).toBe("INVALID_INPUT");
    expect((await formRow(created.id))[0]).toMatchObject({ context: "è".repeat(5_000), results: "" });
  });

  it("a soft-deleted case → NOT_FOUND; nothing written or read", async () => {
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    expect(codeOf(await saveField({ caseId: created.id, field: "context", text: "x" }))).toBe("NOT_FOUND");
    expect(codeOf(await readForm(created.id))).toBe("NOT_FOUND");
    await expect(
      pool.query("select public.save_context_field($1, 'context', 'x', $2)", [created.id, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
    expect(await createSupabaseDetailsFormRepository().saveField(created.id, "context", "x", DEV_ACTOR_ID)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await formRow(created.id)).toEqual([]);
    expect(await detailsEvents(created.id)).toEqual([]);
  });

  it("resolveRefs reads form_field refs from the DB", async () => {
    const { makeResolveRefs } = await import("@/modules/material/application/resolve-refs");
    const created = await createCase();
    await saveField({ caseId: created.id, field: "context", text: "Bando PNRR" });
    const refs = [
      { kind: "form_field", id: "context" },
      { kind: "form_field", id: "results" },
    ];
    expect(await makeResolveRefs(await formDeps())(created.id, refs)).toEqual({
      ok: true,
      value: [
        { ref: refs[0], text: "Bando PNRR" },
        { ref: refs[1], text: "" },
      ],
    });
  });

  it("the form is not material: a filled form with no assets → has_material false", async () => {
    const created = await createCase();
    for (const field of ["context", "solution", "results"]) {
      expect(codeOf(await saveField({ caseId: created.id, field, text: "Compilato" }))).toBe("OK");
    }
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseAssetRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  it("deleting or truncating context_form is rejected", async () => {
    const created = await createCase();
    await saveField({ caseId: created.id, field: "context", text: "x" });
    await expect(inRolledBackTx("delete from public.context_form where case_id = $1", [created.id])).rejects.toThrow(/never deleted/);
    await expect(inRolledBackTx("truncate public.context_form")).rejects.toThrow(/never deleted/);
  });

  it("enables RLS with no policies on context_form", async () => {
    const { rows } = await pool.query<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls,
              (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
       from pg_catalog.pg_class c where c.oid = 'public.context_form'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
  });

  it("the browser key is refused reading context_form", async () => {
    const { data, error } = await browser().from("context_form").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("the browser key is refused calling save_context_field", async () => {
    const { data, error } = await browser().rpc("save_context_field", {
      p_case_id: UNKNOWN_ID,
      p_field: "context",
      p_text: "x",
      p_actor_id: DEV_ACTOR_ID,
    });
    expect(data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(error?.code);
  });

  const statements = {
    select: "select * from public.context_form",
    insert: `insert into public.context_form (case_id, updated_by) values ('${UNKNOWN_ID}', '${DEV_ACTOR_ID}')`,
    update: "update public.context_form set context = 'x'",
    delete: "delete from public.context_form",
    save_context_field: `select public.save_context_field('${UNKNOWN_ID}', 'context', 'x', '${DEV_ACTOR_ID}')`,
  };
  const roleCases = (["anon", "authenticated"] as const).flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(roleCases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });
});
