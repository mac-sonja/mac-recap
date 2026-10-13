// DB-level checks of the `asset` migration, `create_asset` / `restore_asset` and
// the real material adapter against the local Supabase stack. Run with
// `npm run test:db`. Asset and case rows can never be deleted, so every test
// works on its own fresh case.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseDetailsFormRepository } from "@/modules/material/adapters/supabase/details-form-repository";
import { createSupabaseTaxonomyRepository } from "@/modules/material/adapters/supabase/taxonomy-repository";
import { createSupabaseTextItemRepository } from "@/modules/material/adapters/supabase/text-item-repository";
import { ALLOWED_CONTENT_TYPES, ASSET_KINDS, MAX_ASSETS_PER_CASE } from "@/modules/material/domain/files";
import type { ObjectStorage, StoredObject } from "@/modules/material/ports/object-storage";

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

describe("soft delete and restore", () => {
  it("removes, refuses a second removal, restores, then reports already live", async () => {
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    const repo = createSupabaseAssetRepository();
    expect(await repo.softDelete(created.id, id)).toEqual({ ok: true, value: true });
    expect(await repo.softDelete(created.id, id)).toEqual({ ok: true, value: false });
    expect(await liveCount(created.id)).toBe(0);
    expect(await repo.restore(created.id, id)).toEqual({ ok: true, value: true });
    expect(await repo.restore(created.id, id)).toEqual({ ok: true, value: false });
    expect(await liveCount(created.id)).toBe(1);
  });

  it("does not touch an asset of another case", async () => {
    const [a, b] = [await createCase(), await createCase()];
    const [id] = await seedAssets(a.id, 1);
    const repo = createSupabaseAssetRepository();
    expect(await repo.softDelete(b.id, id)).toEqual({ ok: true, value: false });
    const restored = await repo.restore(b.id, id);
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error.code).toBe("NOT_FOUND");
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
    const result = await createSupabaseAssetRepository().restore(created.id, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    const { rows } = await pool.query("select deleted_at is not null as removed from public.asset where id = $1", [id]);
    expect(rows).toEqual([{ removed: true }]);
  });

  it("a restore racing a create at 19 live assets: exactly one takes the 20th slot", async () => {
    const created = await createCase();
    const [removed] = await seedAssets(created.id, 1);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [removed]);
    await seedAssets(created.id, MAX_ASSETS_PER_CASE - 1);
    const fresh = randomUUID();
    // pool.query checks out a separate connection for each call.
    const results = await Promise.allSettled([
      pool.query("select public.restore_asset($1, $2) as restored", [created.id, removed]),
      pool.query(CREATE_ASSET, [fresh, created.id, keyFor(created.id, fresh), DEV_ACTOR_ID]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "P0001", message: "FILE_LIMIT_REACHED" });
    if (results[0].status === "fulfilled") expect(results[0].value.rows).toEqual([{ restored: true }]);
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
  });

  it("restore re-checks the cap", async () => {
    const created = await createCase();
    const [first] = await seedAssets(created.id, 1);
    const repo = createSupabaseAssetRepository();
    await repo.softDelete(created.id, first);
    await seedAssets(created.id, MAX_ASSETS_PER_CASE);
    const result = await repo.restore(created.id, first);
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
      texts: createSupabaseTextItemRepository(),
      taxonomy: createSupabaseTaxonomyRepository(),
      form: createSupabaseDetailsFormRepository(),
      storage,
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
      newId: randomUUID,
    };
  }

  it("confirm → remove → restore writes the rows and one event each; status stays draft", async () => {
    const { makeConfirmUpload } = await import("@/modules/material/application/confirm-upload");
    const { makeRemoveAsset } = await import("@/modules/material/application/remove-asset");
    const { makeRestoreAsset } = await import("@/modules/material/application/restore-asset");
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
    expect(await makeRestoreAsset(deps)(actor, { caseId: created.id, assetId })).toEqual({ ok: true, value: undefined });

    const { rows } = await pool.query(
      "select kind, original_file_name, size_bytes::int as size, s3_key, deleted_at from public.asset where id = $1",
      [assetId],
    );
    expect(rows).toEqual([
      { kind: "image", original_file_name: "hero.webp", size: 4096, s3_key: `cases/${created.id}/assets/${assetId}/original.webp`, deleted_at: null },
    ]);
    expect(await assetEvents(created.id)).toEqual([
      { type: "asset_uploaded", actor_id: actor.id, data: { assetId } },
      { type: "asset_removed", actor_id: actor.id, data: { assetId } },
      { type: "asset_restored", actor_id: actor.id, data: { assetId } },
    ]);
    const { rows: status } = await pool.query("select status from public.case_study where id = $1", [created.id]);
    expect(status).toEqual([{ status: "draft" }]);
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
  };
  const cases = (["anon", "authenticated"] as const).flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(cases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });
});

