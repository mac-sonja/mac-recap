import { describe, expect, it, vi } from "vitest";
import type { CaseStudyRevision } from "@/modules/case-study";
import type { Job } from "@/modules/jobs";
import { readStoredZip, storeZip } from "@/modules/rendering/adapters/zip/store-zip";
import { makeExportHandler, type ExportHandlerDeps } from "@/modules/rendering/application/export-handler";
import { bundleHashOf, readExportSource, readExportSources } from "@/modules/rendering/application/export-source";
import {
  ACTOR,
  CASE_ID,
  CLIENT_ID,
  PACK_CASES,
  packCaseRevision,
  packDeps,
  CASE_IMAGE,
  CLIENT_IMAGE,
  clientInfo,
  REVISION_ID,
  sourceDeps,
} from "@/modules/rendering/application/export.fixtures";
import { EXPORT_MAX_BYTES, type ExportFormatId, type ExportRecord, type ExportRecordFormat, type NewExport } from "@/modules/rendering/domain/export";
import type { ExportBrowser } from "@/modules/rendering/ports/export-browser";
import { err, ok } from "@/shared/result";

const OTHER_VIDEO = "aaaaaaaa-0000-4000-8000-000000000009";
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const PNG_LOGO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const FONT_CSS = "@font-face{font-family:Inter;src:url(data:font/woff2;base64,SU5URVI=) format(\"woff2\")}";

/** A stand-in PDF with one `/Type /Page` object per page (and the `/Pages` tree, which isn't one). */
const fakePdf = (pages: number) =>
  new TextEncoder().encode(`%PDF-fake << /Type /Pages >> ${"<< /Type /Page >> ".repeat(pages)}`);

const sections = (html: string) => html.match(/<section class="mr-page"/g)?.length ?? 0;

/** A browser that never starts Chromium: it keeps the HTML and answers one PNG per slide. */
function fakeBrowser() {
  const seen: { html: string; size: { width: number; height: number } }[] = [];
  const browser = {
    pdf: vi.fn(async (html: string, size: { width: number; height: number }) => {
      seen.push({ html, size });
      return fakePdf(sections(html));
    }),
    pngs: vi.fn(async (html: string, size: { width: number; height: number }) => {
      seen.push({ html, size });
      return Array.from({ length: sections(html) }, (_, i) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, i]));
    }),
  } satisfies ExportBrowser;
  return { browser, seen };
}

function deps(over: Partial<ExportHandlerDeps> = {}) {
  const { browser, seen } = fakeBrowser();
  const inserted: NewExport[] = [];
  /** The `rendering` bucket: what was uploaded, by path. */
  const files = new Map<string, Uint8Array>();
  const all = {
    ...sourceDeps(),
    exports: {
      findByHash: vi.fn(async (): Promise<ReturnType<typeof ok<ExportRecord | null>>> => ok(null)),
      insert: vi.fn(async (row: NewExport) => {
        inserted.push(row);
        return ok({ ...row, id: "88888888-0000-4000-8000-000000000001", createdAt: "2026-11-04T10:00:00Z" } as ExportRecord);
      }),
    },
    storage: {
      upload: vi.fn(async ({ contentHash, format }: { contentHash: string; format: ExportRecordFormat }, bytes: Uint8Array) => {
        const path = `exports/${contentHash}/${format}.${format === "presentazione_16_9" ? "pdf" : "zip"}`;
        files.set(path, bytes);
        return ok({ path });
      }),
      read: vi.fn(async (path: string) => {
        const bytes = files.get(path);
        return bytes === undefined ? err({ code: "STORAGE_FAILED", message: "Missing." }) : ok(bytes);
      }),
    },
    listCaseMedia: vi.fn(async () => ok([{ id: CASE_IMAGE, kind: "image" }, { id: OTHER_VIDEO, kind: "video" }])),
    listClientMedia: vi.fn(async () => ok([{ id: CLIENT_IMAGE, kind: "image" }])),
    getRendition: vi.fn(async (assetId: string) => ok({ url: `https://storage.test/case/${assetId}.webp`, contentType: "image/webp" })),
    getClientRendition: vi.fn(async (assetId: string) => ok({ url: `https://storage.test/client/${assetId}.webp`, contentType: "image/webp" })),
    readClientLogo: vi.fn(async () => ok<{ bytes: Uint8Array; contentType: string } | null>({ bytes: SVG, contentType: "image/svg+xml" })),
    fetchBytes: vi.fn(async (url: string) => new TextEncoder().encode(`bytes of ${url}`)),
    rasteriseSvg: vi.fn(async () => ok(PNG_LOGO)),
    fontCss: vi.fn(async () => FONT_CSS),
    browser,
    zip: vi.fn(storeZip),
    unzip: vi.fn(readStoredZip),
    ...over,
  };
  return { all, seen, inserted, files };
}

