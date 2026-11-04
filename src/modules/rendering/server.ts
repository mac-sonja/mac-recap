// Server-only entry of the rendering module (Story 5.3): the export use cases, for server
// actions. index.ts stays pure and safe for client components (the preview imports it);
// this file reads the database and storage, so only server code imports it (eslint, AD-1).
// It never reaches Chromium: the worker renders (`worker.ts`, AD-10).
import type { Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as jobs from "@/modules/jobs";
import * as material from "@/modules/material";
import { createSupabaseExportRepository } from "@/modules/rendering/adapters/supabase/export-repository";
import { createSupabaseExportStorage } from "@/modules/rendering/adapters/supabase/export-storage";
import type { ExportSourceDeps } from "@/modules/rendering/application/export-source";
import {
  makeExportStatus,
  makeRequestExport,
  type ExportTicket,
  type RequestExportDeps,
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

function deps(): RequestExportDeps {
  return {
    ...exportSourceDeps(),
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