// Story 2.8: text_item and has_material.

const INSERT_TEXT = "insert into public.text_item (case_id, title, body, created_by) values ($1, $2, $3, $4) returning id";

async function seedText(caseId: string, body = "Testo", title = "Brief") {
  const { rows } = await pool.query<{ id: string }>(INSERT_TEXT, [caseId, title, body, DEV_ACTOR_ID]);
  return rows[0].id;
}

const hasMaterialSql = async (caseId: string) => {
  const { rows } = await pool.query<{ has: boolean }>("select public.has_material($1) as has", [caseId]);
  return rows[0].has;
};

describe("text_item", () => {
  it("stores the body as given and touches updated_at on update", async () => {
    const created = await createCase();
    const body = "  riga uno\n\n  riga due  \n";
    const id = await seedText(created.id, body);
    const { rows: before } = await pool.query("select body, updated_at, deleted_at from public.text_item where id = $1", [id]);
    expect(before[0]).toMatchObject({ body, deleted_at: null });
    await pool.query("update public.text_item set title = 'Nuovo' where id = $1", [id]);
    const { rows: after } = await pool.query<{ updated_at: Date }>("select updated_at from public.text_item where id = $1", [id]);
    expect(after[0].updated_at.getTime()).toBeGreaterThan((before[0].updated_at as Date).getTime());
  });

  it.each([
    ["an empty body", "Brief", ""],
    ["a whitespace-only body", "Brief", "  \n\t "],
    ["a blank title", "   ", "Testo"],
    ["a 201-char title", "t".repeat(201), "Testo"],
    ["a 200,001-char body", "Brief", "b".repeat(200_001)],
  ])("the table checks reject %s", async (_label, title, body) => {
    const created = await createCase();
    await expect(inRolledBackTx(INSERT_TEXT, [created.id, title, body, DEV_ACTOR_ID])).rejects.toMatchObject({ code: "23514" });
  });

  it("text items don't count toward the asset cap", async () => {
    const created = await createCase();
    await seedText(created.id);
    await seedText(created.id);
    await seedAssets(created.id, MAX_ASSETS_PER_CASE);
    expect(await liveCount(created.id)).toBe(MAX_ASSETS_PER_CASE);
    // A text item is still stored at the cap.
    const result = await createSupabaseTextItemRepository().create({
      caseId: created.id,
      title: "At cap",
      body: "Testo",
      createdBy: DEV_ACTOR_ID,
    });
    expect(result.ok).toBe(true);
  });

  it("the adapter maps a whitespace-only body to TEXT_EMPTY and an unknown case to NOT_FOUND", async () => {
    const created = await createCase();
    const repo = createSupabaseTextItemRepository();
    const empty = await repo.create({ caseId: created.id, title: "Brief", body: " \n ", createdBy: DEV_ACTOR_ID });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("TEXT_EMPTY");
    const unknown = await repo.create({ caseId: UNKNOWN_ID, title: "Brief", body: "Testo", createdBy: DEV_ACTOR_ID });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("NOT_FOUND");
  });

  it("the adapter edits, removes, refuses a second removal, restores, then reports already live", async () => {
    const created = await createCase();
    const id = await seedText(created.id);
    const repo = createSupabaseTextItemRepository();
    const edited = await repo.update(created.id, id, { title: "Nuovo", body: "Testo nuovo" });
    expect(edited.ok && edited.value).toMatchObject({ id, title: "Nuovo", body: "Testo nuovo" });
    expect(await repo.softDelete(created.id, id)).toEqual({ ok: true, value: true });
    expect(await repo.softDelete(created.id, id)).toEqual({ ok: true, value: false });
    expect(await repo.getLive(created.id, id)).toEqual({ ok: true, value: null });
    expect(await repo.update(created.id, id, { title: "x", body: "y" })).toEqual({ ok: true, value: null });
    expect(await repo.restore(created.id, id)).toEqual({ ok: true, value: true });
    expect(await repo.restore(created.id, id)).toEqual({ ok: true, value: false });
    const unknown = await repo.restore(created.id, UNKNOWN_ID);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("NOT_FOUND");
  });

  it("does not touch a text item of another case", async () => {
    const [a, b] = [await createCase(), await createCase()];
    const id = await seedText(a.id);
    const repo = createSupabaseTextItemRepository();
    expect(await repo.softDelete(b.id, id)).toEqual({ ok: true, value: false });
    expect(await repo.update(b.id, id, { title: "x", body: "y" })).toEqual({ ok: true, value: null });
    const restored = await repo.restore(b.id, id);
    expect(restored.ok).toBe(false);
  });

  it("deleting a text_item row is rejected", async () => {
    const created = await createCase();
    const id = await seedText(created.id);
    await expect(inRolledBackTx("delete from public.text_item where id = $1", [id])).rejects.toThrow(/never deleted/);
  });

  it("truncating text_item is rejected", async () => {
    await expect(inRolledBackTx("truncate public.text_item")).rejects.toThrow(/never deleted/);
  });

  it("enables RLS with no policies on text_item", async () => {
    const { rows } = await pool.query<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls,
              (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
       from pg_catalog.pg_class c where c.oid = 'public.text_item'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
  });
});

describe("has_material", () => {
  it("none: no assets, no text items → false", async () => {
    const created = await createCase();
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseTextItemRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  it("an unknown case → false", async () => {
    expect(await hasMaterialSql(UNKNOWN_ID)).toBe(false);
  });

  it("asset: one live asset → true", async () => {
    const created = await createCase();
    await seedAssets(created.id, 1);
    expect(await hasMaterialSql(created.id)).toBe(true);
    expect(await createSupabaseTextItemRepository().hasMaterial(created.id)).toEqual({ ok: true, value: true });
  });

  it("text: one live, non-empty text item → true", async () => {
    const created = await createCase();
    await seedText(created.id);
    expect(await hasMaterialSql(created.id)).toBe(true);
  });

  it("removed only: assets and text items all soft-deleted → false", async () => {
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    const textId = await seedText(created.id);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [assetId]);
    await pool.query("update public.text_item set deleted_at = now() where id = $1", [textId]);
    expect(await hasMaterialSql(created.id)).toBe(false);
  });

  it("a soft-deleted case with a live asset and a live text item → false", async () => {
    const created = await createCase();
    await seedAssets(created.id, 1);
    await seedText(created.id);
    expect(await hasMaterialSql(created.id)).toBe(true);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseTextItemRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  it("only counts the given case", async () => {
    const [a, b] = [await createCase(), await createCase()];
    await seedText(a.id);
    await seedAssets(a.id, 1);
    expect(await hasMaterialSql(b.id)).toBe(false);
  });
});

describe("text use cases against the real DB and case-study module (no S3)", () => {
  async function textDeps() {
    const caseStudy = await loadCaseStudy();
    return {
      assets: createSupabaseAssetRepository(),
      texts: createSupabaseTextItemRepository(),
      taxonomy: createSupabaseTaxonomyRepository(),
      form: createSupabaseDetailsFormRepository(),
      storage: null,
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
      newId: randomUUID,
    };
  }

  async function textEvents(caseId: string) {
    const { rows } = await pool.query<{ type: string; actor_id: string; data: unknown }>(
      "select type, actor_id, data from public.case_event where case_id = $1 and type like 'text_%' order by at, type",
      [caseId],
    );
    return rows;
  }

  it("add → edit → remove → restore writes the row and one event each; status stays draft", async () => {
    const { makeAddTextItem } = await import("@/modules/material/application/add-text-item");
    const { makeEditTextItem } = await import("@/modules/material/application/edit-text-item");
    const { makeRemoveTextItem } = await import("@/modules/material/application/remove-text-item");
    const { makeRestoreTextItem } = await import("@/modules/material/application/restore-text-item");
    const actor = await devActor();
    const created = await createCase();
    const deps = await textDeps();

    const added = await makeAddTextItem(deps)(actor, { caseId: created.id, title: " Brief ", body: "Testo" });
    if (!added.ok) throw new Error(`add failed: ${added.error.code}`);
    const textItemId = added.value.id;
    expect(added.value).toMatchObject({ title: "Brief", body: "Testo", createdBy: actor.id, deletedAt: null });
    const edited = await makeEditTextItem(deps)(actor, { caseId: created.id, textItemId, title: "Nuovo", body: "Testo nuovo" });
    expect(edited.ok).toBe(true);
    expect(await makeRemoveTextItem(deps)(actor, { caseId: created.id, textItemId })).toEqual({ ok: true, value: undefined });
    expect(await makeRestoreTextItem(deps)(actor, { caseId: created.id, textItemId })).toEqual({ ok: true, value: undefined });

    const { rows } = await pool.query("select title, body, deleted_at from public.text_item where id = $1", [textItemId]);
    expect(rows).toEqual([{ title: "Nuovo", body: "Testo nuovo", deleted_at: null }]);
    expect(await textEvents(created.id)).toEqual([
      { type: "text_added", actor_id: actor.id, data: { textItemId } },
      { type: "text_edited", actor_id: actor.id, data: { textItemId } },
      { type: "text_removed", actor_id: actor.id, data: { textItemId } },
      { type: "text_restored", actor_id: actor.id, data: { textItemId } },
    ]);
    const { rows: status } = await pool.query("select status from public.case_study where id = $1", [created.id]);
    expect(status).toEqual([{ status: "draft" }]);
  });

  it("a soft-deleted case → NOT_FOUND; nothing stored", async () => {
    const { makeAddTextItem } = await import("@/modules/material/application/add-text-item");
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    const result = await makeAddTextItem(await textDeps())(await devActor(), { caseId: created.id, title: "Brief", body: "Testo" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    const { rows } = await pool.query("select count(*)::int as n from public.text_item where case_id = $1", [created.id]);
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe("text_item RLS lockout", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  it("the browser key is refused reading text_item", async () => {
    const { data, error } = await browser().from("text_item").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("the browser key is refused calling has_material", async () => {
    const { data, error } = await browser().rpc("has_material", { p_case_id: UNKNOWN_ID });
    expect(data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(error?.code);
  });

  const statements = {
    select: "select * from public.text_item",
    insert: `insert into public.text_item (case_id, title, body, created_by) values ('${UNKNOWN_ID}', 'x', 'y', '${DEV_ACTOR_ID}')`,
    update: "update public.text_item set deleted_at = now()",
    delete: "delete from public.text_item",
    has_material: `select public.has_material('${UNKNOWN_ID}')`,
  };
  const cases = (["anon", "authenticated"] as const).flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(cases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });
});

// Story 2.9: taxonomy_term, material_term, set_material_terms, case_material_terms.
// Terms are seeded here with the `postgres` pool, as a migration would, under keys
// unique to this run, and removed again afterwards (with the delete guard
// disabled inside that one transaction, as only the table owner can).

describe("taxonomy", () => {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const key = (name: string) => `zt_${suffix}_${name}`;
  const TAG_A = key("tag_a");
  const TAG_B = key("tag_b");
  const PROP = key("prop");
  const FLAG = key("flag");
  const seededIds: string[] = [];

  const serviceRole = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  beforeAll(async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into public.taxonomy_term (kind, key, label) values
         ('tag', $1, 'Zt ${suffix} Beta'), ('tag', $2, 'Zt ${suffix} Alfa'),
         ('property', $3, 'Zt ${suffix} Proprietà'), ('flag', $4, 'Zt ${suffix} Riservato')
       returning id`,
      [TAG_A, TAG_B, PROP, FLAG],
    );
    seededIds.push(...rows.map((r) => r.id));
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("delete from public.material_term where term_id = any($1::uuid[])", [seededIds]);
      await client.query("alter table public.taxonomy_term disable trigger taxonomy_term_reject_delete");
      await client.query("delete from public.taxonomy_term where id = any($1::uuid[])", [seededIds]);
      await client.query("alter table public.taxonomy_term enable trigger taxonomy_term_reject_delete");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  async function taxonomyDeps() {
    const caseStudy = await loadCaseStudy();
    return {
      assets: createSupabaseAssetRepository(),
      texts: createSupabaseTextItemRepository(),
      taxonomy: createSupabaseTaxonomyRepository(),
      form: createSupabaseDetailsFormRepository(),
      storage: null,
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
      newId: randomUUID,
    };
  }

  async function setTerms(input: Record<string, unknown>) {
    const { makeSetDeliverableTerms } = await import("@/modules/material/application/set-deliverable-terms");
    return makeSetDeliverableTerms(await taxonomyDeps())(await devActor(), input);
  }

  async function caseTerms(caseId: string) {
    const { makeGetCaseTerms } = await import("@/modules/material/application/get-case-terms");
    const result = await makeGetCaseTerms(await taxonomyDeps())({ caseId });
    if (!result.ok) throw new Error(`getCaseTerms failed: ${result.error.code}`);
    return result.value;
  }

  async function linkedKeys(refId: string) {
    const { rows } = await pool.query<{ key: string }>(
      `select t.key from public.material_term mt join public.taxonomy_term t on t.id = mt.term_id
       where mt.ref_id = $1 order by t.key collate "C"`,
      [refId],
    );
    return rows.map((r) => r.key);
  }

  async function termEvents(caseId: string) {
    const { rows } = await pool.query<{ type: string; actor_id: string; data: unknown }>(
      "select type, actor_id, data from public.case_event where case_id = $1 and type = 'terms_set' order by at",
      [caseId],
    );
    return rows;
  }

  const codeOf = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);

  it("listTerms groups the seeded terms by kind, ordered by label", async () => {
    const { makeListTerms } = await import("@/modules/material/application/list-terms");
    const result = await makeListTerms(await taxonomyDeps())();
    if (!result.ok) throw new Error(result.error.code);
    const ours = (terms: { key: string }[]) => terms.filter((t) => t.key.startsWith(`zt_${suffix}_`)).map((t) => t.key);
    expect(ours(result.value.tag)).toEqual([TAG_B, TAG_A]);
    expect(ours(result.value.property)).toEqual([PROP]);
    expect(ours(result.value.flag)).toEqual([FLAG]);
  });

  it("set → replace → clear on an asset; other kinds untouched; one terms_set each; status unchanged", async () => {
    const actor = await devActor();
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    const ref = { caseId: created.id, refKind: "asset", refId: assetId };

    expect(codeOf(await setTerms({ ...ref, kind: "tag", keys: [TAG_A, TAG_B] }))).toBe("OK");
    expect(await linkedKeys(assetId)).toEqual([TAG_A, TAG_B].sort());
    expect(codeOf(await setTerms({ ...ref, kind: "property", keys: [PROP] }))).toBe("OK");
    expect(codeOf(await setTerms({ ...ref, kind: "tag", keys: [TAG_B] }))).toBe("OK");
    expect(await linkedKeys(assetId)).toEqual([PROP, TAG_B].sort());
    expect(codeOf(await setTerms({ ...ref, kind: "tag", keys: [] }))).toBe("OK");
    expect(await linkedKeys(assetId)).toEqual([PROP]);

    expect(await termEvents(created.id)).toEqual([
      { type: "terms_set", actor_id: actor.id, data: { refKind: "asset", refId: assetId, kind: "tag", keys: [TAG_A, TAG_B] } },
      { type: "terms_set", actor_id: actor.id, data: { refKind: "asset", refId: assetId, kind: "property", keys: [PROP] } },
      { type: "terms_set", actor_id: actor.id, data: { refKind: "asset", refId: assetId, kind: "tag", keys: [TAG_B] } },
      { type: "terms_set", actor_id: actor.id, data: { refKind: "asset", refId: assetId, kind: "tag", keys: [] } },
    ]);
    const { rows: status } = await pool.query("select status from public.case_study where id = $1", [created.id]);
    expect(status).toEqual([{ status: "draft" }]);
  });

  it("set_material_terms returns the previous keys of that kind", async () => {
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    const repo = createSupabaseTaxonomyRepository();
    const target = { caseId: created.id, refKind: "asset" as const, refId: assetId, kind: "tag" as const };
    expect(await repo.setTerms({ ...target, keys: [TAG_A, TAG_B, TAG_A] })).toEqual({ ok: true, value: [] });
    expect(await repo.setTerms({ ...target, keys: [TAG_B] })).toEqual({ ok: true, value: [TAG_A, TAG_B].sort() });
    expect(await repo.setTerms({ ...target, kind: "flag", keys: [] })).toEqual({ ok: true, value: [] });
  });

  it("a text item works like an asset", async () => {
    const created = await createCase();
    const textId = await seedText(created.id);
    expect(codeOf(await setTerms({ caseId: created.id, refKind: "text", refId: textId, kind: "flag", keys: [FLAG] }))).toBe("OK");
    expect(await linkedKeys(textId)).toEqual([FLAG]);
  });

  it.each([
    ["an unknown key", () => [TAG_A, key("missing")], key("missing")],
    ["a property key sent as tag", () => [PROP], PROP],
  ])("%s → UNKNOWN_TERM naming the key; nothing changes", async (_label, keys, named) => {
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    const ref = { caseId: created.id, refKind: "asset", refId: assetId };
    await setTerms({ ...ref, kind: "tag", keys: [TAG_B] });
    const result = await setTerms({ ...ref, kind: "tag", keys: keys() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "UNKNOWN_TERM", details: { key: named } });
    expect(await linkedKeys(assetId)).toEqual([TAG_B]);
    expect(await termEvents(created.id)).toHaveLength(1);
  });

  it("removed deliverables and another case's deliverables → NOT_FOUND; nothing changes", async () => {
    const [a, b] = [await createCase(), await createCase()];
    const [assetId] = await seedAssets(a.id, 1);
    const textId = await seedText(a.id);
    await pool.query("update public.asset set deleted_at = now() where id = $1", [assetId]);
    await pool.query("update public.text_item set deleted_at = now() where id = $1", [textId]);
    const [otherAsset] = await seedAssets(b.id, 1);

    for (const input of [
      { caseId: a.id, refKind: "asset", refId: assetId },
      { caseId: a.id, refKind: "text", refId: textId },
      { caseId: a.id, refKind: "asset", refId: otherAsset },
      { caseId: a.id, refKind: "text", refId: otherAsset },
    ]) {
      expect(codeOf(await setTerms({ ...input, kind: "tag", keys: [TAG_A] }))).toBe("NOT_FOUND");
    }
    expect(await linkedKeys(assetId)).toEqual([]);
    expect(await linkedKeys(textId)).toEqual([]);
    expect(await linkedKeys(otherAsset)).toEqual([]);
    expect(await termEvents(a.id)).toEqual([]);
  });

  it("set_material_terms raises NOT_FOUND for a soft-deleted case", async () => {
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    await expect(
      pool.query("select public.set_material_terms($1, 'asset', $2, 'tag', $3::text[])", [created.id, assetId, [TAG_A]]),
    ).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
  });

  it("read: tagged and untagged deliverables; a removed one keeps its links and comes back on restore", async () => {
    const created = await createCase();
    const [tagged, untagged] = await seedAssets(created.id, 2);
    const textId = await seedText(created.id);
    await setTerms({ caseId: created.id, refKind: "asset", refId: tagged, kind: "tag", keys: [TAG_A, TAG_B] });
    await setTerms({ caseId: created.id, refKind: "asset", refId: tagged, kind: "flag", keys: [FLAG] });
    await setTerms({ caseId: created.id, refKind: "text", refId: textId, kind: "property", keys: [PROP] });

    const expected = [
      { refKind: "asset", refId: tagged, tag: [TAG_B, TAG_A], property: [], flag: [FLAG] },
      { refKind: "asset", refId: untagged, tag: [], property: [], flag: [] },
      { refKind: "text", refId: textId, tag: [], property: [PROP], flag: [] },
    ];
    expect(await caseTerms(created.id)).toEqual(expected);

    const repo = createSupabaseAssetRepository();
    await repo.softDelete(created.id, tagged);
    expect((await caseTerms(created.id)).map((d) => d.refId)).toEqual([untagged, textId]);
    expect(await linkedKeys(tagged)).toEqual([FLAG, TAG_A, TAG_B].sort());
    await repo.restore(created.id, tagged);
    expect(await caseTerms(created.id)).toEqual(expected);
  });

  it("an unknown case reads as NOT_FOUND; case_material_terms gives []", async () => {
    const { makeGetCaseTerms } = await import("@/modules/material/application/get-case-terms");
    const result = await makeGetCaseTerms(await taxonomyDeps())({ caseId: UNKNOWN_ID });
    expect(codeOf(result)).toBe("NOT_FOUND");
    const { rows } = await pool.query("select public.case_material_terms($1) as terms", [UNKNOWN_ID]);
    expect(rows).toEqual([{ terms: [] }]);
  });

  it("a label renamed by a migration leaves key-based set and read working", async () => {
    const created = await createCase();
    const [assetId] = await seedAssets(created.id, 1);
    await setTerms({ caseId: created.id, refKind: "asset", refId: assetId, kind: "tag", keys: [TAG_A] });
    await pool.query("update public.taxonomy_term set label = $2 where key = $1", [TAG_A, `Zt ${suffix} Rinominato`]);
    expect((await caseTerms(created.id))[0].tag).toEqual([TAG_A]);
    expect(codeOf(await setTerms({ caseId: created.id, refKind: "asset", refId: assetId, kind: "tag", keys: [TAG_A, TAG_B] }))).toBe(
      "OK",
    );
    expect(await linkedKeys(assetId)).toEqual([TAG_A, TAG_B].sort());
  });

  it("the service role can read terms but never write them", async () => {
    const db = serviceRole();
    const read = await db.from("taxonomy_term").select("key").eq("key", TAG_A);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([{ key: TAG_A }]);

    const insert = await db.from("taxonomy_term").insert({ kind: "tag", key: key("injected"), label: "X" });
    expect(insert.error?.code).toBe("42501");
    const update = await db.from("taxonomy_term").update({ label: "X" }).eq("key", TAG_A);
    expect(update.error?.code).toBe("42501");
    const remove = await db.from("taxonomy_term").delete().eq("key", TAG_A);
    expect(remove.error?.code).toBe("42501");

    const { rows } = await pool.query("select count(*)::int as n from public.taxonomy_term where key in ($1, $2)", [
      TAG_A,
      key("injected"),
    ]);
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("select is the service role's only privilege on taxonomy_term", async () => {
    const { rows } = await pool.query<{ privilege: string }>(
      `select privilege_type as privilege from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'taxonomy_term' and grantee = 'service_role'
       order by privilege_type`,
    );
    expect(rows).toEqual([{ privilege: "SELECT" }]);
    const { rows: checks } = await pool.query(
      `select ${["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]
        .map((p) => `has_table_privilege('service_role', 'public.taxonomy_term', '${p}') as "${p}"`)
        .join(", ")}`,
    );
    expect(checks).toEqual([
      { SELECT: true, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false, REFERENCES: false, TRIGGER: false },
    ]);
  });

  it("deleting or truncating taxonomy_term is rejected even for the owner", async () => {
    await expect(inRolledBackTx("delete from public.taxonomy_term where key = $1", [TAG_A])).rejects.toThrow(/never deleted/);
    await expect(inRolledBackTx("truncate public.taxonomy_term cascade")).rejects.toThrow(/never deleted/);
  });

  it.each([
    ["an upper-case key", "insert into public.taxonomy_term (kind, key, label) values ('tag', 'Bad', 'X')"],
    ["a key with a space", "insert into public.taxonomy_term (kind, key, label) values ('tag', 'a b', 'X')"],
    ["an unknown kind", "insert into public.taxonomy_term (kind, key, label) values ('category', 'zt_ok', 'X')"],
    ["a blank label", "insert into public.taxonomy_term (kind, key, label) values ('tag', 'zt_ok', '  ')"],
    ["an unknown ref kind", `insert into public.material_term (ref_kind, ref_id, term_id) select 'form_field', '${UNKNOWN_ID}', id from public.taxonomy_term limit 1`],
  ])("the table checks reject %s", async (_label, sql) => {
    await expect(inRolledBackTx(sql)).rejects.toMatchObject({ code: "23514" });
  });

  it.each(["taxonomy_term", "material_term"])("enables RLS with no policies on %s", async (table) => {
    const { rows } = await pool.query<{ rls: boolean; policies: number }>(
      `select c.relrowsecurity as rls,
              (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
       from pg_catalog.pg_class c where c.oid = $1::regclass`,
      [`public.${table}`],
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
  });

  it.each(["taxonomy_term", "material_term"])("the browser key is refused reading %s", async (table) => {
    const { data, error } = await browser().from(table as "taxonomy_term").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it.each([
    ["set_material_terms", { p_case_id: UNKNOWN_ID, p_ref_kind: "asset", p_ref_id: UNKNOWN_ID, p_kind: "tag", p_keys: [] }],
    ["case_material_terms", { p_case_id: UNKNOWN_ID }],
  ])("the browser key is refused calling %s", async (fn, args) => {
    const { data, error } = await browser().rpc(fn as "case_material_terms", args as never);
    expect(data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(error?.code);
  });

  const statements = {
    "select taxonomy_term": "select * from public.taxonomy_term",
    "insert taxonomy_term": "insert into public.taxonomy_term (kind, key, label) values ('tag', 'zt_x', 'X')",
    "update taxonomy_term": "update public.taxonomy_term set label = 'X'",
    "select material_term": "select * from public.material_term",
    "insert material_term": `insert into public.material_term (ref_kind, ref_id, term_id) values ('asset', '${UNKNOWN_ID}', '${UNKNOWN_ID}')`,
    "delete material_term": "delete from public.material_term",
    set_material_terms: `select public.set_material_terms('${UNKNOWN_ID}', 'asset', '${UNKNOWN_ID}', 'tag', '{}')`,
    case_material_terms: `select public.case_material_terms('${UNKNOWN_ID}')`,
  };
  const roleCases = (["anon", "authenticated"] as const).flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(roleCases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
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
      texts: createSupabaseTextItemRepository(),
      taxonomy: createSupabaseTaxonomyRepository(),
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

  it("the form is not material: a filled form with no assets or text items → has_material false", async () => {
    const created = await createCase();
    for (const field of ["context", "solution", "results"]) {
      expect(codeOf(await saveField({ caseId: created.id, field, text: "Compilato" }))).toBe("OK");
    }
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseTextItemRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
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