async function jobFor(d: ExportHandlerDeps, format: ExportFormatId, over: Partial<Job> = {}): Promise<Job> {
  const source = await readExportSource(d, CASE_ID, format);
  if (!source.ok) throw new Error(source.error.code);
  return {
    id: "99999999-0000-4000-8000-000000000001",
    kind: "export",
    subjectId: CASE_ID,
    inputHash: source.value.contentHash,
    payload: { parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }], format, requestedBy: ACTOR.id },
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    lockedUntil: null,
    error: null,
    createdAt: "2026-11-04T10:00:00Z",
    updatedAt: "2026-11-04T10:00:00Z",
    finishedAt: null,
    ...over,
  };
}

const signal = () => new AbortController().signal;
const b64 = (text: string) => Buffer.from(text).toString("base64");

/** The entries of a stored ZIP, read from its central directory. */
function zipNames(bytes: Uint8Array): string[] {
  const buf = Buffer.from(bytes);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const length = buf.readUInt16LE(at + 28);
    names.push(buf.subarray(at + 46, at + 46 + length).toString("utf8"));
    at += 46 + length + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return names;
}

describe("export handler (Story 5.3)", () => {
  it("prints a Presentazione as a 1920×1080 PDF, stores it under its hash and writes the export row", async () => {
    const { all, seen, inserted } = deps();
    const handler = makeExportHandler(all);
    const job = await jobFor(all, "presentazione_16_9");
    expect(await handler.run(job, signal())).toEqual(ok(undefined));

    expect(all.browser.pdf).toHaveBeenCalledOnce();
    expect(all.browser.pngs).not.toHaveBeenCalled();
    expect(seen[0].size).toEqual({ width: 1920, height: 1080 });
    expect(sections(seen[0].html)).toBe(3);
    const [[target, bytes]] = vi.mocked(all.storage.upload).mock.calls as unknown as [[{ contentHash: string; format: string }, Uint8Array]];
    expect(target).toEqual({ contentHash: job.inputHash, format: "presentazione_16_9" });
    expect(bytes).toEqual(fakePdf(3));
    expect(inserted).toEqual([
      {
        contentHash: job.inputHash,
        format: "presentazione_16_9",
        parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }],
        path: `exports/${job.inputHash}/presentazione_16_9.pdf`,
        contentType: "application/pdf",
        sizeBytes: bytes.byteLength,
        createdBy: ACTOR.id,
      },
    ]);
  });

  it("draws with the preview's renderer, still, with the fonts, renditions and logo inline: nothing to fetch, no script", async () => {
    const { all, seen } = deps();
    await makeExportHandler(all).run(await jobFor(all, "presentazione_16_9"), signal());
    const { html } = seen[0];
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(FONT_CSS);
    expect(html).toContain('data-template="mac-case@1"');
    expect(html).toContain("@page{size:1920px 1080px;margin:0}");
    // Case file: its display rendition; client file: the client rendition (deferred work 4.5c-2).
    expect(html).toContain(`data:image/webp;base64,${b64(`bytes of https://storage.test/case/${CASE_IMAGE}.webp`)}`);
    expect(html).toContain(`data:image/webp;base64,${b64(`bytes of https://storage.test/client/${CLIENT_IMAGE}.webp`)}`);
    expect(all.getRendition).toHaveBeenCalledExactlyOnceWith(CASE_IMAGE, "image.display");
    expect(all.getClientRendition).toHaveBeenCalledExactlyOnceWith(CLIENT_IMAGE, "image.display");
    // The SVG logo, rasterised.
    expect(all.rasteriseSvg).toHaveBeenCalledWith(SVG);
    expect(html).toContain(`data:image/png;base64,${Buffer.from(PNG_LOGO).toString("base64")}`);
    // The client's current name, the case's bound fields.
    expect(html).toContain("Lumen Srl");
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<video");
  });

  it("zips a Carosello as 01.png, 02.png… of 1080×1080 slides", async () => {
    const { all, seen, inserted } = deps();
    const job = await jobFor(all, "carosello_1_1");
    expect(await makeExportHandler(all).run(job, signal())).toEqual(ok(undefined));
    expect(all.browser.pngs).toHaveBeenCalledOnce();
    expect(seen[0].size).toEqual({ width: 1080, height: 1080 });
    const [[, bytes]] = vi.mocked(all.storage.upload).mock.calls as unknown as [[unknown, Uint8Array]];
    expect(zipNames(bytes)).toEqual(["01.png", "02.png", "03.png"]);
    expect(inserted[0]).toMatchObject({ format: "carosello_1_1", contentType: "application/zip", path: `exports/${job.inputHash}/carosello_1_1.zip` });
  });

  it("fails a Carosello whose slides didn't all come out", async () => {
    const { all } = deps();
    vi.mocked(all.browser.pngs).mockResolvedValueOnce([new Uint8Array([1])]);
    const outcome = await makeExportHandler(all).run(await jobFor(all, "carosello_1_1"), signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED", retryable: false } });
    expect(all.storage.upload).not.toHaveBeenCalled();
  });

  it("fails for good a PDF whose page count isn't the revision's", async () => {
    const { all } = deps();
    vi.mocked(all.browser.pdf).mockResolvedValueOnce(fakePdf(4));
    const outcome = await makeExportHandler(all).run(await jobFor(all, "presentazione_16_9"), signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED", retryable: false } });
    expect(all.storage.upload).not.toHaveBeenCalled();
  });

  it("fails for good a file larger than the bucket accepts", async () => {
    const { all } = deps({ zip: vi.fn(() => new Uint8Array(EXPORT_MAX_BYTES + 1)) });
    const outcome = await makeExportHandler(all).run(await jobFor(all, "carosello_1_1"), signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_TOO_LARGE", retryable: false } });
    expect(all.storage.upload).not.toHaveBeenCalled();
  });

  it.each(["LOGO_UNSAFE", "LOGO_RASTERISE_FAILED"])("draws the pages without the logo on %s, logging only ids", async (code) => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const { all, seen } = deps({ rasteriseSvg: vi.fn(async () => err({ code: code as Uppercase<string>, message: "x" })) });
      expect(await makeExportHandler(all).run(await jobFor(all, "presentazione_16_9"), signal())).toEqual(ok(undefined));
      expect(seen[0].html).not.toContain('class="mr-clogo"');
      const line = write.mock.calls.map(([chunk]) => String(chunk)).find((c) => c.includes(code));
      expect(JSON.parse(line ?? "{}")).toEqual({
        level: "warn",
        msg: `export drawn without the logo: ${code}`,
        time: expect.any(String),
        caseId: CASE_ID,
        clientId: clientInfo().clientId,
      });
    } finally {
      write.mockRestore();
    }
  });

  it("reuses a file already stored for the hash: no browser, no write", async () => {
    const { all } = deps();
    const job = await jobFor(all, "presentazione_16_9");
    vi.mocked(all.exports.findByHash).mockResolvedValue(ok({ id: "x" } as unknown as ExportRecord));
    expect(await makeExportHandler(all).run(job, signal())).toEqual(ok(undefined));
    expect(all.browser.pdf).not.toHaveBeenCalled();
    expect(all.exports.insert).not.toHaveBeenCalled();
  });

  it("re-checks approval: no approved revision any more fails at once, draws and stores nothing", async () => {
    const { all } = deps();
    const job = await jobFor(all, "presentazione_16_9");
    vi.mocked(all.getLiveRevision).mockResolvedValue(ok<CaseStudyRevision | null>(null));
    const outcome = await makeExportHandler(all).run(job, signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "NOT_APPROVED", retryable: false } });
    expect(all.browser.pdf).not.toHaveBeenCalled();
    expect(all.storage.upload).not.toHaveBeenCalled();
    expect(all.exports.insert).not.toHaveBeenCalled();
  });

  it("fails as EXPORT_STALE when the client changed since the request: the stored file never carries old content under a new hash", async () => {
    const { all } = deps();
    const job = await jobFor(all, "presentazione_16_9");
    vi.mocked(all.getClientInfoForCase).mockResolvedValue(ok(clientInfo({ name: "Lumen Spa" })));
    const outcome = await makeExportHandler(all).run(job, signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_STALE", retryable: false } });
    expect(all.browser.pdf).not.toHaveBeenCalled();
  });

  it.each(["RENDITION_NOT_READY", "NOT_FOUND"])("waits and retries when a referenced file's rendition is missing (%s): never stores a file without an image", async (code) => {
    const { all } = deps({ getClientRendition: vi.fn(async () => err({ code: code as Uppercase<string>, message: "Not yet." })) });
    const outcome = await makeExportHandler(all).run(await jobFor(all, "presentazione_16_9"), signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "RENDITION_NOT_READY", retryable: true } });
    expect(all.browser.pdf).not.toHaveBeenCalled();
    expect(all.storage.upload).not.toHaveBeenCalled();
    expect(all.exports.insert).not.toHaveBeenCalled();
  });

  it("retries when a rendition can't be read or the browser fails, and stores nothing", async () => {
    const broken = deps({ getRendition: vi.fn(async () => err({ code: "STORAGE_FAILED", message: "Down." })) });
    expect(await makeExportHandler(broken.all).run(await jobFor(broken.all, "presentazione_16_9"), signal())).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILED", retryable: true },
    });
    const crashed = deps();
    vi.mocked(crashed.all.browser.pdf).mockRejectedValueOnce(new Error("chromium crashed"));
    const outcome = await makeExportHandler(crashed.all).run(await jobFor(crashed.all, "presentazione_16_9"), signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED", retryable: true } });
    expect(crashed.all.storage.upload).not.toHaveBeenCalled();
  });

  it("draws a PNG logo as it is and no logo when the client has none", async () => {
    const png = deps({ readClientLogo: vi.fn(async () => ok<{ bytes: Uint8Array; contentType: string } | null>({ bytes: PNG_LOGO, contentType: "image/png" })) });
    await makeExportHandler(png.all).run(await jobFor(png.all, "presentazione_16_9"), signal());
    expect(png.all.rasteriseSvg).not.toHaveBeenCalled();
    expect(png.seen[0].html).toContain(`data:image/png;base64,${Buffer.from(PNG_LOGO).toString("base64")}`);

    const none = deps({ getClientInfoForCase: vi.fn(async () => ok(clientInfo({ logoId: null }))) });
    await makeExportHandler(none.all).run(await jobFor(none.all, "presentazione_16_9"), signal());
    expect(none.all.readClientLogo).not.toHaveBeenCalled();
    expect(none.seen[0].html).not.toContain('class="mr-clogo"');
  });

  it("stops when aborted, writing nothing", async () => {
    const { all } = deps();
    const job = await jobFor(all, "presentazione_16_9");
    const controller = new AbortController();
    controller.abort();
    expect(await makeExportHandler(all).run(job, controller.signal)).toMatchObject({ ok: false, error: { code: "ABORTED" } });
    expect(all.storage.upload).not.toHaveBeenCalled();
  });

  it("refuses a malformed payload for good, and maps the job to its case", async () => {
    const { all } = deps();
    const handler = makeExportHandler(all);
    const job = await jobFor(all, "presentazione_16_9");
    expect(await handler.run({ ...job, payload: { format: "video_9_16" } }, signal())).toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD", retryable: false },
    });
    expect(handler.caseIdOf?.(job)).toBe(CASE_ID);
    expect(handler.onPermanentFailure).toBeUndefined();
  });
});

