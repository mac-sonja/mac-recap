import { z } from "zod";
import type { Actor } from "@/modules/access";
import { CASE_EXPORTED } from "@/modules/case-study";
import { notApproved, readExportSource, type ExportSourceDeps } from "@/modules/rendering/application/export-source";
import {
  EXPORT_STALE,
  exportFileName,
  exportStatusInputSchema,
  isExportFormatId,
  notExportable,
  requestExportInputSchema,
  type ExportPayload,
  type ExportRecord,
} from "@/modules/rendering/domain/export";
import { isFormatId } from "@/modules/rendering/domain/formats";
import type { ExportRepository } from "@/modules/rendering/ports/export-repository";
import type { ExportStorage } from "@/modules/rendering/ports/export-storage";
import { err, ok, type Result } from "@/shared/result";

/** How long a download link stays valid (AD-8: at most 15 minutes). */
export const EXPORT_URL_TTL_SECONDS = 10 * 60;

/**
 * Where a request stands: the file is `ready` (a signed GET that downloads as
 * `fileName`), the job is still `pending`, or it `failed` (attempts used up, or the
 * content changed while it waited: asking again starts a new one).
 */
export type ExportTicket =
  | { status: "ready"; exportId: string; url: string; fileName: string }
  | { status: "pending"; jobId: string }
  | { status: "failed" };

/** A job as the status read sees it (`jobs.getJobsFor`, no payload). */
interface JobView {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  inputHash: string;
}

export interface RequestExportDeps extends ExportSourceDeps {
  exports: Pick<ExportRepository, "findByHash" | "findById">;
  storage: Pick<ExportStorage, "presignDownload">;
  /** `jobs.enqueue`: idempotent on (kind, subject, input hash) while the job is live. */
  enqueue(input: { kind: "export"; subjectId: string; inputHash: string; payload: ExportPayload }): Promise<Result<{ id: string }>>;
  /** `jobs.getJobsFor`: the subject's newest jobs, without payloads. */
  getJobsFor(subjectId: string): Promise<Result<readonly JobView[]>>;
  /** `case-study.recordEvent`. */
  recordEvent(actor: Actor, input: { caseId: string; type: string; revisionId: string; data: Record<string, string> }): Promise<Result<unknown>>;
}

const invalid = (fields: string[]) => err({ code: "INVALID_INPUT", message: `Invalid or missing: ${fields.join(", ")}.`, details: { fields } });

const isUuid = (value: unknown) => z.uuid().safeParse(value).success;

/** The fields of a status input that are actually wrong: `caseId`, exactly one of `jobId` / `exportId`, nothing else. */
function statusFields(input: unknown): string[] {
  const given = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const bad: string[] = [];
  if (!isUuid(given.caseId)) bad.push("caseId");
  const ids = (["jobId", "exportId"] as const).filter((key) => Object.hasOwn(given, key));
  if (ids.length === 0) bad.push("jobId");
  else if (ids.length > 1) bad.push(...ids);
  else if (!isUuid(given[ids[0]])) bad.push(ids[0]);
  bad.push(...Object.keys(given).filter((key) => !["caseId", "jobId", "exportId"].includes(key)));
  return bad.length > 0 ? bad : ["input"];
}

function fieldsOf(issues: readonly { path: readonly PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((issue) => String(issue.path[0] ?? "input")))];
}

/** A signed GET of `record` named after the case, and the `export` case event with the actor. */
async function deliver(
  deps: Pick<RequestExportDeps, "storage" | "recordEvent">,
  actor: Actor,
  caseStudy: { id: string; code: string; name: string },
  record: ExportRecord,
): Promise<Result<ExportTicket>> {
  const fileName = exportFileName(caseStudy.code, caseStudy.name, record.format);
  const url = await deps.storage.presignDownload(record.path, EXPORT_URL_TTL_SECONDS, fileName);
  if (!url.ok) return url;
  const recorded = await deps.recordEvent(actor, {
    caseId: caseStudy.id,
    type: CASE_EXPORTED,
    revisionId: record.parts[0].revisionId,
    data: { exportId: record.id, format: record.format },
  });
  if (!recorded.ok) return recorded;
  return ok({ status: "ready", exportId: record.id, url: url.value, fileName });
}

/**
 * The stored export with this content hash, or `null` (Story 5.3): an export is reused
 * only when its hash matches. Errors: the repository's.
 */
export function makeEnsureExport(deps: Pick<RequestExportDeps, "exports">) {
  return (hash: string): Promise<Result<ExportRecord | null>> => deps.exports.findByHash(hash);
}

