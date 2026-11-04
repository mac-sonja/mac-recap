import { referencedAssetIds } from "@/modules/case-study";
import { JOB_ABORTED, type Job, type JobHandler, type JobOutcome } from "@/modules/jobs";
import { exportHtml } from "@/modules/rendering/application/export-html";
import { readExportSource, type ExportSource, type ExportSourceDeps } from "@/modules/rendering/application/export-source";
import { EXPORT_FILES, EXPORT_STALE, exportPayloadSchema, type ExportFormatId, type ExportPayload } from "@/modules/rendering/domain/export";
import { getFormat } from "@/modules/rendering/domain/formats";
import type { ExportBrowser } from "@/modules/rendering/ports/export-browser";
import type { ExportRepository } from "@/modules/rendering/ports/export-repository";
import type { ExportStorage } from "@/modules/rendering/ports/export-storage";
import type { BoundValues, RenderAsset } from "@/modules/rendering/templates/types";
import { it } from "@/shared/i18n/it";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";

/** A case or client image or video, as its listing gives it. */
export interface MediaFile {
  id: string;
  kind: string;
}

/** A signed GET of a rendition (`material.getRendition` / `getClientRendition`). */
type GetRendition = (assetId: string, specName: string) => Promise<Result<{ url: string; contentType: string }>>;

/** What the export handler needs, injected so unit tests use a fake browser and no database (wired in `worker.ts`). */
export interface ExportHandlerDeps extends ExportSourceDeps {
  exports: Pick<ExportRepository, "findByHash" | "insert">;
  storage: Pick<ExportStorage, "upload">;
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
}

type Failure = { code: Uppercase<string>; message: string; retryable?: boolean };

const fail = (code: Uppercase<string>, message: string, retryable = true): JobOutcome => err({ code, message, retryable });
const aborted = (): JobOutcome => err({ code: JOB_ABORTED, message: "The export was stopped." });

/** Codes that asking again cannot fix: the job fails at once. */
const PERMANENT = new Set(["NOT_APPROVED", "FORMAT_NOT_IN_REVISION", "NOT_FOUND", EXPORT_STALE]);

const asFailure = (error: { code: string; message: string }): JobOutcome =>
  fail(error.code as Uppercase<string>, error.message, !PERMANENT.has(error.code));

/** The rendition a still export draws: an image's display copy, a video's poster frame. */
const STILL_SPEC: Readonly<Record<string, string>> = { image: "image.display", video: "video.poster" };

/** Renditions that may be missing without failing the export, as in the preview: not made yet, or the file just went. */
const SKIPPABLE = new Set(["RENDITION_NOT_READY", "NOT_FOUND"]);