describe("acceptance (Story 5.3)", () => {
  it("a case exported once, its client renamed, exported again: a second export row, and the new file has the new name", async () => {
    const { makeRequestExport } = await import("@/modules/rendering/application/request-export");
    const { all, seen } = deps();
    // One in-memory `export` table behind both the request and the worker.
    const rows: ExportRecord[] = [];
    const exports = {
      findByHash: vi.fn(async (hash: string) => ok(rows.find((r) => r.contentHash === hash) ?? null)),
      findById: vi.fn(async (id: string) => ok(rows.find((r) => r.id === id) ?? null)),
      insert: vi.fn(async (r: NewExport) => {
        const record = { ...r, id: `88888888-0000-4000-8000-00000000000${rows.length + 1}`, createdAt: "2026-11-04T10:00:00Z" } as ExportRecord;
        rows.push(record);
        return ok(record);
      }),
    };
    const jobs: Job[] = [];
    const request = makeRequestExport({
      ...all,
      exports,
      storage: { presignDownload: vi.fn(async () => ok("https://storage.test/signed")) },
      enqueue: vi.fn(async (input) => {
        const job = { ...(await jobFor(all, "presentazione_16_9")), id: `99999999-0000-4000-8000-00000000000${jobs.length + 1}`, inputHash: input.inputHash, payload: input.payload };
        jobs.push(job);
        return ok({ id: job.id });
      }),
      getJobsFor: vi.fn(async () => ok([])),
      recordEvent: vi.fn(async () => ok(null)),
    });
    const handler = makeExportHandler({ ...all, exports });
    const ask = { caseId: CASE_ID, format: "presentazione_16_9" };

    expect(await request(ACTOR, ask)).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(await handler.run(jobs[0], signal())).toEqual(ok(undefined));
    expect(await request(ACTOR, ask)).toMatchObject({ ok: true, value: { status: "ready" } });
    expect(rows).toHaveLength(1);

    vi.mocked(all.getClientInfoForCase).mockResolvedValue(ok(clientInfo({ name: "Lumen Rinnovata Spa" })));
    expect(await request(ACTOR, ask)).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(jobs).toHaveLength(2);
    expect(await handler.run(jobs[1], signal())).toEqual(ok(undefined));

    expect(rows).toHaveLength(2);
    expect(rows[1].contentHash).not.toBe(rows[0].contentHash);
    // The second row is keyed by the source as it reads now: the renamed client's hash.
    const now = await readExportSource(all, CASE_ID, "presentazione_16_9");
    expect(now.ok && now.value.contentHash).toBe(rows[1].contentHash);
    expect(seen).toHaveLength(2);
    expect(seen[0].html).toContain("Lumen Srl");
    expect(seen[1].html).toContain("Lumen Rinnovata Spa");
    expect(seen[1].html).not.toContain("Lumen Srl");
  });
});