/**
 * Asks for one format of a case's live approved revision as a file (Story 5.3): input
 * `{ caseId, format }`. Reads the live revision (never a working head), refuses without
 * enqueueing when there is none (`NOT_APPROVED`) or the format has no pages in it
 * (`FORMAT_NOT_IN_REVISION`), reuses a stored export with the same content hash (`ready`,
 * with an `export` case event), and otherwise enqueues one `export` job (`pending`; a
 * second press while it runs returns the same job). Authorize `export` first.
 * Errors also: `INVALID_INPUT` (naming `format` for an id outside the registry),
 * `FORMAT_NOT_EXPORTABLE` (Video), `NOT_FOUND`, the reads'.
 */
export function makeRequestExport(deps: RequestExportDeps) {
  return async function requestExport(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = requestExportInputSchema.safeParse(input);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const { caseId, format } = parsed.data;
    const refused = notExportable(format);
    if (refused !== null) return err(refused);
    if (!isFormatId(format) || !isExportFormatId(format)) return invalid(["format"]);

    const source = await readExportSource(deps, caseId, format);
    if (!source.ok) return source;
    const { caseStudy, content, contentHash } = source.value;

    const existing = await makeEnsureExport(deps)(contentHash);
    if (!existing.ok) return existing;
    if (existing.value !== null) return deliver(deps, actor, caseStudy, existing.value);

    const job = await deps.enqueue({
      kind: "export",
      subjectId: caseStudy.id,
      inputHash: contentHash,
      payload: { parts: [content.part], format, requestedBy: actor.id },
    });
    if (!job.ok) return job;
    return ok({ status: "pending", jobId: job.value.id });
  };
}

/**
 * Where an export request stands (Story 5.3): input `{ caseId, jobId }` (the job
 * `requestExport` enqueued) or `{ caseId, exportId }`. `pending` while the job is queued
 * or running, `failed` once it failed for good, `ready` with a signed GET (and an `export`
 * case event with the actor) once its file is stored. The case must still have a live
 * approved revision (`NOT_APPROVED`), and it must be the one the file drew
 * (`EXPORT_STALE` after a newer version was approved: ask again). Authorize `export`
 * first. Errors also: `INVALID_INPUT`, `NOT_FOUND` (an unknown job or export, or another
 * case's), the reads'.
 */
export function makeExportStatus(deps: RequestExportDeps) {
  return async function exportStatus(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = exportStatusInputSchema.safeParse(input);
    if (!parsed.success) return invalid(statusFields(input));
    const { caseId } = parsed.data;
    const notFound = () => err({ code: "NOT_FOUND", message: "No such export.", details: { caseId } });

    const found = await deps.getCase(caseId);
    if (!found.ok) return found;
    const caseStudy = found.value;
    // Approved only (NFR1): nothing is looked up, let alone handed out, without a live revision.
    const live = await deps.getLiveRevision({ kind: "case", id: caseStudy.id });
    if (!live.ok) return live;
    if (live.value === null) return notApproved(caseStudy.id);

    let record: ExportRecord | null;
    if ("jobId" in parsed.data) {
      const jobs = await deps.getJobsFor(caseStudy.id);
      if (!jobs.ok) return jobs;
      const wanted = parsed.data.jobId.toLowerCase();
      const job = jobs.value.find((j) => j.id.toLowerCase() === wanted);
      if (job === undefined || job.kind !== "export") return notFound();
      if (job.status === "queued" || job.status === "running") return ok({ status: "pending", jobId: job.id });
      if (job.status === "failed") return ok({ status: "failed" });
      const stored = await deps.exports.findByHash(job.inputHash);
      if (!stored.ok) return stored;
      if (stored.value === null) return ok({ status: "failed" });
      record = stored.value;
    } else {
      const stored = await deps.exports.findById(parsed.data.exportId);
      if (!stored.ok) return stored;
      record = stored.value;
    }
    if (record === null || record.parts.length !== 1 || record.parts[0].subject.id.toLowerCase() !== caseStudy.id.toLowerCase()) return notFound();

    // A file is handed out only while the revision it drew is the live one.
    if (live.value.id.toLowerCase() !== record.parts[0].revisionId.toLowerCase()) {
      return err({ code: EXPORT_STALE, message: "A newer version was approved since: export it again.", details: { caseId } });
    }
    return deliver(deps, actor, caseStudy, record);
  };
}
