// Story 5.10a: collections (`collection`, `collection_item`, `collection_tag`, `collection_event`
// and their security-definer writers) and the module's use cases against the local Supabase
// stack. Run with `npm run test:db`. Clients and cases are never deleted, so every test uses its
// own clients.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import { createTestClient, TEST_INDUSTRY } from "../helpers/db-clients";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;

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

const collection = () => import("@/modules/collection");

/** A committed case of `clientId`; walked to Approvato through the repository's transitions when `approved`. */
async function caseOf(clientId: string, name: string, approved = true) {
  const { create } = await import("@/modules/case-study");
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

const tags = { businessLines: ["branding"], industries: [TEST_INDUSTRY] };
const itemsOf = async (id: string) =>
  (await pool.query("select case_id from public.collection_item where collection_id = $1 order by position", [id])).rows.map((r) => r.case_id as string);

async function created(caseIds: string[], name = "Pitch moda") {
  const { createCollection } = await collection();
  const result = await createCollection(await actor(), { name, ...tags, caseIds });
  if (!result.ok) throw new Error(`create failed: ${result.error.code}`);
  return result.value;
}

describe("collections (Story 5.10a)", () => {
  it("creates grouped by client, lists, renames, retags and deletes, logging each change", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const b = await createTestClient(pool, TEST_ACTOR_ID);
    const a1 = await caseOf(a.id, "A1");
    const b1 = await caseOf(b.id, "B1");
    const a2 = await caseOf(a.id, "A2");
    const made = await created([a1, b1, a2]);
    expect(made.caseIds).toEqual([a1, a2, b1]);
    expect(await itemsOf(made.collectionId)).toEqual([a1, a2, b1]);

    const { listCollections, renameCollection, retagCollection, deleteCollection, getCollection } = await collection();
    const listed = await listCollections();
    if (!listed.ok) throw new Error(listed.error.code);
    const row = listed.value.find((c) => c.id === made.collectionId);
    expect(row).toMatchObject({ name: "Pitch moda", caseCount: 3, tags, version: 1 });
    expect(row?.createdBy.id).toBe(TEST_ACTOR_ID);

    const renamed = await renameCollection(await actor(), { collectionId: made.collectionId, expectedVersion: 1, name: "Pitch lusso" });
    expect(renamed).toMatchObject({ ok: true, value: { version: 2, name: "Pitch lusso" } });
    // The same version again is stale.
    expect(await renameCollection(await actor(), { collectionId: made.collectionId, expectedVersion: 1, name: "X" })).toMatchObject({ ok: false, error: { code: "STALE_COLLECTION" } });
    const retagged = await retagCollection(await actor(), { collectionId: made.collectionId, expectedVersion: 2, businessLines: ["video"], industries: [TEST_INDUSTRY] });
    expect(retagged).toMatchObject({ ok: true, value: { version: 3 } });
    expect(await retagCollection(await actor(), { collectionId: made.collectionId, expectedVersion: 3, businessLines: ["video"], industries: ["no_such_sector_x"] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", details: { fields: ["businessLines", "industries"] } },
    });

    // The creation logs the initial tags with the name and cases.
    const createdData = (await pool.query("select data from public.collection_event where collection_id = $1 and type = 'collection_created'", [made.collectionId])).rows[0]?.data;
    expect(createdData).toEqual({ name: "Pitch moda", ...tags, caseIds: [a1, a2, b1] });
    const events = (await pool.query("select type, version from public.collection_event where collection_id = $1 order by version", [made.collectionId])).rows;
    expect(events).toEqual([
      { type: "collection_created", version: 1 },
      { type: "collection_renamed", version: 2 },
      { type: "collection_retagged", version: 3 },
    ]);

    expect(await deleteCollection(await actor(), { collectionId: made.collectionId })).toEqual({ ok: true, value: undefined });
    expect(await getCollection(made.collectionId)).toMatchObject({ ok: false, error: { code: "COLLECTION_NOT_FOUND" } });
    const after = await listCollections();
    expect(after.ok && after.value.some((c) => c.id === made.collectionId)).toBe(false);
  });

  it("adds, moves and removes with compare-and-set, keeping cases in their client's group", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const b = await createTestClient(pool, TEST_ACTOR_ID);
    const a1 = await caseOf(a.id, "A1");
    const a2 = await caseOf(a.id, "A2");
    const b1 = await caseOf(b.id, "B1");
    const b2 = await caseOf(b.id, "B2");
    const draft = await caseOf(b.id, "Draft", false);
    const made = await created([a1, a2, b1]);
    const { addCollectionItems, moveCollectionGroup, moveCollectionItem, removeCollectionItems } = await collection();
    const id = made.collectionId;

    expect(await addCollectionItems(await actor(), { collectionId: id, expectedVersion: 1, caseIds: [b2] })).toMatchObject({ ok: true, value: { version: 2, caseIds: [a1, a2, b1, b2] } });
    expect(await addCollectionItems(await actor(), { collectionId: id, expectedVersion: 2, caseIds: [draft] })).toMatchObject({ ok: false, error: { code: "CASE_NOT_COLLECTABLE" } });
    expect(await moveCollectionGroup(await actor(), { collectionId: id, expectedVersion: 1, clientId: b.id, to: 0 })).toMatchObject({ ok: false, error: { code: "STALE_COLLECTION" } });
    expect(await moveCollectionGroup(await actor(), { collectionId: id, expectedVersion: 2, clientId: b.id, to: 0 })).toMatchObject({ ok: true, value: { version: 3, caseIds: [b1, b2, a1, a2] } });
    expect(await moveCollectionItem(await actor(), { collectionId: id, expectedVersion: 3, caseId: a1, to: 1 })).toMatchObject({ ok: true, value: { version: 4, caseIds: [b1, b2, a2, a1] } });
    expect(await removeCollectionItems(await actor(), { collectionId: id, expectedVersion: 4, caseIds: [b1, b2, a2] })).toMatchObject({ ok: true, value: { caseIds: [a1] } });
    expect(await removeCollectionItems(await actor(), { collectionId: id, expectedVersion: 5, caseIds: [a1] })).toMatchObject({ ok: false, error: { code: "COLLECTION_LAST_ITEM" } });
    expect(await itemsOf(id)).toEqual([a1]);
  });

  it("refuses scattered groups, repeats and unapproved cases straight at the writer, writing nothing", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const b = await createTestClient(pool, TEST_ACTOR_ID);
    const a1 = await caseOf(a.id, "A1");
    const a2 = await caseOf(a.id, "A2");
    const b1 = await caseOf(b.id, "B1");
    const draft = await caseOf(b.id, "Draft", false);
    const made = await created([a1, a2, b1]);
    const call = (ids: string[]) =>
      pool.query("select public.set_collection_items($1, 1, $2, $3, 'collection_item_moved', '{}'::jsonb)", [made.collectionId, ids, TEST_ACTOR_ID]);
    await expect(call([a1, b1, a2])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(call([a1, a1])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(call([a1, a2, b1, draft])).rejects.toMatchObject({ message: "CASE_NOT_COLLECTABLE" });
    await expect(call([])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(pool.query("select public.create_collection('  ', $1, $2, $3, $4)", [tags.businessLines, tags.industries, [a1], TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(pool.query("select public.create_collection('P', $1, '{}', $2, $3)", [tags.businessLines, [a1], TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    expect(await itemsOf(made.collectionId)).toEqual([a1, a2, b1]);
  });

  it("keeps a case that lost its approval (Non disponibile), and drops a deleted one from reads", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const a1 = await caseOf(a.id, "A1");
    const a2 = await caseOf(a.id, "A2");
    const a3 = await caseOf(a.id, "A3");
    const made = await created([a1, a2, a3]);
    await pool.query("update public.case_study set deleted_at = now() where id = $1", [a3]);
    const { getCollection, listCollections, moveCollectionItem } = await collection();
    const detail = await getCollection(made.collectionId);
    if (!detail.ok) throw new Error(detail.error.code);
    expect(detail.value.items.map((i) => i.case.id)).toEqual([a1, a2]);
    // No approved revision was ever written for these test cases: each is "Non disponibile".
    expect(detail.value.items.every((i) => i.revision === null)).toBe(true);
    const listed = await listCollections();
    expect(listed.ok && listed.value.find((c) => c.id === made.collectionId)?.caseCount).toBe(2);
    // The next write leaves the deleted case out.
    expect(await moveCollectionItem(await actor(), { collectionId: made.collectionId, expectedVersion: 1, caseId: a2, to: 0 })).toMatchObject({ ok: true, value: { caseIds: [a2, a1] } });
    expect(await itemsOf(made.collectionId)).toEqual([a2, a1]);
  });

  it("refuses a stale version straight at the rename and tags writers, writing nothing", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const made = await created([await caseOf(a.id, "A1")]);
    await expect(pool.query("select public.rename_collection($1, 2, 'X', $2)", [made.collectionId, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "STALE_COLLECTION" });
    await expect(pool.query("select public.set_collection_tags($1, 2, $2, $3, $4)", [made.collectionId, tags.businessLines, tags.industries, TEST_ACTOR_ID])).rejects.toMatchObject({
      message: "STALE_COLLECTION",
    });
    const row = (await pool.query("select name, version from public.collection where id = $1", [made.collectionId])).rows[0];
    expect(row).toEqual({ name: "Pitch moda", version: 1 });
  });

  it("accepts exactly BUSINESS_LINES as business-line tags", async () => {
    const { BUSINESS_LINES } = await import("@/modules/case-study");
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const made = await created([await caseOf(a.id, "A1")]);
    const { retagCollection } = await collection();
    expect(await retagCollection(await actor(), { collectionId: made.collectionId, expectedVersion: 1, businessLines: [...BUSINESS_LINES], industries: [TEST_INDUSTRY] })).toMatchObject({ ok: true, value: { version: 2 } });
    // An unknown key, straight at the writer (the use case refuses it before).
    await expect(pool.query("select public.set_collection_tags($1, 2, $2, $3, $4)", [made.collectionId, ["no_such_line"], tags.industries, TEST_ACTOR_ID])).rejects.toMatchObject({
      message: "INVALID_INPUT",
    });
  });

  it("reads each live client's sector key, leaving a deleted client out (listClientIndustries)", async () => {
    const kept = await createTestClient(pool, TEST_ACTOR_ID);
    const gone = await createTestClient(pool, TEST_ACTOR_ID);
    await pool.query("update public.client set deleted_at = now() where id = $1", [gone.id]);
    const { listClientIndustries } = await import("@/modules/case-study");
    const read = await listClientIndustries();
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value[kept.id]).toBe(TEST_INDUSTRY);
    expect(gone.id in read.value).toBe(false);
  });

  it("denies anon and authenticated every table and writer", async () => {
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    for (const table of ["collection", "collection_item", "collection_tag", "collection_event"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
    const { error } = await anon.rpc("delete_collection", { p_collection_id: "11111111-1111-4111-8111-111111111111", p_actor_id: TEST_ACTOR_ID });
    expect(error).not.toBeNull();
    const grants = await pool.query(
      "select has_function_privilege('authenticated', 'public.set_collection_items(uuid, integer, uuid[], uuid, text, jsonb)', 'execute') as auth, has_table_privilege('service_role', 'public.collection', 'insert') as insert",
    );
    expect(grants.rows[0]).toEqual({ auth: false, insert: false });
  });
});

describe("collection exports (Story 5.10b)", () => {
  it("logs collection_exported at the current version without bumping it; refuses a deleted collection", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const made = await created([await caseOf(a.id, "A1")]);
    const { recordCollectionExported, deleteCollection } = await collection();
    const exportId = "11111111-1111-4111-8111-111111111111";
    expect(await recordCollectionExported(await actor(), { collectionId: made.collectionId, exportId, format: "presentazione_16_9" })).toEqual({ ok: true, value: undefined });
    const events = await pool.query("select type, version, data from public.collection_event where collection_id = $1 and type = 'collection_exported'", [made.collectionId]);
    expect(events.rows).toEqual([{ type: "collection_exported", version: 1, data: { exportId, format: "presentazione_16_9" } }]);
    expect((await pool.query("select version from public.collection where id = $1", [made.collectionId])).rows[0]).toEqual({ version: 1 });

    expect(await deleteCollection(await actor(), { collectionId: made.collectionId })).toMatchObject({ ok: true });
    expect(await recordCollectionExported(await actor(), { collectionId: made.collectionId, exportId, format: "bundle" })).toMatchObject({
      ok: false,
      error: { code: "COLLECTION_NOT_FOUND" },
    });
    const grants = await pool.query(
      "select has_function_privilege('authenticated', 'public.record_collection_exported(uuid, uuid, uuid, text)', 'execute') as auth, has_function_privilege('service_role', 'public.record_collection_exported(uuid, uuid, uuid, text)', 'execute') as service",
    );
    expect(grants.rows[0]).toEqual({ auth: false, service: true });
  });
});

describe("collection edits (Story 5.11a)", () => {
  const F = "presentazione_16_9";

  /** An approved case of `clientId` whose live approved revision is the reference v2 case history. */
  async function caseWithRevision(clientId: string, name: string) {
    const caseId = await caseOf(clientId, name);
    const { caseHistoryV2 } = await import("@/modules/generation");
    const { FORMAT_IDS } = await import("@/modules/rendering");
    const doc = caseHistoryV2(FORMAT_IDS);
    const { rows } = await pool.query(
      `insert into public.revision (case_id, status, generated_doc, doc, schema_version, created_by) values ($1, 'approved', $2, $2, 2, $3) returning id`,
      [caseId, JSON.stringify(doc), TEST_ACTOR_ID],
    );
    await pool.query("update public.case_study set approved_revision_id = $2 where id = $1", [caseId, rows[0].id]);
    const pages = doc.formats[F]!.pages;
    type El = { elementId: string; type: string; text?: string; binding?: unknown; bindings?: unknown; items?: El[] };
    const all = (els: El[]): El[] => els.flatMap((el) => [el, ...all(el.items ?? [])]);
    const page = pages.find((p) => p.blocks.some((b) => all(b.elements as El[]).some((el) => el.type === "text" && el.text !== undefined)))!;
    const free = page.blocks.flatMap((b) => all(b.elements as El[])).find((el) => el.type === "text" && el.text !== undefined)!;
    return { caseId, pageKeys: pages.map((p) => p.pageKey), pageKey: page.pageKey, elementId: free.elementId, original: free.text! };
  }

  /** Every row of the originals a collection must never write: the case's revisions and row, the client and its intro. */
  async function originals(caseId: string, clientId: string) {
    const q = async (sql: string, id: string) => (await pool.query(sql, [id])).rows;
    return {
      revisions: await q("select id, status, doc, updated_at from public.revision where case_id = $1 order by id", caseId),
      caseRow: await q("select * from public.case_study where id = $1", caseId),
      client: await q("select * from public.client where id = $1", clientId),
      intros: await q("select * from public.client_intro where client_id = $1", clientId),
      introRevisions: await q("select r.id, r.updated_at from public.revision r join public.client_intro i on i.id = r.client_intro_id where i.client_id = $1", clientId),
    };
  }

  it("edits, restores, hides and reorders with compare-and-set, logging each, and never writes a revision, client or intro", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const { caseId, pageKeys, pageKey, elementId, original } = await caseWithRevision(a.id, "A1");
    const made = await created([caseId]);
    const id = made.collectionId;
    const before = await originals(caseId, a.id);
    const m = await collection();
    const part = { kind: "case", id: caseId };
    const ref = { collectionId: id, part, formatId: F, pageKey };

    expect(await m.setCollectionText(await actor(), { ...ref, expectedVersion: 1, elementId, text: "Parole della raccolta" })).toMatchObject({ ok: true, value: { version: 2 } });
    const stored = (await pool.query("select text, original_hash from public.collection_text_edit where collection_id = $1", [id])).rows;
    const { createHash } = await import("node:crypto");
    expect(stored).toEqual([{ text: "Parole della raccolta", original_hash: createHash("sha256").update(original, "utf8").digest("hex") }]);
    // Stale.
    expect(await m.setCollectionText(await actor(), { ...ref, expectedVersion: 1, elementId, text: "X" })).toMatchObject({ ok: false, error: { code: "STALE_COLLECTION" } });

    const edits = await m.getCollectionEdits(id);
    expect(edits).toMatchObject({ ok: true, value: { textEdits: [{ part, formatId: F, pageKey, elementId, text: "Parole della raccolta", originalChanged: false }] } });

    expect(await m.restoreCollectionText(await actor(), { ...ref, expectedVersion: 2, elementId })).toMatchObject({ ok: true, value: { version: 3 } });
    expect((await pool.query("select count(*)::int as n from public.collection_text_edit where collection_id = $1", [id])).rows[0].n).toBe(0);

    expect(await m.setCollectionPageHidden(await actor(), { ...ref, expectedVersion: 3, pageKey: pageKeys[0], hidden: true })).toMatchObject({ ok: true, value: { version: 4 } });
    // Hide every page but the last; the last is refused.
    let version = 4;
    for (const key of pageKeys.slice(1, -1)) {
      expect(await m.setCollectionPageHidden(await actor(), { ...ref, expectedVersion: version, pageKey: key, hidden: true })).toMatchObject({ ok: true });
      version += 1;
    }
    expect(await m.setCollectionPageHidden(await actor(), { ...ref, expectedVersion: version, pageKey: pageKeys.at(-1), hidden: true })).toMatchObject({ ok: false, error: { code: "COLLECTION_LAST_PAGE" } });
    expect(await m.setCollectionPageHidden(await actor(), { ...ref, expectedVersion: version, pageKey: pageKeys[0], hidden: false })).toMatchObject({ ok: true, value: { version: version + 1 } });
    version += 1;

    const reversed = [...pageKeys].reverse();
    expect(await m.setCollectionPageOrder(await actor(), { collectionId: id, expectedVersion: version, part, formatId: F, pageKeys: reversed })).toMatchObject({ ok: true, value: { version: version + 1 } });
    version += 1;
    expect(await m.setCollectionPageOrder(await actor(), { collectionId: id, expectedVersion: version, part, formatId: F, pageKeys: reversed.slice(1) })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", details: { fields: ["pageKeys"] } },
    });
    const read = await m.getCollectionEdits(id);
    if (!read.ok) throw new Error(read.error.code);
    expect(read.value.pageOrders).toEqual([{ part, formatId: F, pageKeys: reversed }]);
    expect(read.value.hiddenPages.map((h) => h.pageKey).sort()).toEqual(pageKeys.slice(1, -1).sort());

    const types = (await pool.query("select type from public.collection_event where collection_id = $1 order by version", [id])).rows.map((r) => r.type);
    expect(types.slice(0, 4)).toEqual(["collection_created", "collection_text_edited", "collection_text_restored", "collection_page_hidden"]);
    expect(types).toContain("collection_page_restored");
    expect(types.at(-1)).toBe("collection_pages_moved");

    // The originals are exactly as they were.
    expect(await originals(caseId, a.id)).toEqual(before);
  });

  it("shows the original changed when the case's approved text is updated after the edit", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const { caseId, pageKey, elementId } = await caseWithRevision(a.id, "A1");
    const made = await created([caseId]);
    const m = await collection();
    const part = { kind: "case", id: caseId };
    expect(await m.setCollectionText(await actor(), { collectionId: made.collectionId, expectedVersion: 1, part, formatId: F, pageKey, elementId, text: "Mia" })).toMatchObject({ ok: true });
    // A newer approved version with other words in that text.
    const { rows } = await pool.query("select doc from public.revision where case_id = $1", [caseId]);
    const doc = JSON.parse(JSON.stringify(rows[0].doc).replaceAll(`"elementId":"${elementId}"`, `"elementId":"${elementId}","__mark":1`));
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node !== null && typeof node === "object") {
        const o = node as Record<string, unknown>;
        if (o.__mark === 1) {
          delete o.__mark;
          o.text = "Nuove parole approvate";
        }
        Object.values(o).forEach(walk);
      }
    };
    walk(doc);
    const next = await pool.query(
      `insert into public.revision (case_id, status, generated_doc, doc, schema_version, created_by) values ($1, 'approved', $2, $2, 2, $3) returning id`,
      [caseId, JSON.stringify(doc), TEST_ACTOR_ID],
    );
    await pool.query("update public.case_study set approved_revision_id = $2 where id = $1", [caseId, next.rows[0].id]);
    expect(await m.getCollectionEdits(made.collectionId)).toMatchObject({ ok: true, value: { textEdits: [{ elementId, text: "Mia", originalChanged: true }] } });
  });

  it("refuses a part not in the collection straight at the writers, and a bound text in the module", async () => {
    const a = await createTestClient(pool, TEST_ACTOR_ID);
    const b = await createTestClient(pool, TEST_ACTOR_ID);
    const { caseId, pageKey } = await caseWithRevision(a.id, "A1");
    const other = await caseOf(b.id, "B1");
    const made = await created([caseId]);
    const m = await collection();
    // The client's intro part is the client of a case in it.
    expect(await m.setCollectionPageHidden(await actor(), { collectionId: made.collectionId, expectedVersion: 1, part: { kind: "client_intro", id: a.id }, formatId: F, pageKey: "x", hidden: false })).toMatchObject({
      ok: true,
    });
    await expect(pool.query("select public.set_collection_page_hidden($1, 2, 'case', $2, $3, 'x', true, $4)", [made.collectionId, other, F, TEST_ACTOR_ID])).rejects.toMatchObject({ message: "INVALID_INPUT" });
    await expect(pool.query("select public.set_collection_page_hidden($1, 2, 'client_intro', $2, $3, 'x', true, $4)", [made.collectionId, b.id, F, TEST_ACTOR_ID])).rejects.toMatchObject({
      message: "INVALID_INPUT",
    });
    await expect(pool.query("select public.set_collection_page_order($1, 1, 'case', $2, $3, $4, $5)", [made.collectionId, caseId, F, [pageKey], TEST_ACTOR_ID])).rejects.toMatchObject({
      message: "STALE_COLLECTION",
    });
    await expect(
      pool.query("select public.set_collection_text_edit($1, 2, 'case', $2, $3, $4, gen_random_uuid(), $5, $6, $7)", [made.collectionId, caseId, F, pageKey, "x".repeat(5001), "0".repeat(64), TEST_ACTOR_ID]),
    ).rejects.toMatchObject({ message: "INVALID_INPUT" });
    expect((await pool.query("select version from public.collection where id = $1", [made.collectionId])).rows[0]).toEqual({ version: 2 });
  });

  it("denies anon and authenticated the edit tables and writers", async () => {
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    for (const table of ["collection_text_edit", "collection_hidden_page", "collection_page_order"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
    const grants = await pool.query(
      `select has_function_privilege('authenticated', 'public.set_collection_text_edit(uuid, integer, text, uuid, text, text, uuid, text, text, uuid)', 'execute') as text_auth,
              has_function_privilege('anon', 'public.set_collection_page_order(uuid, integer, text, uuid, text, text[], uuid)', 'execute') as order_anon,
              has_function_privilege('service_role', 'public.set_collection_page_hidden(uuid, integer, text, uuid, text, text, boolean, uuid)', 'execute') as hidden_service,
              has_table_privilege('service_role', 'public.collection_text_edit', 'insert') as insert`,
    );
    expect(grants.rows[0]).toEqual({ text_auth: false, order_anon: false, hidden_service: true, insert: false });
  });
});