const dataUrl = (contentType: string, bytes: Uint8Array) => `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;

/** The payload's case id, for `job_failed` (a failed export never changes the case's status). */
function caseIdOf(job: Job): string | null {
  const parsed = exportPayloadSchema.safeParse(job.payload);
  return parsed.success ? parsed.data.parts[0].subject.id : job.subjectId;
}

/**
 * The `export` job handler (Story 5.3): one format of one case's approved revision as a
 * file. It re-checks approval and the content hash (an edit since the request is
 * `EXPORT_STALE`: the person asks again), reuses a file already stored for the hash,
 * else draws the pages with the preview's renderer (case and client renditions and the
 * logo inline, Inter inline), prints them in Chromium (`page.setContent`; a PDF of
 * 1920×1080 pages, or one 1080×1080 PNG per slide in a ZIP), stores the file and writes
 * the immutable `export` row. It never touches the case's status.
 */
export function makeExportHandler(deps: ExportHandlerDeps): JobHandler {
  async function mediaAssets(source: ExportSource, signal: AbortSignal): Promise<Result<Record<string, RenderAsset>>> {
    const wanted = referencedAssetIds({ pages: source.pages });
    if (wanted.size === 0) return ok({});
    const [caseFiles, clientFiles] = await Promise.all([deps.listCaseMedia(source.caseStudy.id), deps.listClientMedia(source.info.clientId)]);
    if (!caseFiles.ok) return caseFiles;
    if (!clientFiles.ok) return clientFiles;
    const sources: [MediaFile, GetRendition][] = [
      ...caseFiles.value.map((file): [MediaFile, GetRendition] => [file, deps.getRendition]),
      ...clientFiles.value.map((file): [MediaFile, GetRendition] => [file, deps.getClientRendition]),
    ].filter(([file]) => wanted.has(file.id.toLowerCase()) && Object.hasOwn(STILL_SPEC, file.kind));

    const assets: Record<string, RenderAsset> = {};
    for (const [file, getRendition] of sources) {
      signal.throwIfAborted();
      const link = await getRendition(file.id, STILL_SPEC[file.kind]);
      if (!link.ok) {
        if (SKIPPABLE.has(link.error.code)) continue;
        return link;
      }
      const url = dataUrl(link.value.contentType, await deps.fetchBytes(link.value.url, signal));
      assets[file.id] = file.kind === "video" ? { url, kind: "video", posterUrl: url } : { url, kind: "image" };
    }
    return ok(assets);
  }

  async function logoUrl(source: ExportSource): Promise<Result<string | null>> {
    if (source.info.logoId === null) return ok(null);
    const logo = await deps.readClientLogo(source.info.clientId);
    if (!logo.ok) return logo;
    if (logo.value === null || logo.value.bytes.length === 0) return ok(null);
    if (logo.value.contentType === "image/svg+xml") {
      const png = await deps.rasteriseSvg(logo.value.bytes);
      return png.ok ? ok(dataUrl("image/png", png.value)) : png;
    }
    return ok(dataUrl(logo.value.contentType, logo.value.bytes));
  }

  function valuesOf(source: ExportSource, logo: string | null): BoundValues {
    const { client, case: c } = source.content;
    return {
      client: { name: client.name, sector: client.sector, description: client.description, logoUrl: logo, results: client.results, testimonial: client.testimonial },
      case: { year: c.year, services: source.caseStudy.businessLines.map((line) => it.businessLines[line]), results: c.results, testimonial: c.testimonial },
    };
  }

  async function draw(source: ExportSource, format: ExportFormatId, signal: AbortSignal): Promise<Result<Uint8Array, Failure>> {
    const [assets, logo] = await Promise.all([mediaAssets(source, signal), logoUrl(source)]);
    if (!assets.ok) return assets;
    if (!logo.ok) return logo;
    const fontCss = await deps.fontCss();
    const size = getFormat(format).pixelSize;
    let html: string;
    try {
      html = exportHtml({
        parts: [
          {
            kind: "case_history",
            caseId: source.caseStudy.id,
            clientId: source.info.clientId,
            doc: source.revision.doc,
            assets: assets.value,
            values: valuesOf(source, logo.value),
          },
        ],
        format,
        size,
        fontCss,
      });
    } catch {
      return err({ code: "EXPORT_RENDER_FAILED", message: "The pages could not be drawn.", retryable: false });
    }
    if (format === "presentazione_16_9") return ok(await deps.browser.pdf(html, size, signal));
    const pngs = await deps.browser.pngs(html, size, signal);
    if (pngs.length !== source.pages.length) {
      return err({ code: "EXPORT_RENDER_FAILED", message: `Drew ${pngs.length} of ${source.pages.length} slides.` });
    }
    const width = Math.max(2, String(pngs.length).length);
    return ok(deps.zip(pngs.map((bytes, i) => ({ name: `${String(i + 1).padStart(width, "0")}.png`, bytes }))));
  }

  async function run(job: Job, signal: AbortSignal): Promise<JobOutcome> {
    const parsed = exportPayloadSchema.safeParse(job.payload);
    if (!parsed.success) return fail("INVALID_PAYLOAD", "The export job's payload is not valid.", false);
    const payload: ExportPayload = parsed.data;
    const [part] = payload.parts;
    const ids = { jobId: job.id, caseId: part.subject.id };

    // Approved only, checked again before anything is drawn (NFR1).
    const source = await readExportSource(deps, part.subject.id, payload.format);
    if (signal.aborted) return aborted();
    if (!source.ok) return asFailure(source.error);
    if (source.value.revision.id.toLowerCase() !== part.revisionId.toLowerCase() || source.value.contentHash !== job.inputHash) {
      return fail(EXPORT_STALE, "The case changed since the export was asked for.", false);
    }

    const existing = await deps.exports.findByHash(source.value.contentHash);
    if (signal.aborted) return aborted();
    if (!existing.ok) return asFailure(existing.error);
    if (existing.value !== null) return ok(undefined);

    let bytes: Result<Uint8Array, Failure>;
    try {
      bytes = await draw(source.value, payload.format, signal);
    } catch (error) {
      if (signal.aborted) return aborted();
      log.error(`export render threw: ${(error as Error | null)?.name ?? "unknown"}`, ids);
      return fail("EXPORT_RENDER_FAILED", "The file could not be made.");
    }
    if (signal.aborted) return aborted();
    if (!bytes.ok) return asFailure(bytes.error);

    const stored = await deps.storage.upload({ contentHash: source.value.contentHash, format: payload.format }, bytes.value);
    if (signal.aborted) return aborted();
    if (!stored.ok) return asFailure(stored.error);
    const written = await deps.exports.insert({
      contentHash: source.value.contentHash,
      format: payload.format,
      parts: payload.parts,
      path: stored.value.path,
      contentType: EXPORT_FILES[payload.format].contentType,
      sizeBytes: bytes.value.byteLength,
      createdBy: payload.requestedBy,
    });
    if (!written.ok) return asFailure(written.error);
    log.info("export stored", ids);
    return ok(undefined);
  }

  return { run, caseIdOf };
}
