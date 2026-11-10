import { referencedAssetIds } from "@/modules/case-study";
import { JOB_ABORTED, type Job, type JobFailure, type JobHandler, type JobOutcome } from "@/modules/jobs";
import { exportHtml } from "@/modules/rendering/application/export-html";
import {
  bundleHashOfDrawings,
  composePartOf,
  drawingOfCase,
  readExportSources,
  readPackSources,
  sameParts,
  type DrawPart,
  type ExportDrawing,
  type PackSourceDeps,
} from "@/modules/rendering/application/export-source";
import {
  bundleEntryName,
  EXPORT_BUNDLE,
  EXPORT_FILES,
  EXPORT_FORMAT_IDS,
  EXPORT_MAX_BYTES,
  EXPORT_STALE,
  EXPORT_TOO_LARGE,
  exportPayloadSchema,
  type ExportFormatId,
  type ExportPart,
  type ExportPayload,
  type ExportRecord,
} from "@/modules/rendering/domain/export";
import type { BusinessLine } from "@/modules/case-study";
import { getFormat } from "@/modules/rendering/domain/formats";
import type { ExportBrowser } from "@/modules/rendering/ports/export-browser";
import type { ExportRepository } from "@/modules/rendering/ports/export-repository";
import type { ExportStorage } from "@/modules/rendering/ports/export-storage";
import type { BoundValues, RenderAsset } from "@/modules/rendering/templates/types";
import { it } from "@/shared/i18n/it";
import { log, type LogContext } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";

/** A case or client image or video, as its listing gives it. */
export interface MediaFile {
  id: string;
  kind: string;
}

/** A signed GET of a rendition (`material.getRendition` / `getClientRendition`). */
type GetRendition = (assetId: string, specName: string) => Promise<Result<{ url: string; contentType: string }>>;

/** What the export handler needs, injected so unit tests use a fake browser and no database (wired in `worker.ts`). */
export interface ExportHandlerDeps extends PackSourceDeps {
  exports: Pick<ExportRepository, "findByHash" | "insert">;
  storage: Pick<ExportStorage, "upload" | "read">;
  /** `material.listAssets`: the case's live files. */
  listCaseMedia(caseId: string): Promise<Result<readonly MediaFile[]>>;
  /** `case-study.listClientMaterial`: the client's live files. */
  listClientMedia(clientId: string): Promise<Result<readonly MediaFile[]>>;
  getRendition: GetRendition;
  /** The client files' renditions (deferred work: exports resolve client files through `client_rendition`). */
  getClientRendition: GetRendition;
  /** The client's current logo file, or `null` when it has none or its object is missing. */
  readClientLogo(clientId: string): Promise<Result<{ bytes: Uint8Array; contentType: string } | null>>;
  /** Downloads a signed URL's bytes; throws on failure. */
  fetchBytes(url: string, signal: AbortSignal): Promise<Uint8Array>;
  /** An SVG logo as PNG bytes, network off. */
  rasteriseSvg(bytes: Uint8Array): Promise<Result<Uint8Array>>;
  /** The inline `@font-face` rules (Inter). */
  fontCss(): Promise<string>;
  browser: ExportBrowser;
  zip(entries: readonly { name: string; bytes: Uint8Array }[]): Uint8Array;
  /** Reads back a ZIP that `zip` wrote (a bundle unpacks the stored Carosello). Throws on a damaged one. */
  unzip(bytes: Uint8Array): { name: string; bytes: Uint8Array }[];
}

type Failure = { code: Uppercase<string>; message: string; retryable?: boolean };

const fail = (code: Uppercase<string>, message: string, retryable = true): Result<never, JobFailure> => err({ code, message, retryable });
const aborted = (): Result<never, JobFailure> => err({ code: JOB_ABORTED, message: "The export was stopped." });

/** Codes that asking again cannot fix: the job fails at once. */
const PERMANENT = new Set(["NOT_APPROVED", "FORMAT_NOT_IN_REVISION", "NOT_FOUND", "CLIENT_NOT_FOUND", EXPORT_STALE, EXPORT_TOO_LARGE]);

