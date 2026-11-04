"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as rendering from "@/modules/rendering/server";
import type { ExportTicket } from "@/modules/rendering/server";

/**
 * **Scarica** on an approved case (Story 5.3): input `{ caseId, format }`, or
 * `{ caseId, formats }` (Story 5.4: one format the same, two or more one ZIP of them,
 * every format checked before anything is enqueued). Reads the
 * case's live approved revision; when the same content was exported before, returns
 * `{ status: "ready", url, fileName }` at once (a signed GET valid 10 minutes, and an
 * `export` case event); otherwise enqueues an `export` job for the worker and returns
 * `{ status: "pending", jobId }`. Web requests never render. 403 `FORBIDDEN` unless the
 * role may `export` an approved case; 400 `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE`
 * (Video), `FORMAT_NOT_IN_REVISION`; 404 `NOT_FOUND`; 409 `NOT_APPROVED`. Nothing is
 * enqueued on any error.
 */
export async function requestCaseExport(input: unknown): Promise<ActionResult<ExportTicket>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  // What is exported is always an approved revision: the module checks it has one.
  const decision = authorize(actor.value, "export", { status: "approved" });
  if (!decision.ok) return failure(decision.error);
  const requested = await rendering.requestExport(actor.value, input);
  return requested.ok ? requested : failure(requested.error);
}

/**
 * Where a **Scarica** stands (Story 5.3), polled every 2 s: input `{ caseId, jobId }`.
 * `{ status: "pending" }`, `{ status: "failed" }` (the export didn't finish: ask again),
 * or `{ status: "ready", url, fileName }` with an `export` case event. 403 `FORBIDDEN`
 * unless the role may `export` an approved case; 400 `INVALID_INPUT`; 404 `NOT_FOUND`;
 * 409 `NOT_APPROVED`, `EXPORT_STALE` (a newer version was approved since).
 */
export async function getCaseExportStatus(input: unknown): Promise<ActionResult<ExportTicket>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "export", { status: "approved" });
  if (!decision.ok) return failure(decision.error);
  const status = await rendering.exportStatus(actor.value, input);
  return status.ok ? status : failure(status.error);
}