/** An in-memory `export` table: rows by hash, as the repository keeps them. */
function memoryExports(rows: ExportRecord[] = []) {
  return {
    rows,
    findByHash: vi.fn(async (hash: string) => ok(rows.find((r) => r.contentHash === hash) ?? null)),
    findById: vi.fn(async (id: string) => ok(rows.find((r) => r.id === id) ?? null)),
    insert: vi.fn(async (r: NewExport) => {
      const record = { ...r, id: `88888888-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`, createdAt: "2026-11-04T10:00:00Z" } as ExportRecord;
      rows.push(record);
      return ok(record);
    }),
  };
}

const BOTH = ["carosello_1_1", "presentazione_16_9"] as const;

/** A bundle job of both formats, hashed as `requestExport` hashes it. */
async function bundleJobFor(d: ExportHandlerDeps, over: Partial<Job> = {}): Promise<Job> {
  const sources = await readExportSources(d, CASE_ID, ["presentazione_16_9", "carosello_1_1"]);
  if (!sources.ok) throw new Error(sources.error.code);
  const base = await jobFor(d, "presentazione_16_9");
  return {
    ...base,
    inputHash: bundleHashOf(sources.value),
    payload: { parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }], format: "bundle", formats: [...BOTH], requestedBy: ACTOR.id },
    ...over,
  };
}

