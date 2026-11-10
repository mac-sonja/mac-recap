// Story 5.3: DB-level checks of the `export` table and the `rendering` bucket, and the
// real export repository and storage adapters, against the local Supabase stack. Run
// with `npm run test:db`. Export rows are immutable, so every test uses fresh hashes.
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ACTOR_ID } from "../helpers/db-actor";
import { createSupabaseExportRepository } from "@/modules/rendering/adapters/supabase/export-repository";
import { createSupabaseExportStorage, exportKey, RENDERING_BUCKET } from "@/modules/rendering/adapters/supabase/export-storage";
import { EXPORT_RECORD_FORMATS, type ExportFormatId, type ExportRecordFormat, type NewExport } from "@/modules/rendering/domain/export";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;

const CASE_ID = "cccccccc-0000-4000-8000-0000000000f1";
const REVISION_ID = "eeeeeeee-0000-4000-8000-0000000000f1";

let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 4 });
});

afterAll(async () => {
  await pool.end();
});

const freshHash = () => createHash("sha256").update(randomUUID()).digest("hex");

const row = (format: ExportRecordFormat = "presentazione_16_9", hash = freshHash()): NewExport => ({
  contentHash: hash,
  format,
  parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }],
  path: exportKey(hash, format),
  contentType: format === "presentazione_16_9" ? "application/pdf" : "application/zip",
  sizeBytes: 1234,
  createdBy: TEST_ACTOR_ID,
});

const INSERT = `insert into public.export (content_hash, format, parts, path, content_type, size_bytes, created_by)
  values ($1, $2, $3::jsonb, $4, $5, $6, $7) returning id`;
const params = (r: NewExport) => [r.contentHash, r.format, JSON.stringify(r.parts), r.path, r.contentType, r.sizeBytes, r.createdBy];

