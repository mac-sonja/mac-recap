import { z } from "zod";
import type { Actor } from "@/modules/access";
import { CASE_EXPORTED } from "@/modules/case-study";
import {
  bundleHashOf,
  bundleHashOfDrawings,
  notApproved,
  readCollectionSources,
  readExportSources,
  readPackParts,
  readPackSources,
  sameParts,
  type CollectionSourceDeps,
  type ExportDrawing,
  type ExportSourceDeps,
  type PackSourceDeps,
} from "@/modules/rendering/application/export-source";
import {
  EXPORT_BUNDLE,
  EXPORT_FORMAT_IDS,
  EXPORT_MAX_PARTS,
  EXPORT_STALE,
  EXPORT_TOO_LARGE,
  collectionFileName,
  collectionStatusInputSchema,
  exportStatusInputSchema,
  requestCollectionInputSchema,
  type ExportCollection,
  packStatusInputSchema,
  requestPackInputSchema,
  type PackClient,
  isExportFormatId,
  notExportable,
  recordFileName,
  requestExportInputSchema,
  type ExportFormatId,
  type ExportPayload,
  type ExportRecord,
} from "@/modules/rendering/domain/export";
import { FORMAT_NOT_IN_REVISION, isFormatId } from "@/modules/rendering/domain/formats";
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