describe("export handler, bundles (Story 5.4)", () => {
  it("renders both formats, then zips them: the PDF at the root under its 5.3 name, the PNGs in Carosello/", async () => {
    const exports = memoryExports();
    const { all, files } = deps({ exports });
    const job = await bundleJobFor(all);
    expect(await makeExportHandler(all).run(job, signal())).toEqual(ok(undefined));

    expect(all.browser.pdf).toHaveBeenCalledOnce();
    expect(all.browser.pngs).toHaveBeenCalledOnce();
    expect(exports.rows.map((r) => r.format)).toEqual(["presentazione_16_9", "carosello_1_1", "bundle"]);
    const bundle = exports.rows[2];
    expect(bundle).toMatchObject({
      contentHash: job.inputHash,
      path: `exports/${job.inputHash}/bundle.zip`,
      contentType: "application/zip",
      parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }],
      createdBy: ACTOR.id,
    });
    const zip = files.get(bundle.path);
    expect(zip?.byteLength).toBe(bundle.sizeBytes);
    const entries = readStoredZip(zip!);
    expect(entries.map((e) => e.name)).toEqual([
      "LUM-2026-01 Rebrand Lumen – Presentazione.pdf",
      "Carosello/01.png",
      "Carosello/02.png",
      "Carosello/03.png",
    ]);
    // Exactly the stored files: the PDF as stored, the Carosello's PNGs unpacked from its stored ZIP.
    expect(entries[0].bytes).toEqual(files.get(exports.rows[0].path));
    expect(entries.slice(1).map((e) => [...e.bytes])).toEqual(readStoredZip(files.get(exports.rows[1].path)!).map((e) => [...e.bytes]));
  });

  it("renders only the missing format: a stored PDF goes in as is, never drawn again", async () => {
    const exports = memoryExports();
    const { all, files } = deps({ exports });
    const handler = makeExportHandler(all);
    expect(await handler.run(await jobFor(all, "presentazione_16_9"), signal())).toEqual(ok(undefined));
    vi.mocked(all.browser.pdf).mockClear();
    const storedPdf = files.get(exports.rows[0].path);

    expect(await handler.run(await bundleJobFor(all), signal())).toEqual(ok(undefined));
    expect(all.browser.pdf).not.toHaveBeenCalled();
    expect(all.browser.pngs).toHaveBeenCalledOnce();
    expect(exports.rows.map((r) => r.format)).toEqual(["presentazione_16_9", "carosello_1_1", "bundle"]);
    expect(readStoredZip(files.get(exports.rows[2].path)!)[0].bytes).toEqual(storedPdf);
  });

  it("reuses a stored bundle: nothing drawn, nothing written", async () => {
    const exports = memoryExports();
    const { all } = deps({ exports });
    const handler = makeExportHandler(all);
    const job = await bundleJobFor(all);
    await handler.run(job, signal());
    vi.mocked(all.browser.pdf).mockClear();
    vi.mocked(all.browser.pngs).mockClear();
    exports.insert.mockClear();
    expect(await handler.run(job, signal())).toEqual(ok(undefined));
    expect(all.browser.pdf).not.toHaveBeenCalled();
    expect(all.browser.pngs).not.toHaveBeenCalled();
    expect(exports.insert).not.toHaveBeenCalled();
  });

  it("stores no ZIP when a format fails; the format already made stays stored", async () => {
    const exports = memoryExports();
    const { all } = deps({ exports });
    vi.mocked(all.browser.pngs).mockResolvedValueOnce([new Uint8Array([1])]);
    const outcome = await makeExportHandler(all).run(await bundleJobFor(all), signal());
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED", retryable: false } });
    expect(exports.rows.map((r) => r.format)).toEqual(["presentazione_16_9"]);
    expect(all.storage.upload).not.toHaveBeenCalledWith(expect.objectContaining({ format: "bundle" }), expect.anything());
  });

  it("fails as the format would: a retryable failure stays retryable", async () => {
    const { all } = deps({ exports: memoryExports() });
    vi.mocked(all.browser.pngs).mockRejectedValueOnce(new Error("chromium crashed"));
    expect(await makeExportHandler(all).run(await bundleJobFor(all), signal())).toMatchObject({
      ok: false,
      error: { code: "EXPORT_RENDER_FAILED", retryable: true },
    });
  });

  it("fails for good a stored file that doesn't match its pages, and a ZIP over the bucket's limit", async () => {
    const exports = memoryExports();
    const { all, files } = deps({ exports });
    const handler = makeExportHandler(all);
    await handler.run(await jobFor(all, "presentazione_16_9"), signal());
    files.set(exports.rows[0].path, fakePdf(2));
    expect(await handler.run(await bundleJobFor(all), signal())).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED", retryable: false } });
    expect(exports.rows.some((r) => r.format === "bundle")).toBe(false);

    const big = deps({ exports: memoryExports() });
    const zip = vi.fn((entries: readonly { name: string; bytes: Uint8Array }[]) =>
      entries.some((e) => e.name.includes("/")) ? new Uint8Array(EXPORT_MAX_BYTES + 1) : storeZip(entries),
    );
    const tooLarge = makeExportHandler({ ...big.all, zip });
    expect(await tooLarge.run(await bundleJobFor(big.all), signal())).toMatchObject({ ok: false, error: { code: "EXPORT_TOO_LARGE", retryable: false } });
    expect(big.all.storage.upload).not.toHaveBeenCalledWith(expect.objectContaining({ format: "bundle" }), expect.anything());
  });

  it("re-checks approval and the bundle's hash before drawing anything", async () => {
    const { all } = deps({ exports: memoryExports() });
    const job = await bundleJobFor(all);
    vi.mocked(all.getClientInfoForCase).mockResolvedValue(ok(clientInfo({ name: "Lumen Spa" })));
    expect(await makeExportHandler(all).run(job, signal())).toMatchObject({ ok: false, error: { code: "EXPORT_STALE", retryable: false } });
    vi.mocked(all.getLiveRevision).mockResolvedValue(ok<CaseStudyRevision | null>(null));
    expect(await makeExportHandler(all).run(job, signal())).toMatchObject({ ok: false, error: { code: "NOT_APPROVED", retryable: false } });
    expect(all.browser.pdf).not.toHaveBeenCalled();
    expect(all.browser.pngs).not.toHaveBeenCalled();
  });

  it.each([
    ["isn't a ZIP", () => new Uint8Array([1, 2, 3])],
    ["has fewer PNGs than pages", () => storeZip([{ name: "01.png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }])],
  ])("fails for good a stored Carosello that %s: no bundle", async (_, damaged) => {
    const exports = memoryExports();
    const { all, files } = deps({ exports });
    const handler = makeExportHandler(all);
    await handler.run(await jobFor(all, "carosello_1_1"), signal());
    files.set(exports.rows[0].path, damaged());
    expect(await handler.run(await bundleJobFor(all), signal())).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED", retryable: false } });
    expect(exports.rows.some((r) => r.format === "bundle")).toBe(false);
  });

  it("fails retryably when a stored file can't be read back: no bundle", async () => {
    const exports = memoryExports();
    const { all } = deps({ exports });
    vi.mocked(all.storage.read).mockResolvedValueOnce(err({ code: "STORAGE_FAILED", message: "Down." }));
    expect(await makeExportHandler(all).run(await bundleJobFor(all), signal())).toMatchObject({
      ok: false,
      error: { code: "STORAGE_FAILED", retryable: true },
    });
    expect(exports.rows.some((r) => r.format === "bundle")).toBe(false);
  });

  it.each([
    { formats: ["carosello_1_1"] },
    { formats: ["presentazione_16_9", "carosello_1_1"] },
    { formats: ["carosello_1_1", "carosello_1_1"] },
    { formats: ["carosello_1_1", "video_9_16"] },
  ])("refuses a bundle payload with %j for good", async ({ formats }) => {
    const { all } = deps();
    const job = await bundleJobFor(all);
    expect(await makeExportHandler(all).run({ ...job, payload: { ...(job.payload as object), formats } }, signal())).toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD" },
    });
  });
});