/** Runs `sql` (as `role` when given) inside a transaction that is always rolled back. */
async function inRolledBackTx(sql: string, values: unknown[] = [], role?: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (role) await client.query(`set local role ${role}`);
    return await client.query(sql, values);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

describe("migration", () => {
  it("creates export with RLS on, no policies, and content_hash unique", async () => {
    const { rows } = await pool.query(
      `select c.relrowsecurity as rls, (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
         from pg_catalog.pg_class c where c.oid = 'public.export'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, policies: 0 }]);
    const { rows: keys } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where conrelid = 'public.export'::regclass and contype in ('p', 'u') order by contype`,
    );
    expect(keys.map((k) => k.def)).toEqual(["PRIMARY KEY (id)", "UNIQUE (content_hash)"]);
  });

  it("has exactly the story's columns", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'export' order by column_name",
    );
    expect(rows.map((r) => r.column_name)).toEqual(["content_hash", "content_type", "created_at", "created_by", "format", "id", "parts", "path", "size_bytes"]);
  });

  it("checks format against exactly EXPORT_RECORD_FORMATS (the export formats and `bundle`, Story 5.4)", async () => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
        where conrelid = 'public.export'::regclass and conname = 'export_format_check'`,
    );
    expect([...rows[0].def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()).toEqual([...EXPORT_RECORD_FORMATS].sort());
  });

  it("creates the private rendering bucket for PDF and ZIP only", async () => {
    const { rows } = await pool.query("select public, file_size_limit::text as file_size_limit, allowed_mime_types from storage.buckets where id = $1", [RENDERING_BUCKET]);
    expect(rows).toEqual([{ public: false, file_size_limit: "52428800", allowed_mime_types: ["application/pdf", "application/zip"] }]);
  });
});

describe("rows", () => {
  it("refuses a second row with the same content hash", async () => {
    const first = row();
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(INSERT, params(first));
      await expect(client.query(INSERT, params({ ...first, sizeBytes: 99 }))).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("accepts a bundle row: a ZIP at exports/{hash}/bundle.zip (Story 5.4)", async () => {
    const bundle = row("bundle");
    expect(bundle.path).toBe(`exports/${bundle.contentHash}/bundle.zip`);
    expect((await inRolledBackTx(INSERT, params(bundle), "service_role")).rowCount).toBe(1);
  });

  it("accepts a client pack row: the intro and the cases as its parts, in order (Story 5.9a, no migration)", async () => {
    const pack: NewExport = {
      ...row(),
      parts: [
        { subject: { kind: "client_intro", id: "bbbbbbbb-0000-4000-8000-0000000000f1" }, revisionId: REVISION_ID },
        { subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID },
        { subject: { kind: "case", id: "cccccccc-0000-4000-8000-0000000000f2" }, revisionId: REVISION_ID },
      ],
    };
    expect((await inRolledBackTx(INSERT, params(pack), "service_role")).rowCount).toBe(1);
  });

  it.each([
    ["a bundle at another path", (r: NewExport) => ({ ...r, format: "bundle" as const, contentType: "application/zip" as const, path: `exports/${r.contentHash}/carosello_1_1.zip` })],
    ["a bundle as a PDF", (r: NewExport) => ({ ...r, format: "bundle" as const, contentType: "application/pdf" as const, path: `exports/${r.contentHash}/bundle.pdf` })],
    ["a path that is not the export's key", (r: NewExport) => ({ ...r, path: `exports/${r.contentHash}/other.pdf` })],
    ["a Presentazione as a ZIP", (r: NewExport) => ({ ...r, contentType: "application/zip" as const })],
    ["Video", (r: NewExport) => ({ ...r, format: "video_9_16" as ExportFormatId })],
    ["an empty parts list", (r: NewExport) => ({ ...r, parts: [] })],
    ["a short hash", (r: NewExport) => ({ ...r, contentHash: "abc" })],
    ["no size", (r: NewExport) => ({ ...r, sizeBytes: 0 })],
  ])("refuses %s", async (_, change) => {
    await expect(inRolledBackTx(INSERT, params(change(row())))).rejects.toMatchObject({ code: "23514" });
  });

  it("is immutable: no update or delete, even for the table owner", async () => {
    const r = row();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<{ id: string }>(INSERT, params(r));
      await client.query("savepoint s");
      await expect(client.query("update public.export set size_bytes = 1 where id = $1", [rows[0].id])).rejects.toMatchObject({
        code: "P0001",
      });
      await client.query("rollback to savepoint s");
      await expect(client.query("delete from public.export where id = $1", [rows[0].id])).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("lets the service role read and insert, never update or delete", async () => {
    const r = row();
    expect((await inRolledBackTx(INSERT, params(r), "service_role")).rowCount).toBe(1);
    await expect(inRolledBackTx("update public.export set size_bytes = 1", [], "service_role")).rejects.toMatchObject({ code: "42501" });
    await expect(inRolledBackTx("delete from public.export", [], "service_role")).rejects.toMatchObject({ code: "42501" });
  });

  it.each(["anon", "authenticated"])("denies %s every access", async (role) => {
    await expect(inRolledBackTx("select * from public.export", [], role)).rejects.toMatchObject({ code: "42501" });
    await expect(inRolledBackTx(INSERT, params(row()), role)).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses the browser key", async () => {
    const browser = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await browser.from("export").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("export repository and storage adapters", () => {
  it("inserts a row, finds it by hash and id, and returns the stored row for a second insert of the same hash", async () => {
    const exports = createSupabaseExportRepository();
    const r = row("carosello_1_1");
    const inserted = await exports.insert(r);
    expect(inserted).toMatchObject({ ok: true, value: { ...r, id: expect.any(String) } });
    if (!inserted.ok) return;
    expect(await exports.findByHash(r.contentHash)).toEqual({ ok: true, value: inserted.value });
    expect(await exports.findById(inserted.value.id)).toEqual({ ok: true, value: inserted.value });
    const again = await exports.insert({ ...r, sizeBytes: 999 });
    expect(again).toEqual({ ok: true, value: inserted.value });
    expect(await exports.findByHash(freshHash())).toEqual({ ok: true, value: null });
  });

  it("a client edit gives a second row: two hashes, two rows (Story 5.3 acceptance)", async () => {
    const exports = createSupabaseExportRepository();
    const before = await exports.insert(row());
    const after = await exports.insert(row());
    expect(before.ok && after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.value.id).not.toBe(before.value.id);
  });

  it("stores a file at exports/{hash}/{format}.{ext} and signs a download of at most 15 minutes named as asked", async () => {
    const storage = createSupabaseExportStorage();
    const hash = freshHash();
    const bytes = new TextEncoder().encode("%PDF-1.7 test");
    const stored = await storage.upload({ contentHash: hash, format: "presentazione_16_9" }, bytes);
    expect(stored).toEqual({ ok: true, value: { path: `exports/${hash}/presentazione_16_9.pdf` } });
    if (!stored.ok) return;
    const url = await storage.presignDownload(stored.value.path, 3600, "LUM-2026-01 Rebrand – Presentazione.pdf");
    expect(url.ok).toBe(true);
    if (!url.ok) return;
    const token = new URL(url.value).searchParams.get("token") ?? "";
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp: number; iat: number };
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(15 * 60);
    const response = await fetch(url.value);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-disposition") ?? "").toContain("attachment");
  });

  it("stores a bundle at exports/{hash}/bundle.zip and reads it back (Story 5.4)", async () => {
    const storage = createSupabaseExportStorage();
    const hash = freshHash();
    const bytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
    const stored = await storage.upload({ contentHash: hash, format: "bundle" }, bytes);
    expect(stored).toEqual({ ok: true, value: { path: `exports/${hash}/bundle.zip` } });
    if (!stored.ok) return;
    expect(await storage.read(stored.value.path)).toEqual({ ok: true, value: bytes });
    const inserted = await createSupabaseExportRepository().insert(row("bundle", hash));
    expect(inserted).toMatchObject({ ok: true, value: { format: "bundle", path: stored.value.path, contentType: "application/zip" } });
  });

  it("refuses to sign anything but an export key", async () => {
    expect(await createSupabaseExportStorage().presignDownload("cases/x/original.pdf", 60, "x.pdf")).toMatchObject({ ok: false });
  });
});
