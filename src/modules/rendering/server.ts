// Server-only entry of the rendering module (Story 5.3): the export use cases, for server
// actions. index.ts stays pure and safe for client components (the preview imports it);
// this file reads the database and storage, so only server code imports it (eslint, AD-1).
// It never reaches Chromium: the worker renders (`worker.ts`, AD-10).
import type { Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as collection from "@/modules/collection";
import * as jobs from "@/modules/jobs";
import * as material from "@/modules/material";
import { readCollection } from "@/modules/rendering/adapters/collection/read-collection";
import { createSupabaseExportRepository } from "@/modules/rendering/adapters/supabase/export-repository";
import { createSupabaseExportStorage } from "@/modules/rendering/adapters/supabase/export-storage";
import type { ExportSourceDeps, PackSourceDeps } from "@/modules/rendering/application/export-source";
import {
  makeCollectionStatus,
  makeExportStatus,
  makePackStatus,
  makeRequestCollection,
  makeRequestExport,
  makeRequestPack,
  type ExportTicket,
  type RequestCollectionDeps,
  type RequestPackDeps,
} from "@/modules/rendering/application/request-export";
import type { Result } from "@/shared/result";

export { EXPORT_STALE, FORMAT_NOT_EXPORTABLE, NOT_APPROVED } from "@/modules/rendering/domain/export";
export type { ExportRecord } from "@/modules/rendering/domain/export";
export type { ExportTicket } from "@/modules/rendering/application/request-export";

/** The reads every export starts from, through the case-study and material modules' index. */
export const exportSourceDeps = (): ExportSourceDeps => ({
  getCase: caseStudy.get,
  getLiveRevision: caseStudy.getLiveRevision,
  getClientInfoForCase: caseStudy.getClientInfoForCase,
  getDetailsForm: material.getDetailsForm,
});

/** The reads a client's pack starts from (Story 5.9a): a case's, and the client, its intro and its cases in order. */
export const packSourceDeps = (): PackSourceDeps => ({
  ...exportSourceDeps(),
  getClient: caseStudy.getClient,
  getClientIntro: caseStudy.getClientIntro,
  listClientCasesInOrder: caseStudy.listClientCasesInOrder,
});

function deps(): RequestPackDeps & RequestCollectionDeps {
  return {
    ...packSourceDeps(),
    getCollection: readCollection,
    recordCollectionEvent: (actor, input) => collection.recordCollectionExported(actor, input),
    exports: createSupabaseExportRepository(),
    storage: createSupabaseExportStorage(),
    enqueue: jobs.enqueue,
    getJobsFor: jobs.getJobsFor,
    recordEvent: caseStudy.recordEvent,
  };
}

/**
 * Asks for one format of a case's live approved revision as a file: input `{ caseId,
 * format }`. Returns `{ status: "ready", exportId, url, fileName }` when the same content
 * was exported before (a signed GET valid 10 minutes, and an `export` case event with the
 * actor), else enqueues an `export` job and returns `{ status: "pending", jobId }`.
 * Nothing is enqueued on any error. Call only after `authorize(actor, 'export', { status:
 * 'approved' })`. Errors: `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE` (Video),
 * `FORMAT_NOT_IN_REVISION`, `NOT_FOUND`, `NOT_APPROVED` (no approved revision), the reads'.
 */
export function requestExport(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
  return makeRequestExport(deps())(actor, input);
}

/**
 * Where an export request stands: input `{ caseId, jobId }` or `{ caseId, exportId }`.
 * `pending`, `failed`, or `ready` as `requestExport` returns it (with the `export` case
 * event). Call only after `authorize(actor, 'export', { status: 'approved' })`. Errors:
 * `INVALID_INPUT`, `NOT_FOUND`, `NOT_APPROVED`, `EXPORT_STALE` (a newer version was
 * approved since), the reads'.
 */
export function exportStatus(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
  return makeExportStatus(deps())(actor, input);
}

/**
 * Asks for a client's pack as a file (Story 5.9a): input `{ clientId, formats }` (or
 * `{ clientId, format }`). The client's approved intro, its approved cases in the client's
 * order and the intro's closing once (without an approved intro, each case whole), from
 * live revisions only. `ready` when the same pack was exported before (with an `export`
 * case event per case), else an `export` job and `pending`. Nothing is enqueued on any
 * error. Call only after authorizing the actor (owner/designer for now: `list clients` and
 * `export`). Errors: `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE`, `FORMAT_NOT_IN_REVISION`,
 * `CLIENT_NOT_FOUND`, `NOT_APPROVED` (no approved case), `EXPORT_TOO_LARGE`, the reads'.
 */
export function requestPack(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
  return makeRequestPack(deps())(actor, input);
}

/**
 * Where a pack request stands: input `{ clientId, jobId }` or `{ clientId, exportId }`;
 * as `exportStatus`. `EXPORT_STALE` when the pack changed since. Call only after
 * authorizing as `requestPack`. Errors: `INVALID_INPUT`, `NOT_FOUND`, `CLIENT_NOT_FOUND`,
 * `NOT_APPROVED`, `EXPORT_STALE`, the reads'.
 */
export function packStatus(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
  return makePackStatus(deps())(actor, input);
}

/**
 * Asks for a collection as a file (Story 5.10b): input `{ collectionId, formats }` (or
 * `{ collectionId, format }`). Per client group in the collection's order: with 2 or more
 * available cases and an approved intro, the intro, the cases and the closing once; otherwise
 * each case whole; a "Non disponibile" case left out. Live revisions only. `ready` when the
 * same file was exported before (with a `collection_exported` event), else an `export` job and
 * `pending`. Nothing is enqueued on any error. Call only after `authorize(actor, 'manage
 * collections')`. Errors: `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE`, `FORMAT_NOT_IN_REVISION`,
 * `COLLECTION_NOT_FOUND`, `NOT_APPROVED` (no available case), `EXPORT_TOO_LARGE`, the reads'.
 */
export function requestCollection(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
  return makeRequestCollection(deps())(actor, input);
}

/**
 * Where a collection request stands: input `{ collectionId, jobId }` or `{ collectionId,
 * exportId }`; as `packStatus`. `EXPORT_STALE` when the collection changed since. Call only
 * after authorizing as `requestCollection`. Errors: `INVALID_INPUT`, `NOT_FOUND`,
 * `COLLECTION_NOT_FOUND`, `NOT_APPROVED`, `EXPORT_STALE`, the reads'.
 */
export function collectionStatus(actor: Actor, input: unknown): Promise<Result<ExportTicket>> {
  return makeCollectionStatus(deps())(actor, input);
}