describe("acceptance (Story 5.4)", () => {
  it("both formats exported once, then again with nothing changed: no job is enqueued and the same file downloads", async () => {
    const { makeRequestExport } = await import("@/modules/rendering/application/request-export");
    const exports = memoryExports();
    const { all } = deps({ exports });
    const jobs: Job[] = [];
    const request = makeRequestExport({
      ...all,
      exports,
      storage: { presignDownload: vi.fn(async (path: string) => ok(`https://storage.test/signed/${path}`)) },
      enqueue: vi.fn(async (input) => {
        const job = { ...(await jobFor(all, "presentazione_16_9")), id: `99999999-0000-4000-8000-00000000000${jobs.length + 1}`, inputHash: input.inputHash, payload: input.payload };
        jobs.push(job);
        return ok({ id: job.id });
      }),
      getJobsFor: vi.fn(async () => ok([])),
      recordEvent: vi.fn(async () => ok(null)),
    });
    const handler = makeExportHandler({ ...all, exports });
    const ask = { caseId: CASE_ID, formats: ["presentazione_16_9", "carosello_1_1"] };

    expect(await request(ACTOR, ask)).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(jobs).toHaveLength(1);
    expect(await handler.run(jobs[0], signal())).toEqual(ok(undefined));

    const first = await request(ACTOR, ask);
    const again = await request(ACTOR, { caseId: CASE_ID, formats: ["carosello_1_1", "presentazione_16_9"] });
    expect(jobs).toHaveLength(1);
    const bundle = exports.rows.find((r) => r.format === "bundle");
    expect(first).toEqual({
      ok: true,
      value: { status: "ready", exportId: bundle?.id, url: `https://storage.test/signed/${bundle?.path}`, fileName: "LUM-2026-01 Rebrand Lumen.zip" },
    });
    expect(again).toEqual(first);

    // After an edit, both formats and the ZIP are made again.
    vi.mocked(all.getClientInfoForCase).mockResolvedValue(ok(clientInfo({ name: "Lumen Rinnovata Spa" })));
    expect(await request(ACTOR, ask)).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(await handler.run(jobs[1], signal())).toEqual(ok(undefined));
    expect(exports.rows.map((r) => r.format)).toEqual(["presentazione_16_9", "carosello_1_1", "bundle", "presentazione_16_9", "carosello_1_1", "bundle"]);
  });
});

