// Story 5.11b: a collection's export applies the collection's own edits (words of free texts,
// hidden pages, page orders, a client intro's hides) by the rules its page uses, and its content
// hash covers them: the same edits give the stored file, a changed edit makes a running job and
// the status check answer EXPORT_STALE.
import { describe, expect, it, vi } from "vitest";
import type { Job } from "@/modules/jobs";
import { storeZip, readStoredZip } from "@/modules/rendering/adapters/zip/store-zip";
import { makeExportHandler, type ExportHandlerDeps } from "@/modules/rendering/application/export-handler";
import { readCollectionSources } from "@/modules/rendering/application/export-source";
import { ACTOR, CLIENT_ID, COLLECTION_ID, collectionDeps, OTHER_CASE_ID, PACK_CASES } from "@/modules/rendering/application/export.fixtures";
import { makeCollectionStatus, makeRequestCollection } from "@/modules/rendering/application/request-export";
import { NO_COLLECTION_EDITS, type CollectionEditSet } from "@/modules/rendering/collection-edits";
import type { ExportRecord, NewExport } from "@/modules/rendering/domain/export";
import type { ExportBrowser } from "@/modules/rendering/ports/export-browser";
import { err, ok } from "@/shared/result";

const P = "presentazione_16_9" as const;
const C = "carosello_1_1" as const;
/** X's intro page's free title in the fixture document ("Il titolo del progetto…"). */
const TITLE = "eeeeeeee-0000-4000-8000-000000000003";

const sections = (html: string) => html.match(/<section class="mr-page"/g)?.length ?? 0;
/** Each page's key, in the file's order. */
const pageKeys = (html: string) => [...html.matchAll(/<section class="mr-page"[^>]*?data-page-key="([^"]+)"/g)].map((m) => m[1]);
const pageNumbers = (html: string) => [...html.matchAll(/data-page-number="(\d+)"/g)].map((m) => Number(m[1]));
const signal = () => new AbortController().signal;

/** The edits the matrix names, all at once. */
const EDITED: CollectionEditSet = {
  texts: [{ partKey: `case:${OTHER_CASE_ID}`, formatId: P, pageKey: "intro", elementId: TITLE, text: "Titolo della raccolta" }],
  hidden: [
    { partKey: `case:${PACK_CASES.A}`, formatId: P, pageKey: "contenuti-4" },
    { partKey: `client_intro:${CLIENT_ID}`, formatId: P, pageKey: "intro" },
  ],
  orders: [{ partKey: `case:${OTHER_CASE_ID}`, formatId: P, pageKeys: ["risultati", "contenuti-4", "intro"] }],
};

