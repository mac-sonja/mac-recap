// DB-level checks of the `asset` migration, `create_asset`, `restore_asset` (only
// `removeAsset`'s compensation since Story 2.8), `has_material`, the details form
// and the real material adapters against the local Supabase stack. Run with
// `npm run test:db`. Asset and case rows can never be deleted, so every test
// works on its own fresh case. The Supabase Storage adapter runs against the
// stack's real `material` bucket; objects are never deleted either, so every
// object lives under its own fresh case and asset id.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_ACTOR_ID } from "@/modules/access/domain/actor";
import { assetKey } from "@/modules/material/adapters/asset-key";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseDetailsFormRepository } from "@/modules/material/adapters/supabase/details-form-repository";
import { createSupabaseObjectStorage, MATERIAL_BUCKET } from "@/modules/material/adapters/supabase/object-storage";
import { createSupabaseRenditionRepository } from "@/modules/material/adapters/supabase/rendition-repository";
import { FAVOURITABLE_KINDS } from "@/modules/material/domain/asset";
import { ALLOWED_CONTENT_TYPES, ASSET_KINDS, MAX_ASSETS_PER_CASE, MAX_FILE_BYTES, type AllowedContentType } from "@/modules/material/domain/files";
import type { ObjectStorage, StoredObject } from "@/modules/material/ports/object-storage";
import { err } from "@/shared/result";
import { createTestClient } from "../helpers/db-clients";

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
const CREATE_DOCUMENT = "select (public.create_asset($1, $2, 'document', 'brief.pdf', 'application/pdf', 10, $3, $4)).id";

let pool: pg.Pool;
/** The client every case in this file belongs to. */
let clientId: string;

beforeAll(async () => {
  // Enough connections for the concurrent create_asset calls.
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 6 });
  await pool.query("update public.profile set role = 'owner_designer' where id = $1", [DEV_ACTOR_ID]);
  clientId = (await createTestClient(pool, DEV_ACTOR_ID)).id;
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
  const result = await create(await devActor(), { name: "Material", clientId, year: 2026, businessLines: ["branding"] });
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

  it("the listAssets use case reads through the real repository and case-study module (no storage: null URLs)", async () => {
    const caseStudy = await loadCaseStudy();
    const { makeListAssets } = await import("@/modules/material/application/list-assets");
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    const list = makeListAssets({
      assets: createSupabaseAssetRepository(),
      renditions: createSupabaseRenditionRepository(),
      jobs: await import("@/modules/jobs"),
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
          isFavourite: false,
          thumbnailUrl: null,
          // Seeded straight through create_asset: no rendition job, so not pending.
          thumbnailPending: false,
        },
      ],
    });

    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    const gone = await list({ caseId: created.id });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("NOT_FOUND");
  });
});