describe("export handler, client packs (Story 5.9a)", () => {
  /** A request and the handler sharing one in-memory export table; the jobs it enqueued. */
  async function packRig(options: Parameters<typeof packDeps>[0] = {}) {
    const { makeRequestPack } = await import("@/modules/rendering/application/request-export");
    const exports = memoryExports();
    const { all, seen } = deps({ ...packDeps(options), exports });
    const jobs: Job[] = [];
    const recordEvent = vi.fn(async () => ok(null));
    const request = makeRequestPack({
      ...all,
      exports,
      storage: { presignDownload: vi.fn(async (path: string) => ok(`https://storage.test/signed/${path}`)) },
      enqueue: vi.fn(async (input) => {
        const job: Job = {
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
          createdAt: "2026-11-10T10:00:00Z",
          updatedAt: "2026-11-10T10:00:00Z",
          finishedAt: null,
        };
        jobs.push(job);
        return ok({ id: job.id });
      }),
      getJobsFor: vi.fn(async () => ok([])),
      recordEvent,
    });
    return { all, seen, exports, jobs, request, recordEvent, handler: makeExportHandler({ ...all, exports }) };
  }

  it("prints the whole pack in one PDF: intro, the cases in the client's order, the closing once, numbered on", async () => {
    const rig = await packRig({ order: ["C", "A", "B"] });
    expect(await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] })).toMatchObject({ ok: true, value: { status: "pending" } });
    expect(await rig.handler.run(rig.jobs[0], signal())).toEqual(ok(undefined));
    const html = rig.seen[0].html;
    const numbers = [...html.matchAll(/data-page-number="(\d+)"/g)].map((m) => Number(m[1]));
    expect(numbers.length).toBe(sections(html));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    const [row] = rig.exports.rows;
    expect(row.format).toBe("presentazione_16_9");
    expect(row.parts.map((p) => p.subject.kind)).toEqual(["client_intro", "case", "case", "case"]);
    expect(row.parts.slice(1).map((p) => p.subject.id)).toEqual([PACK_CASES.C, PACK_CASES.A, PACK_CASES.B]);
    // Media of every case in the pack and of the client.
    for (const id of Object.values(PACK_CASES)) expect(rig.all.listCaseMedia).toHaveBeenCalledWith(id);
    expect(rig.handler.caseIdOf?.(rig.jobs[0])).toBeNull();

    // The same inputs: the stored pack, no new job, named after the client, an event per case.
    const again = await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    expect(again).toMatchObject({ ok: true, value: { status: "ready", exportId: row.id, fileName: "LUM Lumen Srl – Presentazione.pdf" } });
    expect(rig.jobs).toHaveLength(1);
    expect(rig.recordEvent).toHaveBeenCalledTimes(3);
  });

  it("zips two formats of the pack into one file named after the client", async () => {
    const rig = await packRig();
    await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9", "carosello_1_1"] });
    expect(await rig.handler.run(rig.jobs[0], signal())).toEqual(ok(undefined));
    expect(rig.exports.rows.map((r) => r.format)).toEqual(["presentazione_16_9", "carosello_1_1", "bundle"]);
    const again = await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["carosello_1_1", "presentazione_16_9"] });
    expect(again).toMatchObject({ ok: true, value: { status: "ready", fileName: "LUM Lumen Srl.zip" } });
  });

  it("refuses with EXPORT_STALE when a case was updated between the request and the job", async () => {
    const rig = await packRig();
    await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    // The client reordered its cases since: the pack is not the one asked for.
    const reordered = packDeps({ order: ["A", "B", "C"] });
    vi.mocked(rig.all.listClientCasesInOrder).mockImplementation(reordered.listClientCasesInOrder);
    expect(await rig.handler.run(rig.jobs[0], signal())).toMatchObject({ ok: false, error: { code: "EXPORT_STALE", retryable: false } });
    expect(rig.exports.rows).toEqual([]);
  });

  it("draws each case with its own details", async () => {
    const rig = await packRig({ order: ["C", "A", "B"] });
    await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    expect(await rig.handler.run(rig.jobs[0], signal())).toEqual(ok(undefined));
    const html = rig.seen[0].html;
    const at = (key: "A" | "B" | "C") => html.indexOf(`Citazione del caso ${key}.`);
    for (const key of ["A", "B", "C"] as const) expect(at(key)).toBeGreaterThan(-1);
    // In the client's order.
    expect(at("C")).toBeLessThan(at("A"));
    expect(at("A")).toBeLessThan(at("B"));
  });

  it("drops each case's own Carosello Chiusura from the drawn slides; the client's closing comes once", async () => {
    const rig = await packRig({ order: ["A", "B"] });
    await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["carosello_1_1"] });
    expect(await rig.handler.run(rig.jobs[0], signal())).toEqual(ok(undefined));
    const html = rig.seen[0].html;
    const own = packCaseRevision("A").doc.formats.carosello_1_1.pages;
    const keep = own.filter((p) => p.role !== "intro" && p.pageKey !== "closing").length;
    expect(sections(html)).toBe(1 + 2 * keep + 1);
    expect(html.match(/data-page-key="closing"/g)).toHaveLength(1);
  });

  it("fails for good when the client is gone (CLIENT_NOT_FOUND, not retried)", async () => {
    const rig = await packRig();
    await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    vi.mocked(rig.all.getClient).mockResolvedValue(err({ code: "CLIENT_NOT_FOUND", message: "gone" }));
    expect(await rig.handler.run(rig.jobs[0], signal())).toMatchObject({ ok: false, error: { code: "CLIENT_NOT_FOUND", retryable: false } });
    expect(rig.exports.rows).toEqual([]);
  });

  it("draws an intro that isn't approved as no intro: each case whole", async () => {
    const rig = await packRig({ order: ["A", "B"], intro: "unapproved" });
    await rig.request(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    expect(await rig.handler.run(rig.jobs[0], signal())).toEqual(ok(undefined));
    expect(rig.exports.rows[0].parts.map((p) => p.subject.kind)).toEqual(["case", "case"]);
    expect(sections(rig.seen[0].html)).toBe(6);
  });
});
