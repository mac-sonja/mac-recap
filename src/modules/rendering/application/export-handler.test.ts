import { describe, expect, it, vi } from "vitest";
import type { CaseStudyRevision } from "@/modules/case-study";
import type { Job } from "@/modules/jobs";
import { storeZip } from "@/modules/rendering/adapters/zip/store-zip";
import { makeExportHandler, type ExportHandlerDeps } from "@/modules/rendering/application/export-handler";
import { readExportSource } from "@/modules/rendering/application/export-source";
import {
  ACTOR,
  CASE_ID,
  CASE_IMAGE,
  CLIENT_IMAGE,
  clientInfo,
  REVISION_ID,
  sourceDeps,
} from "@/modules/rendering/application/export.fixtures";
import type { ExportFormatId, ExportRecord, NewExport } from "@/modules/rendering/domain/export";
import type { ExportBrowser } from "@/modules/rendering/ports/export-browser";
import { err, ok } from "@/shared/result";

const OTHER_VIDEO = "aaaaaaaa-0000-4000-8000-000000000009";
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
const PNG_LOGO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const FONT_CSS = "@font-face{font-family:Inter;src:url(data:font/woff2;base64,SU5URVI=) format(\"woff2\")}";

const sections = (html: string) => html.match(/<section class="mr-page"/g)?.length ?? 0;

/** A browser that never starts Chromium: it keeps the HTML and answers one PNG per slide. */
function fakeBrowser() {
  const seen: { html: string; size: { width: number; height: number } }[] = [];
  const browser = {
    pdf: vi.fn(async (html: string, size: { width: number; height: number }) => {
      seen.push({ html, size });
      return new TextEncoder().encode(`%PDF-fake ${sections(html)} pages`);
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
      upload: vi.fn(async ({ contentHash, format }: { contentHash: string; format: ExportFormatId }) =>
        ok({ path: `exports/${contentHash}/${format}.${format === "presentazione_16_9" ? "pdf" : "zip"}` }),
      ),
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
    ...over,
  };
  return { all, seen, inserted };
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
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-fake 3 pages");
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
    expect(outcome).toMatchObject({ ok: false, error: { code: "EXPORT_RENDER_FAILED" } });
    expect(all.storage.upload).not.toHaveBeenCalled();
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

  it("leaves out a rendition that isn't ready, as the preview does", async () => {
    const { all, seen } = deps({ getClientRendition: vi.fn(async () => err({ code: "RENDITION_NOT_READY", message: "Not yet." })) });
    expect(await makeExportHandler(all).run(await jobFor(all, "presentazione_16_9"), signal())).toEqual(ok(undefined));
    expect(seen[0].html).not.toContain(b64(`bytes of https://storage.test/client/${CLIENT_IMAGE}.webp`));
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
    expect(seen).toHaveLength(2);
    expect(seen[0].html).toContain("Lumen Srl");
    expect(seen[1].html).toContain("Lumen Rinnovata Spa");
    expect(seen[1].html).not.toContain("Lumen Srl");
  });
});