describe("use cases against the real DB and case-study module (storage stubbed)", () => {
  /** Real repository and case-study calls; storage answers HEAD from `objects`. */
  async function realDeps(objects: Map<string, StoredObject>) {
    const caseStudy = await loadCaseStudy();
    const storage: ObjectStorage = {
      presignUpload: async (target) => ({
        ok: true,
        value: { url: `https://storage.test/${target.assetId}`, method: "PUT", headers: { "content-type": target.contentType, "x-upsert": "false" } },
      }),
      presignDownload: async (target) => ({ ok: true, value: `https://storage.test/${target.assetId}` }),
      presignDownloads: async (targets) => ({ ok: true, value: targets.map((target) => `https://storage.test/${target.assetId}`) }),
      head: async (target) => ({ ok: true, value: objects.get(target.assetId) ?? null }),
      presignKeys: async (keys) => ({ ok: true, value: keys.map((key) => `https://storage.test/${key}`) }),
      download: async () => ({ ok: true, value: null }),
      upload: async () => ({ ok: true, value: undefined }),
    };
    return {
      assets: createSupabaseAssetRepository(),
      renditions: createSupabaseRenditionRepository(),
      jobs: await import("@/modules/jobs"),
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
    // Story 3.2: the confirmed image got one queued rendition job, mapped to its case.
    const { rows: jobRows } = await pool.query("select kind, status, payload from public.job where subject_id = $1", [assetId]);
    expect(jobRows).toEqual([{ kind: "rendition", status: "queued", payload: { caseId: created.id } }]);
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

describe("favourites", () => {
  /** Inserts one live PDF (kind `document`) through `create_asset`; returns its id. */
  async function seedDocument(caseId: string) {
    const id = randomUUID();
    await pool.query(CREATE_DOCUMENT, [id, caseId, `cases/${caseId}/assets/${id}/original.pdf`, DEV_ACTOR_ID]);
    return id;
  }

  async function favourite(id: string) {
    const { rows } = await pool.query<{ fav: boolean }>("select is_favourite as fav from public.asset where id = $1", [id]);
    return rows[0].fav;
  }

  /** Sets a case's status directly, as `transition_case_study` does (setup only; skips the transition table). */
  async function forceStatus(caseId: string, status: string) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('mac_recap.status_transition', 'on', true)");
      await client.query("update public.case_study set status = $2 where id = $1", [caseId, status]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function realDeps() {
    const caseStudy = await loadCaseStudy();
    return { assets: createSupabaseAssetRepository(), cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent } };
  }

  it("a new asset is not a favourite", async () => {
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    expect(await favourite(id)).toBe(false);
  });

  it("mark → no-op → unmark records one event per change; status unchanged in every status", async () => {
    const { makeSetFavourite } = await import("@/modules/material/application/set-favourite");
    const actor = await devActor();
    for (const status of ["draft", "generating", "in_review", "approved"] as const) {
      const created = await createCase();
      await forceStatus(created.id, status);
      const [a, b] = await seedAssets(created.id, 2);
      const set = makeSetFavourite(await realDeps());

      expect(await set(actor, { caseId: created.id, assetId: a, isFavourite: true })).toEqual({ ok: true, value: undefined });
      expect(await set(actor, { caseId: created.id, assetId: b, isFavourite: true })).toEqual({ ok: true, value: undefined });
      expect(await set(actor, { caseId: created.id, assetId: a, isFavourite: true })).toEqual({ ok: true, value: undefined });
      expect([await favourite(a), await favourite(b)]).toEqual([true, true]);
      expect(await set(actor, { caseId: created.id, assetId: a, isFavourite: false })).toEqual({ ok: true, value: undefined });
      expect(await favourite(a)).toBe(false);

      const { rows: events } = await pool.query<{ type: string; actor_id: string; data: unknown }>(
        "select type, actor_id, data from public.case_event where case_id = $1 and type like 'asset_%favourited' order by at, id",
        [created.id],
      );
      expect(events).toEqual([
        { type: "asset_favourited", actor_id: actor.id, data: { assetId: a } },
        { type: "asset_favourited", actor_id: actor.id, data: { assetId: b } },
        { type: "asset_unfavourited", actor_id: actor.id, data: { assetId: a } },
      ]);
      const { rows } = await pool.query("select status from public.case_study where id = $1", [created.id]);
      expect(rows).toEqual([{ status }]);
    }
  });

  it("the listAssets use case carries isFavourite", async () => {
    const { makeListAssets } = await import("@/modules/material/application/list-assets");
    const created = await createCase();
    const [a, b] = await seedAssets(created.id, 2);
    await pool.query("update public.asset set is_favourite = true where id = $1", [b]);
    const listed = await makeListAssets({ ...(await realDeps()), renditions: createSupabaseRenditionRepository(), jobs: await import("@/modules/jobs"), storage: null })({
      caseId: created.id,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.map((x) => [x.id, x.isFavourite])).toEqual([
      [a, false],
      [b, true],
    ]);
  });

  it("a PDF → NOT_FAVOURITABLE, unchanged, no event; clearing it is a no-op", async () => {
    const { makeSetFavourite } = await import("@/modules/material/application/set-favourite");
    const actor = await devActor();
    const created = await createCase();
    const pdf = await seedDocument(created.id);
    const set = makeSetFavourite(await realDeps());
    const refused = await set(actor, { caseId: created.id, assetId: pdf, isFavourite: true });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("NOT_FAVOURITABLE");
    expect(await set(actor, { caseId: created.id, assetId: pdf, isFavourite: false })).toEqual({ ok: true, value: undefined });
    expect(await favourite(pdf)).toBe(false);
    expect(await assetEvents(created.id)).toEqual([]);
  });

  it("a removed asset or another case's asset → NOT_FOUND, nothing written", async () => {
    const { makeSetFavourite } = await import("@/modules/material/application/set-favourite");
    const actor = await devActor();
    const [a, b] = [await createCase(), await createCase()];
    const [removed, foreign] = [(await seedAssets(a.id, 1))[0], (await seedAssets(b.id, 1))[0]];
    await pool.query("update public.asset set deleted_at = now() where id = $1", [removed]);
    const set = makeSetFavourite(await realDeps());
    for (const assetId of [removed, foreign]) {
      const result = await set(actor, { caseId: a.id, assetId, isFavourite: true });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    }
    expect([await favourite(removed), await favourite(foreign)]).toEqual([false, false]);
    expect(await assetEvents(a.id)).toEqual([]);
  });

  it("the adapter's setFavourite skips removed and foreign assets", async () => {
    const [a, b] = [await createCase(), await createCase()];
    const [id] = await seedAssets(a.id, 1);
    const repo = createSupabaseAssetRepository();
    expect(await repo.setFavourite(b.id, id, true)).toEqual({ ok: true, value: false });
    expect(await repo.get(b.id, id)).toEqual({ ok: true, value: null });
    expect(await repo.setFavourite(a.id, id, true)).toEqual({ ok: true, value: true });
    const got = await repo.get(a.id, id);
    expect(got.ok && got.value?.isFavourite).toBe(true);
    await repo.softDelete(a.id, id);
    expect(await repo.setFavourite(a.id, id, false)).toEqual({ ok: true, value: false });
    expect(await repo.get(a.id, id)).toEqual({ ok: true, value: null });
  });

  it("the adapter maps the kind check violation to ASSET_WRITE_FAILED", async () => {
    const created = await createCase();
    const pdf = await seedDocument(created.id);
    const result = await createSupabaseAssetRepository().setFavourite(created.id, pdf, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("ASSET_WRITE_FAILED");
    expect(await favourite(pdf)).toBe(false);
  });

  it("an event write failure puts the flag back and returns the error", async () => {
    const { makeSetFavourite } = await import("@/modules/material/application/set-favourite");
    const actor = await devActor();
    const created = await createCase();
    const [id] = await seedAssets(created.id, 1);
    const real = await realDeps();
    const failure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });
    const set = makeSetFavourite({ ...real, cases: { ...real.cases, recordEvent: async () => failure } });
    expect(await set(actor, { caseId: created.id, assetId: id, isFavourite: true })).toEqual(failure);
    expect(await favourite(id)).toBe(false);
    expect(await assetEvents(created.id)).toEqual([]);
  });
});

describe("direct writes are rejected", () => {
  let assetId: string;
  let documentId: string;

  beforeAll(async () => {
    const created = await createCase();
    [assetId] = await seedAssets(created.id, 1);
    documentId = randomUUID();
    await pool.query(CREATE_DOCUMENT, [documentId, created.id, `cases/${created.id}/assets/${documentId}/original.pdf`, DEV_ACTOR_ID]);
  });

  it("deleting an asset row", async () => {
    await expect(inRolledBackTx("delete from public.asset where id = $1", [assetId])).rejects.toThrow(/never deleted/);
  });

  it("truncating asset", async () => {
    // rendition references asset (Story 3.2), so a lone truncate fails on the foreign key
    // first; truncating both reaches asset's own guard.
    await expect(inRolledBackTx("truncate public.asset")).rejects.toThrow(/never deleted|cannot truncate a table referenced/);
    await expect(inRolledBackTx("truncate public.asset, public.rendition")).rejects.toThrow(/never deleted/);
  });

  it.each([
    ["an unlisted content type", "update public.asset set content_type = 'application/zip' where id = $1"],
    ["an unknown kind", "update public.asset set kind = 'audio' where id = $1"],
    ["a size over 100 MB", "update public.asset set size_bytes = 104857601 where id = $1"],
    ["an empty size", "update public.asset set size_bytes = 0 where id = $1"],
  ])("the table checks reject %s", async (_label, sql) => {
    await expect(inRolledBackTx(sql, [assetId])).rejects.toMatchObject({ code: "23514" });
  });

  it("the favourite check rejects marking a document", async () => {
    await expect(inRolledBackTx("update public.asset set is_favourite = true where id = $1", [documentId])).rejects.toMatchObject({
      code: "23514",
      constraint: "asset_favourite_kind_check",
    });
  });

  it("the favourite check allows marking an image", async () => {
    const { rows } = await inRolledBackTx("update public.asset set is_favourite = true where id = $1 returning is_favourite", [assetId]);
    expect(rows).toEqual([{ is_favourite: true }]);
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

  /** The quoted values of one named CHECK on `asset` (other checks, like the favourite one, may mention the same column). */
  const checkValues = async (constraint: string) => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
       where conrelid = 'public.asset'::regclass and contype = 'c' and conname = $1`,
      [constraint],
    );
    expect(rows).toHaveLength(1);
    return [...rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it("checks content_type against exactly the allowlist", async () => {
    expect((await checkValues("asset_content_type_check")).sort()).toEqual([...ALLOWED_CONTENT_TYPES].sort());
  });

  it("checks kind against exactly ASSET_KINDS", async () => {
    expect(await checkValues("asset_kind_check")).toEqual([...ASSET_KINDS]);
  });

  it("allows favourites on exactly FAVOURITABLE_KINDS", async () => {
    expect(await checkValues("asset_favourite_kind_check")).toEqual([...FAVOURITABLE_KINDS]);
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
    "update is_favourite": "update public.asset set is_favourite = true",
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

// Story 2.10: context_form and save_context_field (Story 2.21: Risultati and Testimonial
// are structured and save through save_case_results / save_case_testimonial).

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

  /** The client's limits, as index.ts passes them (Story 2.21). */
  async function storyLimits() {
    const caseStudy = await loadCaseStudy();
    return {
      resultsMax: caseStudy.CLIENT_RESULTS_MAX,
      resultLabelMax: caseStudy.CLIENT_RESULT_LABEL_MAX,
      resultValueMax: caseStudy.CLIENT_RESULT_VALUE_MAX,
      testimonialQuoteMax: caseStudy.CLIENT_TESTIMONIAL_QUOTE_MAX,
      testimonialAuthorMax: caseStudy.CLIENT_TESTIMONIAL_AUTHOR_MAX,
    };
  }

  async function saveResults(input: Record<string, unknown>) {
    const { makeSaveCaseResults } = await import("@/modules/material/application/save-case-results");
    return makeSaveCaseResults(await formDeps(), await storyLimits())(await devActor(), input);
  }

  async function saveTestimonial(input: Record<string, unknown>) {
    const { makeSaveCaseTestimonial } = await import("@/modules/material/application/save-case-testimonial");
    return makeSaveCaseTestimonial(await formDeps(), await storyLimits())(await devActor(), input);
  }

  async function readForm(caseId: string) {
    const { makeGetDetailsForm } = await import("@/modules/material/application/get-details-form");
    return makeGetDetailsForm(await formDeps())({ caseId });
  }

  async function formRow(caseId: string) {
    const { rows } = await pool.query(
      "select context, solution, results, testimonial_quote, testimonial_author, updated_by from public.context_form where case_id = $1",
      [caseId],
    );
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

    const empty = { context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" };
    expect(await readForm(caseId)).toEqual({ ok: true, value: empty });
    expect(await formRow(caseId)).toEqual([]);

    expect(codeOf(await saveField({ caseId, field: "context", text: "Bando PNRR" }))).toBe("OK");
    expect(await formRow(caseId)).toEqual([
      { context: "Bando PNRR", solution: "", results: [], testimonial_quote: "", testimonial_author: "", updated_by: actor.id },
    ]);

    expect(codeOf(await saveField({ caseId, field: "solution", text: "App" }))).toBe("OK");
    expect(await readForm(caseId)).toEqual({ ok: true, value: { ...empty, context: "Bando PNRR", solution: "App" } });

    const { rows: before } = await pool.query("select updated_at from public.context_form where case_id = $1", [caseId]);
    expect(codeOf(await saveField({ caseId, field: "solution", text: "App" }))).toBe("OK");
    const { rows: after } = await pool.query("select updated_at from public.context_form where case_id = $1", [caseId]);
    expect(after).toEqual(before);

    expect(codeOf(await saveField({ caseId, field: "context", text: "" }))).toBe("OK");
    expect(await readForm(caseId)).toEqual({ ok: true, value: { ...empty, solution: "App" } });

    expect(await detailsEvents(caseId)).toEqual([
      { type: "details_saved", actor_id: actor.id, data: { field: "context" } },
      { type: "details_saved", actor_id: actor.id, data: { field: "solution" } },
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

  it("the old free-text results is no text field any more (Story 2.21) → UNKNOWN_FIELD", async () => {
    const created = await createCase();
    expect(codeOf(await saveField({ caseId: created.id, field: "results", text: "x" }))).toBe("UNKNOWN_FIELD");
    await expect(
      pool.query("select public.save_context_field($1, 'results', 'x', $2)", [created.id, DEV_ACTOR_ID]),
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
    const viaAdapter = await repo.saveField(created.id, "solution", "x".repeat(5_001), DEV_ACTOR_ID);
    expect(codeOf(viaAdapter)).toBe("INVALID_INPUT");
    expect((await formRow(created.id))[0]).toMatchObject({ context: "è".repeat(5_000), solution: "" });
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
      { kind: "form_field", id: "solution" },
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
    for (const field of ["context", "solution"]) {
      expect(codeOf(await saveField({ caseId: created.id, field, text: "Compilato" }))).toBe("OK");
    }
    expect(codeOf(await saveResults({ caseId: created.id, results: [{ label: "Iscritti", value: "+30%" }] }))).toBe("OK");
    expect(codeOf(await saveTestimonial({ caseId: created.id, quote: "Sì.", author: "Anna" }))).toBe("OK");
    expect(await hasMaterialSql(created.id)).toBe(false);
    expect(await createSupabaseAssetRepository().hasMaterial(created.id)).toEqual({ ok: true, value: false });
  });

  // Story 2.21: Risultati and Testimonial.

  const TWO = [
    { label: "Candidature ricevute", value: "+180%" },
    { label: "Follower su LinkedIn", value: "+35%" },
  ];
  const resultsSql = (caseId: string, results: unknown) =>
    pool.query<{ previous: unknown }>("select public.save_case_results($1, $2::jsonb, $3) as previous", [
      caseId,
      JSON.stringify(results),
      DEV_ACTOR_ID,
    ]);

  it("the old results text column is gone; results is jsonb with the client's check, and the testimonial columns exist", async () => {
    const { rows } = await pool.query<{ column_name: string; data_type: string; column_default: string }>(
      `select column_name, data_type, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'context_form' and column_name in ('results', 'testimonial_quote', 'testimonial_author')
       order by column_name`,
    );
    expect(rows).toEqual([
      { column_name: "results", data_type: "jsonb", column_default: "'[]'::jsonb" },
      { column_name: "testimonial_author", data_type: "text", column_default: "''::text" },
      { column_name: "testimonial_quote", data_type: "text", column_default: "''::text" },
    ]);
  });

  it("save_case_results: 2 complete rows stored in order, one details_saved { field: 'results' }; the same list again writes nothing", async () => {
    const actor = await devActor();
    const created = await createCase();
    expect(await saveResults({ caseId: created.id, results: TWO })).toEqual({ ok: true, value: { results: TWO } });
    expect((await formRow(created.id))[0]).toMatchObject({ results: TWO, updated_by: actor.id });
    const { rows: before } = await pool.query("select updated_at from public.context_form where case_id = $1", [created.id]);
    expect(codeOf(await saveResults({ caseId: created.id, results: TWO }))).toBe("OK");
    const { rows: after } = await pool.query("select updated_at from public.context_form where case_id = $1", [created.id]);
    expect(after).toEqual(before);
    expect(await detailsEvents(created.id)).toEqual([{ type: "details_saved", actor_id: actor.id, data: { field: "results" } }]);
    expect(JSON.stringify(await detailsEvents(created.id))).not.toContain("Candidature");
    expect(await readForm(created.id)).toMatchObject({ ok: true, value: { results: TWO } });
  });

  it("save_case_results returns the previous list; [] on a case with no row creates none", async () => {
    const created = await createCase();
    expect((await resultsSql(created.id, [])).rows).toEqual([{ previous: [] }]);
    expect(await formRow(created.id)).toEqual([]);
    expect((await resultsSql(created.id, TWO)).rows).toEqual([{ previous: [] }]);
    expect((await resultsSql(created.id, [TWO[1]])).rows).toEqual([{ previous: TWO }]);
    expect((await resultsSql(created.id, [TWO[1]])).rows).toEqual([{ previous: [TWO[1]] }]);
  });

  it.each([
    ["4 rows", Array.from({ length: 4 }, () => ({ label: "a", value: "1" }))],
    ["a value of 21 characters", [{ label: "a", value: "x".repeat(21) }]],
    ["a label of 81 characters", [{ label: "x".repeat(81), value: "1" }]],
    ["a half row", [{ label: "a", value: "" }]],
    ["an untrimmed label", [{ label: " a", value: "1" }]],
    ["an extra key", [{ label: "a", value: "1", note: "x" }]],
    ["not an array", { label: "a", value: "1" }],
  ])("context_form_results_check refuses %s; nothing written", async (_label, results) => {
    const created = await createCase();
    await expect(inRolledBackTx("select public.save_case_results($1, $2::jsonb, $3)", [created.id, JSON.stringify(results), DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("context_form_results_check"),
    });
  });

  it("over the limit: the use case refuses with INVALID_INPUT; the adapter maps the check to INVALID_INPUT naming results", async () => {
    const created = await createCase();
    expect(codeOf(await saveResults({ caseId: created.id, results: [{ label: "a", value: "x".repeat(21) }] }))).toBe("INVALID_INPUT");
    const viaAdapter = await createSupabaseDetailsFormRepository().saveResults(created.id, [{ label: "a", value: "x".repeat(21) }], DEV_ACTOR_ID);
    expect(viaAdapter).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["results"] } } });
    expect(await formRow(created.id)).toEqual([]);
    expect(await detailsEvents(created.id)).toEqual([]);
  });

  it("save_case_testimonial: stores the pair, returns the previous one, one details_saved { field: 'testimonial' }", async () => {
    const actor = await devActor();
    const created = await createCase();
    expect(await saveTestimonial({ caseId: created.id, quote: " Un lavoro chiaro. ", author: "Anna Rossi, CMO" })).toEqual({
      ok: true,
      value: { quote: "Un lavoro chiaro.", author: "Anna Rossi, CMO" },
    });
    expect((await formRow(created.id))[0]).toMatchObject({ testimonial_quote: "Un lavoro chiaro.", testimonial_author: "Anna Rossi, CMO" });
    expect(codeOf(await saveTestimonial({ caseId: created.id, quote: "Un lavoro chiaro.", author: "Anna Rossi, CMO" }))).toBe("OK");
    expect(await detailsEvents(created.id)).toEqual([{ type: "details_saved", actor_id: actor.id, data: { field: "testimonial" } }]);
    const { rows } = await pool.query("select public.save_case_testimonial($1, '', '', $2) as previous", [created.id, DEV_ACTOR_ID]);
    expect(rows).toEqual([{ previous: { quote: "Un lavoro chiaro.", author: "Anna Rossi, CMO" } }]);
    expect(await readForm(created.id)).toMatchObject({ ok: true, value: { testimonialQuote: "", testimonialAuthor: "" } });
  });

  it("save_case_testimonial('', '') on a case with no row returns the empty pair and inserts nothing", async () => {
    const created = await createCase();
    const { rows } = await pool.query("select public.save_case_testimonial($1, '', '', $2) as previous", [created.id, DEV_ACTOR_ID]);
    expect(rows).toEqual([{ previous: { quote: "", author: "" } }]);
    expect(await formRow(created.id)).toEqual([]);
    expect(codeOf(await saveTestimonial({ caseId: created.id, quote: "", author: "" }))).toBe("OK");
    expect(await formRow(created.id)).toEqual([]);
    expect(await detailsEvents(created.id)).toEqual([]);
  });

  it("an author without a quote is refused by the use case and by context_form_testimonial_check", async () => {
    const created = await createCase();
    expect(codeOf(await saveTestimonial({ caseId: created.id, quote: "", author: "Anna" }))).toBe("INVALID_INPUT");
    await expect(inRolledBackTx("select public.save_case_testimonial($1, '', 'Anna', $2)", [created.id, DEV_ACTOR_ID])).rejects.toMatchObject({
      code: "23514",
      message: expect.stringContaining("context_form_testimonial_check"),
    });
    const viaAdapter = await createSupabaseDetailsFormRepository().saveTestimonial(created.id, "", "Anna", DEV_ACTOR_ID);
    expect(viaAdapter).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["quote"] } } });
    expect(await formRow(created.id)).toEqual([]);
  });

  it("600 and 120 characters fit; 601 and 121 are refused by the table checks", async () => {
    const created = await createCase();
    expect(codeOf(await saveTestimonial({ caseId: created.id, quote: "è".repeat(600), author: "a".repeat(120) }))).toBe("OK");
    await expect(
      inRolledBackTx("select public.save_case_testimonial($1, $2, '', $3)", [created.id, "x".repeat(601), DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("context_form_testimonial_quote_check") });
    await expect(
      inRolledBackTx("select public.save_case_testimonial($1, 'Sì.', $2, $3)", [created.id, "x".repeat(121), DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("context_form_testimonial_author_check") });
  });

  it("a soft-deleted case → NOT_FOUND from both functions; nothing written", async () => {
    const created = await createCase();
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [created.id]);
    expect(codeOf(await saveResults({ caseId: created.id, results: TWO }))).toBe("NOT_FOUND");
    expect(codeOf(await saveTestimonial({ caseId: created.id, quote: "Sì.", author: "" }))).toBe("NOT_FOUND");
    await expect(resultsSql(created.id, TWO)).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
    await expect(
      pool.query("select public.save_case_testimonial($1, 'Sì.', '', $2)", [created.id, DEV_ACTOR_ID]),
    ).rejects.toMatchObject({ code: "P0001", message: "NOT_FOUND" });
    expect(await createSupabaseDetailsFormRepository().saveResults(created.id, TWO, DEV_ACTOR_ID)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await formRow(created.id)).toEqual([]);
    expect(await detailsEvents(created.id)).toEqual([]);
  });

  it("the texts, results and testimonial save independently: each leaves the others untouched", async () => {
    const created = await createCase();
    await saveField({ caseId: created.id, field: "context", text: "Bando PNRR" });
    await saveResults({ caseId: created.id, results: TWO });
    await saveTestimonial({ caseId: created.id, quote: "Sì.", author: "Anna" });
    await saveField({ caseId: created.id, field: "solution", text: "App" });
    expect(await readForm(created.id)).toEqual({
      ok: true,
      value: { context: "Bando PNRR", solution: "App", results: TWO, testimonialQuote: "Sì.", testimonialAuthor: "Anna" },
    });
  });

  it("the browser key is refused calling save_case_results and save_case_testimonial", async () => {
    const results = await browser().rpc("save_case_results", { p_case_id: UNKNOWN_ID, p_results: [], p_actor_id: DEV_ACTOR_ID });
    expect(results.data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(results.error?.code);
    const testimonial = await browser().rpc("save_case_testimonial", {
      p_case_id: UNKNOWN_ID,
      p_quote: "",
      p_author: "",
      p_actor_id: DEV_ACTOR_ID,
    });
    expect(testimonial.data).toBeNull();
    expect(["42501", "PGRST202"]).toContain(testimonial.error?.code);
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
    save_case_results: `select public.save_case_results('${UNKNOWN_ID}', '[]'::jsonb, '${DEV_ACTOR_ID}')`,
    save_case_testimonial: `select public.save_case_testimonial('${UNKNOWN_ID}', '', '', '${DEV_ACTOR_ID}')`,
  };
  const roleCases = (["anon", "authenticated"] as const).flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(roleCases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(inRolledBackTx(sql, [], role)).rejects.toMatchObject({ code: "42501" });
  });
});

// Story 2.11: the private `material` bucket and the Supabase Storage adapter.

describe("material storage bucket", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  const storage = () => createSupabaseObjectStorage();

  /** A fresh case, a fresh asset id and the object's key for `contentType`. */
  async function freshTarget(contentType: AllowedContentType) {
    const created = await createCase();
    const assetId = randomUUID();
    return { target: { caseId: created.id, assetId, contentType }, path: assetKey(created.id, assetId, contentType) };
  }

  /** A tiny PNG body (the bucket checks only the declared type, not the bytes). */
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

  it("exists, is private, and has the MAX_FILE_BYTES (50 MB) limit and exactly the allowlist plus SVG (client logos only)", async () => {
    const { rows } = await pool.query<{ id: string; public: boolean; limit: string; types: string[] }>(
      "select id, public, file_size_limit::text as limit, allowed_mime_types as types from storage.buckets where id = $1",
      [MATERIAL_BUCKET],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "material", public: false, limit: String(MAX_FILE_BYTES) });
    // `image/svg+xml` is there for client logos only (20261019160000); project files still refuse it at presign.
    expect([...rows[0].types].sort()).toEqual([...ALLOWED_CONTENT_TYPES, "image/svg+xml"].sort());
    expect(ALLOWED_CONTENT_TYPES).not.toContain("image/svg+xml");
  });

  it("has no storage.objects policy that could reach it (only the service role does)", async () => {
    // A policy reaches `material` when it names the bucket, or when it doesn't
    // filter on bucket_id at all (it then applies to every bucket).
    const { rows } = await pool.query(
      `select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and ((coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%material%'
               or (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not ilike '%bucket_id%')`,
    );
    expect(rows).toEqual([]);
  });

  it("round trip: presign → upload to the signed URL → head gives size and type → confirm → signed thumbnail", async () => {
    const { makeConfirmUpload } = await import("@/modules/material/application/confirm-upload");
    const { makeListAssets } = await import("@/modules/material/application/list-assets");
    const caseStudy = await loadCaseStudy();
    const actor = await devActor();
    const { target, path } = await freshTarget("image/png");

    const presigned = await storage().presignUpload(target, MAX_FILE_BYTES);
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    expect(presigned.value.method).toBe("PUT");
    expect(presigned.value.headers).toEqual({ "content-type": "image/png", "x-upsert": "false" });
    const url = new URL(presigned.value.url);
    expect(url.pathname).toContain(`/object/upload/sign/${MATERIAL_BUCKET}/${path}`);
    const token = url.searchParams.get("token");
    expect(token).toBeTruthy();

    const { error: uploadError } = await browser()
      .storage.from(MATERIAL_BUCKET)
      .uploadToSignedUrl(path, token as string, PNG_BYTES, { contentType: "image/png", upsert: false });
    expect(uploadError).toBeNull();

    expect(await storage().head(target)).toEqual({ ok: true, value: { sizeBytes: PNG_BYTES.byteLength, contentType: "image/png" } });

    const jobs = await import("@/modules/jobs");
    const deps = {
      assets: createSupabaseAssetRepository(),
      renditions: createSupabaseRenditionRepository(),
      jobs,
      storage: storage(),
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
    };
    const confirmed = await makeConfirmUpload({ ...deps, form: createSupabaseDetailsFormRepository(), newId: randomUUID })(actor, {
      caseId: target.caseId,
      assetId: target.assetId,
      contentType: "image/png",
      fileName: "key.png",
    });
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) expect(confirmed.value.sizeBytes).toBe(PNG_BYTES.byteLength);
    const { rows } = await pool.query("select s3_key from public.asset where id = $1", [target.assetId]);
    expect(rows).toEqual([{ s3_key: path }]);

    const listed = await makeListAssets(deps)({ caseId: target.caseId });
    if (!listed.ok) throw new Error(`list failed: ${listed.error.code}`);
    const thumbnail = listed.value[0].thumbnailUrl;
    expect(thumbnail).toEqual(expect.any(String));
    // The confirm queued its rendition job, so the image waits for its thumb (original meanwhile).
    expect(listed.value[0].thumbnailPending).toBe(true);
    const fetched = await fetch(thumbnail as string);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/png");
    expect(fetched.headers.get("content-disposition") ?? "").not.toMatch(/attachment/i);
    expect(new Uint8Array(await fetched.arrayBuffer())).toEqual(PNG_BYTES);
    // The signed token is a JWT valid for the thumbnail TTL: 15 minutes.
    const jwt = new URL(thumbnail as string).searchParams.get("token") as string;
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")) as { iat: number; exp: number };
    expect(Math.abs(claims.exp - claims.iat - 900)).toBeLessThanOrEqual(5);
  });

  it("the browser's request shape works: a raw PUT with the given headers, and a second PUT never overwrites", async () => {
    const { target } = await freshTarget("application/pdf");
    const presigned = await storage().presignUpload(target, MAX_FILE_BYTES);
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { url, method, headers } = presigned.value;
    const body = new Blob(["%PDF-1.4 tiny"], { type: "application/pdf" });

    const first = await fetch(url, { method, headers, body });
    expect(first.status).toBe(200);
    expect(await storage().head(target)).toEqual({ ok: true, value: { sizeBytes: body.size, contentType: "application/pdf" } });

    const second = await fetch(url, { method, headers, body: new Blob(["%PDF-1.4 replaced!"]) });
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.status).toBeLessThan(500);
    expect(await storage().head(target)).toEqual({ ok: true, value: { sizeBytes: body.size, contentType: "application/pdf" } });
  });

  it("refuses a type outside the bucket's list (4xx) and stores nothing", async () => {
    const { target } = await freshTarget("image/png");
    const presigned = await storage().presignUpload(target, MAX_FILE_BYTES);
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { url, method } = presigned.value;
    const refused = await fetch(url, { method, headers: { "content-type": "application/zip", "x-upsert": "false" }, body: PNG_BYTES });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.status).toBeLessThan(500);
    expect(await storage().head(target)).toEqual({ ok: true, value: null });
  });

  it("head of an object never uploaded is null, so confirm answers UPLOAD_NOT_FOUND", async () => {
    const { makeConfirmUpload } = await import("@/modules/material/application/confirm-upload");
    const caseStudy = await loadCaseStudy();
    const { target } = await freshTarget("image/png");
    expect(await storage().head(target)).toEqual({ ok: true, value: null });

    const confirmed = await makeConfirmUpload({
      assets: createSupabaseAssetRepository(),
      renditions: createSupabaseRenditionRepository(),
      jobs: await import("@/modules/jobs"),
      form: createSupabaseDetailsFormRepository(),
      storage: storage(),
      cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
      newId: randomUUID,
    })(await devActor(), { caseId: target.caseId, assetId: target.assetId, contentType: "image/png", fileName: "x.png" });
    expect(confirmed.ok).toBe(false);
    if (!confirmed.ok) expect(confirmed.error.code).toBe("UPLOAD_NOT_FOUND");
    expect(await liveCount(target.caseId)).toBe(0);
  });

  it("the browser key is refused writing, signing and reading in the bucket", async () => {
    const { target, path } = await freshTarget("image/png");
    const bucket = browser().storage.from(MATERIAL_BUCKET);

    const upload = await bucket.upload(path, PNG_BYTES, { contentType: "image/png", upsert: false });
    expect(upload.data).toBeNull();
    expect(upload.error).not.toBeNull();

    const signUpload = await bucket.createSignedUploadUrl(path);
    expect(signUpload.data).toBeNull();
    expect(signUpload.error).not.toBeNull();
    expect(await storage().head(target)).toEqual({ ok: true, value: null });

    // An object the service role stored is still invisible to the browser key.
    const presigned = await storage().presignUpload(target, MAX_FILE_BYTES);
    if (!presigned.ok) throw new Error(`presign failed: ${presigned.error.code}`);
    const { url, method, headers } = presigned.value;
    expect((await fetch(url, { method, headers, body: PNG_BYTES })).status).toBe(200);

    const download = await bucket.download(path);
    expect(download.data).toBeNull();
    expect(download.error).not.toBeNull();
    const signGet = await bucket.createSignedUrl(path, 60);
    expect(signGet.data).toBeNull();
    expect(signGet.error).not.toBeNull();
    const listing = await bucket.list(`cases/${target.caseId}/assets/${target.assetId}`);
    expect(listing.data ?? []).toEqual([]);
  });
});