/** The fields of a status input that are actually wrong: `subjectKey` (`caseId` or `clientId`), exactly one of `jobId` / `exportId`, nothing else. */
function statusFields(input: unknown, subjectKey: "caseId" | "clientId" | "collectionId" = "caseId"): string[] {
  const given = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const bad: string[] = [];
  if (!isUuid(given[subjectKey])) bad.push(subjectKey);
  const ids = (["jobId", "exportId"] as const).filter((key) => Object.hasOwn(given, key));
  if (ids.length === 0) bad.push("jobId");
  else if (ids.length > 1) bad.push(...ids);
  else if (!isUuid(given[ids[0]])) bad.push(ids[0]);
  bad.push(...Object.keys(given).filter((key) => ![subjectKey, "jobId", "exportId"].includes(key)));
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
  const fileName = recordFileName(caseStudy.code, caseStudy.name, record.format);
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
 * The formats asked for, in the order given: `format` (Story 5.3) or `formats` (5.4).
 * Errors: `FORMAT_NOT_EXPORTABLE` (Video), `INVALID_INPUT` naming the field for an id
 * outside the registry or a repeated one.
 */
function formatsOf(input: { format: string } | { formats: string[] }): Result<ExportFormatId[]> {
  const field = "format" in input ? "format" : "formats";
  const given = "format" in input ? [input.format] : input.formats;
  for (const format of given) {
    const refused = notExportable(format);
    if (refused !== null) return err(refused);
  }
  if (!given.every((f) => isFormatId(f) && isExportFormatId(f)) || new Set(given).size !== given.length) return invalid([field]);
  return ok(given as ExportFormatId[]);
}

/**
 * Asks for one format of a case's live approved revision as a file (Story 5.3): input
 * `{ caseId, format }`, or `{ caseId, formats }` (Story 5.4) where one format is the
 * same, and two or more ask for one ZIP of them (a bundle, reused by its own hash: its
 * formats, sorted, each with its own content hash, `EXPORT_RENDER_VERSION` and the names
 * of the files inside, which carry the case's code and name; else one `export` job
 * renders the missing formats and zips them). Every format is checked before anything is
 * enqueued. Reads the live revision (never a working head), refuses without
 * enqueueing when there is none (`NOT_APPROVED`) or the format has no pages in it
 * (`FORMAT_NOT_IN_REVISION`), reuses a stored export with the same content hash (`ready`,
 * with an `export` case event), and otherwise enqueues one `export` job (`pending`; a
 * second press while it runs returns the same job). Authorize `export` first.
 * Errors also: `INVALID_INPUT` (naming `format` for an id outside the registry),
 * `FORMAT_NOT_EXPORTABLE` (Video), `NOT_FOUND`, the reads'.
 */
export function makeRequestExport(deps: RequestExportDeps) {
  return async function requestExport(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = requestExportInputSchema(input).safeParse(input);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const { caseId } = parsed.data;
    const formats = formatsOf(parsed.data);
    if (!formats.ok) return formats;

    // Every format's approval and pages are checked before anything is enqueued.
    const sources = await readExportSources(deps, caseId, formats.value);
    if (!sources.ok) return sources;
    const [{ caseStudy, revision }] = sources.value;
    const part = { subject: { kind: "case" as const, id: caseStudy.id }, revisionId: revision.id };
    const bundled = sources.value.length > 1 ? sources.value.map((s) => s.format).sort() : [];
    const hash = bundled.length > 0 ? bundleHashOf(sources.value) : sources.value[0].contentHash;

    const existing = await makeEnsureExport(deps)(hash);
    if (!existing.ok) return existing;
    if (existing.value !== null) return deliver(deps, actor, caseStudy, existing.value);

    const payload: ExportPayload =
      bundled.length > 0
        ? { parts: [part], format: EXPORT_BUNDLE, formats: bundled, requestedBy: actor.id }
        : { parts: [part], format: sources.value[0].format, requestedBy: actor.id };
    const job = await deps.enqueue({ kind: "export", subjectId: caseStudy.id, inputHash: hash, payload });
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

// ---------------------------------------------------------------------------
// A client's pack (Story 5.9a)
// ---------------------------------------------------------------------------

export interface RequestPackDeps extends RequestExportDeps, PackSourceDeps {}

/**
 * Every content hash the client's pack has now: each format it can export alone, and each
 * bundle of two or more of them. Errors: the reads' (a format a part lacks is left out).
 */
async function currentPackHashes(deps: PackSourceDeps, clientId: string): Promise<Result<Set<string>>> {
  const drawings: ExportDrawing[] = [];
  for (const format of EXPORT_FORMAT_IDS) {
    const read = await readPackSources(deps, clientId, [format]);
    if (!read.ok) {
      if (read.error.code === FORMAT_NOT_IN_REVISION) continue;
      return read;
    }
    drawings.push(read.value.drawings[0]);
  }
  const hashes = new Set(drawings.map((d) => d.contentHash));
  // Every subset of two or more formats, as a bundle.
  for (let mask = 0; mask < 1 << drawings.length; mask++) {
    const chosen = drawings.filter((_, i) => (mask & (1 << i)) !== 0);
    if (chosen.length >= 2) hashes.add(bundleHashOfDrawings(chosen));
  }
  return ok(hashes);
}

/**
 * A signed GET of a pack's `record` named after the client, and one `export` case event
 * per case in it (the existing export event, `data { exportId, format, clientId }`, with the
 * case's own approved revision): the pack's activity, on each case it holds.
 */
async function deliverPack(
  deps: Pick<RequestExportDeps, "storage" | "recordEvent">,
  actor: Actor,
  client: PackClient,
  record: ExportRecord,
): Promise<Result<ExportTicket>> {
  const fileName = recordFileName(client.code, client.name, record.format);
  const url = await deps.storage.presignDownload(record.path, EXPORT_URL_TTL_SECONDS, fileName);
  if (!url.ok) return url;
  for (const part of record.parts) {
    if (part.subject.kind !== "case") continue;
    const recorded = await deps.recordEvent(actor, {
      caseId: part.subject.id,
      type: CASE_EXPORTED,
      revisionId: part.revisionId,
      data: { exportId: record.id, format: record.format, clientId: client.id },
    });
    if (!recorded.ok) return recorded;
  }
  return ok({ status: "ready", exportId: record.id, url: url.value, fileName });
}

/**
 * Asks for a client's pack as a file (Story 5.9a): input `{ clientId, formats }` (or
 * `{ clientId, format }`), one format its own file, two or more one ZIP of them, as for a
 * case. The pack is the client's approved intro (`intro` pages), its approved cases in the
 * client's order (4.12b) without their own intros (and Carosello Chiusura), and the intro's
 * closing once; without an approved intro, each case with all its pages. Live revisions
 * only. Every format is checked before anything is enqueued. Reuses a stored export with
 * the same content hash (`ready`, with an `export` case event per case), else enqueues one
 * `export` job for the client (`pending`). Authorize first (owner/designer: `list clients`
 * and `export`). Errors: `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE` (Video),
 * `CLIENT_NOT_FOUND`, `NOT_APPROVED` (no approved case), `FORMAT_NOT_IN_REVISION` (a part
 * has no pages in a format), `EXPORT_TOO_LARGE` (more parts than an export holds), the reads'.
 */
export function makeRequestPack(deps: RequestPackDeps) {
  return async function requestPack(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = requestPackInputSchema(input).safeParse(input);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const { clientId } = parsed.data;
    const formats = formatsOf(parsed.data);
    if (!formats.ok) return formats;

    const read = await readPackSources(deps, clientId, formats.value);
    if (!read.ok) return read;
    const { client, parts, drawings } = read.value;
    if (parts.length > EXPORT_MAX_PARTS) {
      return err({ code: EXPORT_TOO_LARGE, message: "This pack holds more cases than one file can.", details: { clientId: client.id } });
    }
    const bundled = drawings.length > 1 ? drawings.map((d) => d.format).sort() : [];
    const hash = bundled.length > 0 ? bundleHashOfDrawings(drawings) : drawings[0].contentHash;

    const existing = await deps.exports.findByHash(hash);
    if (!existing.ok) return existing;
    if (existing.value !== null) return deliverPack(deps, actor, client, existing.value);

    const subject = { kind: "client" as const, id: client.id };
    const payload: ExportPayload =
      bundled.length > 0
        ? { subject, parts: [...parts], format: EXPORT_BUNDLE, formats: bundled, requestedBy: actor.id }
        : { subject, parts: [...parts], format: drawings[0].format, requestedBy: actor.id };
    const job = await deps.enqueue({ kind: "export", subjectId: client.id, inputHash: hash, payload });
    if (!job.ok) return job;
    return ok({ status: "pending", jobId: job.value.id });
  };
}

/**
 * Where a pack request stands (Story 5.9a): input `{ clientId, jobId }` or `{ clientId,
 * exportId }`. As `exportStatus` for a case: `pending`, `failed`, or `ready` (with an
 * `export` case event per case). The client must still have an approved case
 * (`NOT_APPROVED`), and the file must be of the pack as it is now, the same parts with the
 * same approved revisions in the same order (`EXPORT_STALE` otherwise: ask again).
 * Authorize first. Errors also: `INVALID_INPUT`, `NOT_FOUND` (an unknown job or export,
 * or another client's), `CLIENT_NOT_FOUND`, the reads'.
 */
export function makePackStatus(deps: RequestPackDeps) {
  return async function packStatus(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = packStatusInputSchema.safeParse(input);
    if (!parsed.success) return invalid(statusFields(input, "clientId"));
    const { clientId } = parsed.data;
    const notFound = () => err({ code: "NOT_FOUND", message: "No such export.", details: { clientId } });

    // Approved only (NFR1): nothing is looked up, let alone handed out, without an approved case.
    const read = await readPackParts(deps, clientId);
    if (!read.ok) return read;
    const { client, parts } = read.value;
    const stale = () => err({ code: EXPORT_STALE, message: "The pack changed since: export it again.", details: { clientId: client.id } });

    let record: ExportRecord | null;
    if ("jobId" in parsed.data) {
      const jobs = await deps.getJobsFor(client.id);
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
    if (record === null) return notFound();

    // A file is handed out only while it is of the pack as it is now: the same parts and the
    // same content hash (a client or case field edit, or a rename, gives another one; a case's
    // own export never has a pack's hash).
    if (!sameParts(record.parts, parts)) {
      const ours = new Set(parts.map((p) => p.subject.id.toLowerCase()));
      if (!record.parts.some((p) => ours.has(p.subject.id.toLowerCase()))) return notFound();
      return stale();
    }
    const current = await currentPackHashes(deps, client.id);
    if (!current.ok) return current;
    if (!current.value.has(record.contentHash.toLowerCase())) return stale();
    return deliverPack(deps, actor, client, record);
  };
}

// ---------------------------------------------------------------------------
// A collection (Story 5.10b)
// ---------------------------------------------------------------------------

export interface RequestCollectionDeps extends RequestExportDeps, CollectionSourceDeps {
  /** `collection.recordCollectionExported`: one `collection_exported` event in `collection_event`. */
  recordCollectionEvent(actor: Actor, input: { collectionId: string; exportId: string; format: string }): Promise<Result<unknown>>;
}

/**
 * Every content hash the collection's file has now, from one read (`drawings`, a format a part
 * lacks left out): each format alone, and each bundle of two or more of them.
 */
function collectionHashesOf(drawings: readonly ExportDrawing[]): Set<string> {
  const hashes = new Set(drawings.map((d) => d.contentHash));
  for (let mask = 0; mask < 1 << drawings.length; mask++) {
    const chosen = drawings.filter((_, i) => (mask & (1 << i)) !== 0);
    if (chosen.length >= 2) hashes.add(bundleHashOfDrawings(chosen));
  }
  return hashes;
}

/**
 * A signed GET of a collection's `record` named after the collection, and one
 * `collection_exported` event (`data { exportId, format }`) in the collection's log, as a
 * pack's delivery records its export events.
 */
async function deliverCollection(
  deps: Pick<RequestCollectionDeps, "storage" | "recordCollectionEvent">,
  actor: Actor,
  collection: ExportCollection,
  record: ExportRecord,
): Promise<Result<ExportTicket>> {
  const fileName = recordFileName("", collectionFileName(collection.name), record.format);
  const url = await deps.storage.presignDownload(record.path, EXPORT_URL_TTL_SECONDS, fileName);
  if (!url.ok) return url;
  const recorded = await deps.recordCollectionEvent(actor, { collectionId: collection.id, exportId: record.id, format: record.format });
  if (!recorded.ok) return recorded;
  return ok({ status: "ready", exportId: record.id, url: url.value, fileName });
}

/**
 * Asks for a collection as a file (Story 5.10b): input `{ collectionId, formats }` (or
 * `{ collectionId, format }`), one format its own file, two or more one ZIP of them, as for a
 * case. Per client group in the collection's order: with 2 or more available cases and an
 * approved intro, the intro, the cases without their own intros (and Carosello Chiusura) and
 * the closing once; otherwise each case whole. A case with no approved revision, or deleted, is
 * left out. Live revisions only. Every format is checked before anything is enqueued. Reuses a
 * stored export with the same content hash (`ready`, with a `collection_exported` event),
 * else enqueues one `export` job for the collection (`pending`). Authorize first
 * (`manage collections`). Errors: `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE` (Video),
 * `COLLECTION_NOT_FOUND`, `NOT_APPROVED` (no available case), `FORMAT_NOT_IN_REVISION`,
 * `EXPORT_TOO_LARGE` (more parts than an export holds), the reads'.
 */
export function makeRequestCollection(deps: RequestCollectionDeps) {
  return async function requestCollection(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = requestCollectionInputSchema(input).safeParse(input);
    if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
    const { collectionId } = parsed.data;
    const formats = formatsOf(parsed.data);
    if (!formats.ok) return formats;

    const read = await readCollectionSources(deps, collectionId.toLowerCase(), formats.value);
    if (!read.ok) return read;
    const { collection, parts, drawings } = read.value;
    if (parts.length > EXPORT_MAX_PARTS) {
      return err({ code: EXPORT_TOO_LARGE, message: "This collection holds more parts than one file can.", details: { collectionId: collection.id } });
    }
    const bundled = drawings.length > 1 ? drawings.map((d) => d.format).sort() : [];
    const hash = bundled.length > 0 ? bundleHashOfDrawings(drawings) : drawings[0].contentHash;

    const existing = await deps.exports.findByHash(hash);
    if (!existing.ok) return existing;
    if (existing.value !== null) return deliverCollection(deps, actor, collection, existing.value);

    const subject = { kind: "collection" as const, id: collection.id };
    const payload: ExportPayload =
      bundled.length > 0
        ? { subject, parts: [...parts], format: EXPORT_BUNDLE, formats: bundled, requestedBy: actor.id }
        : { subject, parts: [...parts], format: drawings[0].format, requestedBy: actor.id };
    const job = await deps.enqueue({ kind: "export", subjectId: collection.id, inputHash: hash, payload });
    if (!job.ok) return job;
    return ok({ status: "pending", jobId: job.value.id });
  };
}

/**
 * Where a collection request stands (Story 5.10b): input `{ collectionId, jobId }` or
 * `{ collectionId, exportId }`. `pending` or `failed` straight from the collection's job (the
 * 2 s poll reads nothing else meanwhile). Before a file is handed out (`ready`, with a
 * `collection_exported` event) the collection is read once, live revisions only: it must still
 * have an available case (`NOT_APPROVED`), and the file must be of the collection as it is now,
 * the same parts in the same order and one of its current content hashes, all taken from that
 * one read (`EXPORT_STALE` otherwise, after a reorder, a rename, an added or removed case, a
 * newer approved version or a client field edit: ask again). A case's own export or a client
 * pack never has a collection's hash. Authorize first. Errors also: `INVALID_INPUT`,
 * `NOT_FOUND` (an unknown job or export, or one of none of its cases), `COLLECTION_NOT_FOUND`,
 * the reads'.
 */
export function makeCollectionStatus(deps: RequestCollectionDeps) {
  return async function collectionStatus(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
    const parsed = collectionStatusInputSchema.safeParse(input);
    if (!parsed.success) return invalid(statusFields(input, "collectionId"));
    const collectionId = parsed.data.collectionId.toLowerCase();
    const notFound = () => err({ code: "NOT_FOUND", message: "No such export.", details: { collectionId } });

    // A job still working or failed is answered from its state alone.
    let hash: string | null = null;
    if ("jobId" in parsed.data) {
      const jobs = await deps.getJobsFor(collectionId);
      if (!jobs.ok) return jobs;
      const wanted = parsed.data.jobId.toLowerCase();
      const job = jobs.value.find((j) => j.id.toLowerCase() === wanted);
      if (job === undefined || job.kind !== "export") return notFound();
      if (job.status === "queued" || job.status === "running") return ok({ status: "pending", jobId: job.id });
      if (job.status === "failed") return ok({ status: "failed" });
      hash = job.inputHash;
    }

    // Approved only (NFR1): nothing is handed out without an available case, read once now.
    const read = await readCollectionSources(deps, collectionId, EXPORT_FORMAT_IDS, { skipMissingFormats: true });
    if (!read.ok) return read;
    const { collection, parts, drawings } = read.value;
    const stale = () => err({ code: EXPORT_STALE, message: "The collection changed since: export it again.", details: { collectionId: collection.id } });

    const stored = hash === null ? await deps.exports.findById((parsed.data as { exportId: string }).exportId) : await deps.exports.findByHash(hash);
    if (!stored.ok) return stored;
    const record = stored.value;
    if (record === null) return hash === null ? notFound() : ok({ status: "failed" });

    // Handed out only while it is of the collection as it is now: the same parts and one of its
    // current content hashes (a rename or a client field edit gives another one; a case's own
    // export or a client pack never has a collection's hash).
    if (!sameParts(record.parts, parts)) {
      const ours = new Set(parts.map((p) => p.subject.id.toLowerCase()));
      if (!record.parts.some((p) => ours.has(p.subject.id.toLowerCase()))) return notFound();
      return stale();
    }
    if (!collectionHashesOf(drawings).has(record.contentHash.toLowerCase())) return stale();
    return deliverCollection(deps, actor, collection, record);
  };
}