/** The collection A, B (client CLIENT_ID, wrapped by its intro), X (another client), with `edits`; a request, a status check and the handler on one export table. */
function rig(edits: CollectionEditSet = EDITED) {
  const seen: string[] = [];
  const browser = {
    pdf: vi.fn(async (html: string) => {
      seen.push(html);
      return new TextEncoder().encode(`%PDF-fake << /Type /Pages >> ${"<< /Type /Page >> ".repeat(sections(html))}`);
    }),
    pngs: vi.fn(async (html: string) => {
      seen.push(html);
      return Array.from({ length: sections(html) }, (_, i) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, i]));
    }),
  } satisfies ExportBrowser;
  const rows: ExportRecord[] = [];
  const files = new Map<string, Uint8Array>();
  const exports = {
    rows,
    findByHash: vi.fn(async (hash: string) => ok(rows.find((r) => r.contentHash === hash) ?? null)),
    findById: vi.fn(async (id: string) => ok(rows.find((r) => r.id === id) ?? null)),
    insert: vi.fn(async (r: NewExport) => {
      const record = { ...r, id: `88888888-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`, createdAt: "2026-11-11T10:00:00Z" } as ExportRecord;
      rows.push(record);
      return ok(record);
    }),
  };
  const getCollectionEdits = vi.fn(async () => ok<CollectionEditSet>(edits));
  const all: ExportHandlerDeps = {
    ...collectionDeps({}, { getCollectionEdits }),
    exports,
    storage: {
      upload: vi.fn(async ({ contentHash, format }: { contentHash: string; format: string }, bytes: Uint8Array) => {
        const path = `exports/${contentHash}/${format}`;
        files.set(path, bytes);
        return ok({ path });
      }),
      read: vi.fn(async (path: string) => (files.has(path) ? ok(files.get(path)!) : err({ code: "STORAGE_FAILED", message: "Missing." }))),
    },
    listCaseMedia: vi.fn(async () => ok([])),
    listClientMedia: vi.fn(async () => ok([])),
    getRendition: vi.fn(async () => err({ code: "NOT_FOUND", message: "none" })),
    getClientRendition: vi.fn(async () => err({ code: "NOT_FOUND", message: "none" })),
    readClientLogo: vi.fn(async () => ok(null)),
    fetchBytes: vi.fn(async () => new Uint8Array()),
    rasteriseSvg: vi.fn(async () => ok(new Uint8Array())),
    fontCss: vi.fn(async () => ""),
    browser,
    zip: vi.fn(storeZip),
    unzip: vi.fn(readStoredZip),
  };
  const jobs: Job[] = [];
  const requestDeps = {
    ...all,
    exports,
    storage: { presignDownload: vi.fn(async (path: string) => ok(`https://storage.test/signed/${path}`)) },
    enqueue: vi.fn(async (input: { subjectId: string; inputHash: string; payload: unknown }) => {
      const job = {
        id: `99999999-0000-4000-8000-00000000000${jobs.length + 1}`,
        kind: "export",
        subjectId: input.subjectId,
        inputHash: input.inputHash,
        payload: input.payload,
        status: "running",
        attempts: 1,
        maxAttempts: 3,
        lockedUntil: null,
        error: null,
        createdAt: "2026-11-11T10:00:00Z",
        updatedAt: "2026-11-11T10:00:00Z",
        finishedAt: null,
      } as Job;
      jobs.push(job);
      return ok({ id: job.id });
    }),
    getJobsFor: vi.fn(async () => ok(jobs)),
    recordEvent: vi.fn(async () => ok(null)),
    recordCollectionEvent: vi.fn(async () => ok(undefined)),
  };
  return {
    all,
    seen,
    rows,
    jobs,
    getCollectionEdits,
    request: makeRequestCollection(requestDeps),
    status: makeCollectionStatus(requestDeps),
    handler: makeExportHandler(all),
  };
}