/** A failure as the job loop takes it: retried unless it says otherwise or its code is permanent. */
const asFailure = (error: { code: string; message: string; retryable?: boolean }): Result<never, JobFailure> =>
  fail(error.code as Uppercase<string>, error.message, error.retryable ?? !PERMANENT.has(error.code));

/** The rendition a still export draws: an image's display copy, a video's poster frame. */
const STILL_SPEC: Readonly<Record<string, string>> = { image: "image.display", video: "video.poster" };

/**
 * A referenced file whose rendition is not made yet (or whose file just went): the export
 * waits and retries, so a stored file (reused for its hash forever) never misses an image.
 */
const NOT_READY = new Set(["RENDITION_NOT_READY", "NOT_FOUND"]);

/** Logo failures that asking again cannot fix: the pages are drawn without the logo. */
const LOGO_SKIPPED = new Set(["LOGO_UNSAFE", "LOGO_RASTERISE_FAILED"]);

/** How many pages a PDF has: its `/Type /Page` objects (Chromium writes no object streams). */
export function pdfPageCount(bytes: Uint8Array): number {
  return Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
}

const dataUrl = (contentType: string, bytes: Uint8Array) => `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;

/**
 * The payload's case id, for `job_failed` (a failed export never changes the case's
 * status); null for a client pack (Story 5.9a), which is no one case's.
 */
function caseIdOf(job: Job): string | null {
  const raw = job.payload as unknown;
  if (typeof raw === "object" && raw !== null && Object.hasOwn(raw, "subject")) return null;
  const parsed = exportPayloadSchema.safeParse(raw);
  if (!parsed.success) return job.subjectId;
  return "subject" in parsed.data ? null : parsed.data.parts[0].subject.id;
}

/** A part's pages in `format` as its revision holds them (before a pack trims them). */
function pagesIn(part: DrawPart, format: ExportFormatId) {
  const formats = part.revision.doc.formats;
  return Object.hasOwn(formats, format) ? (formats[format]?.pages ?? []) : [];
}

/**
 * The `export` job handler (Story 5.3): one format of one case's approved revision as a
 * file. A bundle (Story 5.4) makes each of its formats the same way, only those with no
 * stored export yet, then zips exactly those stored files into one more `export` row
 * (`bundle.zip`: a PDF at the root under its 5.3 name, a Carosello's PNGs in
 * `Carosello/`). If any format fails, no ZIP is stored; a format already made stays.
 * A client pack (Story 5.9a) is the same with all of the pack's parts, composed with the
 * pack rule (`composeParts`' `pack`) and named after the client.
 * It re-checks approval and the content hash (an edit since the request is
 * `EXPORT_STALE`: the person asks again), reuses a file already stored for the hash,
 * else draws the pages with the preview's renderer (case and client renditions and the
 * logo inline, Inter inline), prints them in Chromium (`page.setContent`; a PDF of
 * 1920×1080 pages, or one 1080×1080 PNG per slide in a ZIP), stores the file and writes
 * the immutable `export` row. It never touches the case's status.
 */
export function makeExportHandler(deps: ExportHandlerDeps): JobHandler {
  async function mediaAssets(drawing: ExportDrawing, signal: AbortSignal): Promise<Result<Record<string, RenderAsset>, Failure>> {
    const wanted = new Set<string>();
    for (const part of drawing.parts) for (const id of referencedAssetIds({ pages: pagesIn(part, drawing.format) })) wanted.add(id);
    if (wanted.size === 0) return ok({});
    const caseIds = drawing.parts.flatMap((part) => (part.caseId === null ? [] : [part.caseId]));
    const [clientFiles, ...caseLists] = await Promise.all([deps.listClientMedia(drawing.client.id), ...caseIds.map((id) => deps.listCaseMedia(id))]);
    const caseFiles: MediaFile[] = [];
    for (const listed of caseLists) {
      if (!listed.ok) return listed;
      caseFiles.push(...listed.value);
    }
    if (!clientFiles.ok) return clientFiles;
    const sources: [MediaFile, GetRendition][] = [
      ...caseFiles.map((file): [MediaFile, GetRendition] => [file, deps.getRendition]),
      ...clientFiles.value.map((file): [MediaFile, GetRendition] => [file, deps.getClientRendition]),
    ].filter(([file]) => wanted.has(file.id.toLowerCase()) && Object.hasOwn(STILL_SPEC, file.kind));

    const assets: Record<string, RenderAsset> = {};
    for (const [file, getRendition] of sources) {
      signal.throwIfAborted();
      if (Object.hasOwn(assets, file.id)) continue;
      const link = await getRendition(file.id, STILL_SPEC[file.kind]);
      if (!link.ok) {
        if (NOT_READY.has(link.error.code)) {
          return err({ code: "RENDITION_NOT_READY", message: "A display copy is not ready yet.", retryable: true });
        }
        return link;
      }
      const url = dataUrl(link.value.contentType, await deps.fetchBytes(link.value.url, signal));
      assets[file.id] = file.kind === "video" ? { url, kind: "video", posterUrl: url } : { url, kind: "image" };
    }
    return ok(assets);
  }

  async function logoUrl(drawing: ExportDrawing): Promise<Result<string | null>> {
    if (drawing.client.logoId === null) return ok(null);
    const logo = await deps.readClientLogo(drawing.client.id);
    if (!logo.ok) return logo;
    if (logo.value === null || logo.value.bytes.length === 0) return ok(null);
    if (logo.value.contentType === "image/svg+xml") {
      const png = await deps.rasteriseSvg(logo.value.bytes);
      if (png.ok) return ok(dataUrl("image/png", png.value));
      if (!LOGO_SKIPPED.has(png.error.code)) return png;
      log.warn(`export drawn without the logo: ${png.error.code}`, { caseId: drawing.parts[0].caseId ?? undefined, clientId: drawing.client.id });
      return ok(null);
    }
    return ok(dataUrl(logo.value.contentType, logo.value.bytes));
  }

  function valuesOf(part: DrawPart, logo: string | null): BoundValues {
    const { client, case: c } = part.content;
    return {
      client: { name: client.name, sector: client.sector, description: client.description, logoUrl: logo, results: client.results, testimonial: client.testimonial },
      case: { year: c.year, services: c.services.map((line) => it.businessLines[line as BusinessLine]), results: c.results, testimonial: c.testimonial },
    };
  }

  async function draw(drawing: ExportDrawing, signal: AbortSignal): Promise<Result<Uint8Array, Failure>> {
    const { format } = drawing;
    const [assets, logo] = await Promise.all([mediaAssets(drawing, signal), logoUrl(drawing)]);
    if (!assets.ok) return assets;
    if (!logo.ok) return logo;
    const fontCss = await deps.fontCss();
    const size = getFormat(format).pixelSize;
    let html: string;
    try {
      html = exportHtml({
        parts: drawing.parts.map((part) => composePartOf(part, valuesOf(part, logo.value), assets.value)),
        format,
        size,
        fontCss,
        ...(drawing.pack ? { compose: { pack: true } } : {}),
      });
    } catch {
      return err({ code: "EXPORT_RENDER_FAILED", message: "The pages could not be drawn.", retryable: false });
    }
    let file: Uint8Array;
    if (format === "presentazione_16_9") {
      file = await deps.browser.pdf(html, size, signal);
      const pages = pdfPageCount(file);
      if (pages !== drawing.pageCount) {
        return err({ code: "EXPORT_RENDER_FAILED", message: `Printed ${pages} pages for ${drawing.pageCount}.`, retryable: false });
      }
    } else {
      const pngs = await deps.browser.pngs(html, size, signal);
      if (pngs.length !== drawing.pageCount) {
        return err({ code: "EXPORT_RENDER_FAILED", message: `Drew ${pngs.length} of ${drawing.pageCount} slides.`, retryable: false });
      }
      const width = Math.max(2, String(pngs.length).length);
      file = deps.zip(pngs.map((bytes, i) => ({ name: `${String(i + 1).padStart(width, "0")}.png`, bytes })));
    }
    if (file.byteLength > EXPORT_MAX_BYTES) {
      return err({ code: EXPORT_TOO_LARGE, message: "The file is larger than storage accepts.", retryable: false });
    }
    return ok(file);
  }

  /**
   * The stored export of one format (Story 5.3's render and store): the row with its hash
   * when there is one (never drawn again), else drawn, stored and recorded now.
   */
  async function ensureFormat(
    drawing: ExportDrawing,
    parts: ExportPart[],
    requestedBy: string,
    signal: AbortSignal,
    ids: LogContext,
  ): Promise<Result<ExportRecord, JobFailure>> {
    const existing = await deps.exports.findByHash(drawing.contentHash);
    if (signal.aborted) return aborted();
    if (!existing.ok) return asFailure(existing.error);
    if (existing.value !== null) return ok(existing.value);

    let bytes: Result<Uint8Array, Failure>;
    try {
      bytes = await draw(drawing, signal);
    } catch (error) {
      if (signal.aborted) return aborted();
      log.error(`export render threw (${drawing.format}): ${(error as Error | null)?.name ?? "unknown"}`, ids);
      return fail("EXPORT_RENDER_FAILED", "The file could not be made.");
    }
    if (signal.aborted) return aborted();
    if (!bytes.ok) return asFailure(bytes.error);
    return store(drawing.contentHash, drawing.format, parts, requestedBy, bytes.value, signal, ids);
  }

  async function store(
    hash: string,
    format: ExportFormatId | typeof EXPORT_BUNDLE,
    parts: ExportPart[],
    requestedBy: string,
    bytes: Uint8Array,
    signal: AbortSignal,
    ids: LogContext,
  ): Promise<Result<ExportRecord, JobFailure>> {
    const stored = await deps.storage.upload({ contentHash: hash, format }, bytes);
    if (signal.aborted) return aborted();
    if (!stored.ok) return asFailure(stored.error);
    const written = await deps.exports.insert({
      contentHash: hash,
      format,
      parts,
      path: stored.value.path,
      contentType: EXPORT_FILES[format].contentType,
      sizeBytes: bytes.byteLength,
      createdBy: requestedBy,
    });
    if (!written.ok) return asFailure(written.error);
    log.info(`export stored: ${format}`, ids);
    return ok(written.value);
  }

  /** The entries a format's stored file adds to a bundle, checked against its pages as 5.3 checks a fresh file. */
  async function bundleEntries(drawing: ExportDrawing, record: ExportRecord): Promise<Result<{ name: string; bytes: Uint8Array }[], JobFailure>> {
    const read = await deps.storage.read(record.path);
    if (!read.ok) return asFailure(read.error);
    const name = bundleEntryName(drawing.code, drawing.name, drawing.format);
    const damaged = (detail: string) => fail("EXPORT_RENDER_FAILED", `The stored ${drawing.format} file ${detail}.`, false);
    if (EXPORT_FILES[drawing.format].extension === "pdf") {
      const pages = pdfPageCount(read.value);
      if (pages !== drawing.pageCount) return damaged(`has ${pages} pages for ${drawing.pageCount}`);
      return ok([{ name, bytes: read.value }]);
    }
    let inner: { name: string; bytes: Uint8Array }[];
    try {
      inner = deps.unzip(read.value);
    } catch {
      return damaged("can't be read");
    }
    if (inner.length !== drawing.pageCount) return damaged(`has ${inner.length} slides for ${drawing.pageCount}`);
    return ok(inner.map((entry) => ({ name: `${name}${entry.name}`, bytes: entry.bytes })));
  }

  /**
   * What the job draws, read again now (approved only, NFR1), or `EXPORT_STALE` when it
   * changed since the request: another approved revision, another pack (order, intro,
   * cases), or another content hash (a client or case field edit).
   */
  async function drawingsOf(job: Job, payload: ExportPayload, formats: ExportFormatId[], signal: AbortSignal): Promise<Result<ExportDrawing[], JobFailure>> {
    const bundled = payload.format === EXPORT_BUNDLE;
    const stale = () => fail(EXPORT_STALE, "The content changed since the export was asked for.", false);
    if ("subject" in payload) {
      const read = await readPackSources(deps, payload.subject.id, formats);
      if (signal.aborted) return aborted();
      if (!read.ok) return asFailure(read.error);
      const { drawings } = read.value;
      const hash = bundled ? bundleHashOfDrawings(drawings) : drawings[0].contentHash;
      if (!sameParts(read.value.parts, payload.parts) || hash !== job.inputHash) return stale();
      return ok(drawings);
    }
    const [part] = payload.parts;
    const read = await readExportSources(deps, part.subject.id, formats);
    if (signal.aborted) return aborted();
    if (!read.ok) return asFailure(read.error);
    const drawings = read.value.map(drawingOfCase);
    const hash = bundled ? bundleHashOfDrawings(drawings) : drawings[0].contentHash;
    if (read.value[0].revision.id.toLowerCase() !== part.revisionId.toLowerCase() || hash !== job.inputHash) {
      return fail(EXPORT_STALE, "The case changed since the export was asked for.", false);
    }
    return ok(drawings);
  }

  async function run(job: Job, signal: AbortSignal): Promise<JobOutcome> {
    const parsed = exportPayloadSchema.safeParse(job.payload);
    if (!parsed.success) return fail("INVALID_PAYLOAD", "The export job's payload is not valid.", false);
    const payload: ExportPayload = parsed.data;
    const ids: LogContext = "subject" in payload ? { jobId: job.id, clientId: payload.subject.id } : { jobId: job.id, caseId: payload.parts[0].subject.id };
    // A bundle's formats in the picker's order: the order of the files in its ZIP.
    const formats: ExportFormatId[] =
      payload.format === EXPORT_BUNDLE ? EXPORT_FORMAT_IDS.filter((f) => payload.formats.includes(f)) : [payload.format];

    // Approved only, checked again before anything is drawn (NFR1).
    const read = await drawingsOf(job, payload, formats, signal);
    if (!read.ok) return read;
    const drawings = read.value;

    if (payload.format !== EXPORT_BUNDLE) {
      const made = await ensureFormat(drawings[0], payload.parts, payload.requestedBy, signal, ids);
      return made.ok ? ok(undefined) : made;
    }

    const hash = job.inputHash;
    const existing = await deps.exports.findByHash(hash);
    if (signal.aborted) return aborted();
    if (!existing.ok) return asFailure(existing.error);
    if (existing.value !== null) return ok(undefined);

    // Each format first (only the missing ones are drawn); any failure stores no ZIP.
    const records: ExportRecord[] = [];
    for (const drawing of drawings) {
      const made = await ensureFormat(drawing, payload.parts, payload.requestedBy, signal, ids);
      if (!made.ok) return made;
      records.push(made.value);
    }

    const entries: { name: string; bytes: Uint8Array }[] = [];
    for (const [i, drawing] of drawings.entries()) {
      const added = await bundleEntries(drawing, records[i]);
      if (signal.aborted) return aborted();
      if (!added.ok) return added;
      entries.push(...added.value);
    }
    const zip = deps.zip(entries);
    if (zip.byteLength > EXPORT_MAX_BYTES) {
      return fail(EXPORT_TOO_LARGE, "The file is larger than storage accepts.", false);
    }
    const stored = await store(hash, EXPORT_BUNDLE, payload.parts, payload.requestedBy, zip, signal, ids);
    return stored.ok ? ok(undefined) : stored;
  }

  return { run, caseIdOf };
}