describe("collection export with the collection's edits (Story 5.11b)", () => {
  it("draws the edited text, leaves out the hidden pages (the client intro's too), follows the saved order, numbered on", async () => {
    const r = rig();
    expect(await r.request(ACTOR, { collectionId: COLLECTION_ID, formats: [P] })).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(await r.handler.run(r.jobs[0]!, signal())).toEqual(ok(undefined));
    const html = r.seen[0]!;
    // Unedited: intro (client), A contenuti-4, A risultati, B contenuti-4, B risultati, closing, X intro, X contenuti-4, X risultati.
    expect(pageKeys(html)).toEqual(["risultati", "contenuti-4", "risultati", "closing", "risultati", "contenuti-4", "intro"]);
    expect(pageNumbers(html)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(html).toContain("Titolo della raccolta");
    // Only X's title changed: A's and B's own intro pages aren't drawn (wrapped), so the original shows nowhere.
    expect(html).not.toContain("Il titolo del progetto");
    // The edits read the collection only (the originals are never written: the export has no writer for them).
    expect(r.getCollectionEdits).toHaveBeenCalledWith(COLLECTION_ID);
  });

  it("applies the edits in their own format only: Carosello unchanged", async () => {
    const r = rig();
    const read = await readCollectionSources(r.all, COLLECTION_ID, [C]);
    if (!read.ok) throw new Error(read.error.code);
    const [drawing] = read.value.drawings;
    const plain = await readCollectionSources({ ...r.all, getCollectionEdits: async () => ok(NO_COLLECTION_EDITS) }, COLLECTION_ID, [C]);
    if (!plain.ok) throw new Error(plain.error.code);
    expect(drawing!.pageCount).toBe(plain.value.drawings[0]!.pageCount);
    expect(drawing!.contentHash).toBe(plain.value.drawings[0]!.contentHash);
  });

  it("exports a part whose every shown page is hidden as if none were hidden", async () => {
    const everyX: CollectionEditSet = {
      ...NO_COLLECTION_EDITS,
      hidden: ["intro", "contenuti-4", "risultati"].map((pageKey) => ({ partKey: `case:${OTHER_CASE_ID}`, formatId: P, pageKey })),
    };
    const read = await readCollectionSources(rig(everyX).all, COLLECTION_ID, [P]);
    const plain = await readCollectionSources(rig(NO_COLLECTION_EDITS).all, COLLECTION_ID, [P]);
    if (!read.ok || !plain.ok) throw new Error("read");
    expect(read.value.drawings[0]!.pageCount).toBe(plain.value.drawings[0]!.pageCount);
    // Nothing takes effect: the same file as with no edits.
    expect(read.value.drawings[0]!.contentHash).toBe(plain.value.drawings[0]!.contentHash);
  });

  it("hands out the stored file for the same edits, and a new one after an edit (the old one stale)", async () => {
    const r = rig();
    await r.request(ACTOR, { collectionId: COLLECTION_ID, formats: [P] });
    await r.handler.run(r.jobs[0]!, signal());
    const [row] = r.rows;
    // Again, no edit change: the stored file, no new job.
    expect(await r.request(ACTOR, { collectionId: COLLECTION_ID, formats: [P] })).toMatchObject({ ok: true, value: { status: "ready", exportId: row!.id } });
    expect(r.jobs).toHaveLength(1);
    expect(await r.status(ACTOR, { collectionId: COLLECTION_ID, exportId: row!.id })).toMatchObject({ ok: true, value: { status: "ready" } });

    // An edit saved after the export: the old file is stale, a request makes a new one.
    r.getCollectionEdits.mockResolvedValue(ok({ ...EDITED, texts: [{ ...EDITED.texts[0]!, text: "Un altro titolo" }] }));
    expect(await r.status(ACTOR, { collectionId: COLLECTION_ID, exportId: row!.id })).toMatchObject({ ok: false, error: { code: "EXPORT_STALE" } });
    expect(await r.request(ACTOR, { collectionId: COLLECTION_ID, formats: [P] })).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs[1]!.inputHash).not.toBe(r.jobs[0]!.inputHash);
  });

  it("refuses a running job with EXPORT_STALE when an edit is saved meanwhile", async () => {
    for (const changed of [
      { ...EDITED, hidden: EDITED.hidden.slice(1) },
      { ...EDITED, orders: [] },
      { ...EDITED, texts: [] },
    ]) {
      const r = rig();
      await r.request(ACTOR, { collectionId: COLLECTION_ID, formats: [P, C] });
      r.getCollectionEdits.mockResolvedValue(ok(changed));
      expect(await r.handler.run(r.jobs[0]!, signal())).toMatchObject({ ok: false, error: { code: "EXPORT_STALE", retryable: false } });
      expect(r.rows).toEqual([]);
    }
  });

  it("fails the read when the edits can't be read", async () => {
    const r = rig();
    r.getCollectionEdits.mockResolvedValue(err({ code: "COLLECTION_NOT_FOUND", message: "gone" }) as never);
    expect(await r.request(ACTOR, { collectionId: COLLECTION_ID, formats: [P] })).toMatchObject({ ok: false, error: { code: "COLLECTION_NOT_FOUND" } });
    expect(r.jobs).toEqual([]);
  });
});
