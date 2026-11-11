"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as rendering from "@/modules/rendering/server";
import type { ExportTicket } from "@/modules/rendering/server";

/**
 * **Scarica** on a client (Story 5.9a): input `{ clientId, formats }`. Builds the client's
 * pack from live approved revisions (its approved intro, its approved cases in the
 * client's order, its approved closing once; without an approved intro, each case whole);
 * when the same pack was exported before, returns `{ status: "ready", url, fileName }` at
 * once (with an `export` case event per case), otherwise enqueues an `export` job and
 * returns `{ status: "pending", jobId }`. Web requests never render. 403 `FORBIDDEN`
 * without `download client pack` (Story 5.9b: every role); 400 `INVALID_INPUT`, `FORMAT_NOT_EXPORTABLE`,
 * `FORMAT_NOT_IN_REVISION`; 404 `CLIENT_NOT_FOUND`; 409 `NOT_APPROVED` (no approved case).
 * Nothing is enqueued on any error.
 */
export async function requestClientExport(input: unknown): Promise<ActionResult<ExportTicket>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  // Story 5.9b: every role that may download a client's pack (owner/designer, admin, account/sales/social).
  const pack = authorize(actor.value, "download client pack", { status: "approved" });
  if (!pack.ok) return failure(pack.error);
  // What is exported is always approved: the module checks every part has an approved revision.
  const decision = authorize(actor.value, "export", { status: "approved" });
  if (!decision.ok) return failure(decision.error);
  const requested = await rendering.requestPack(actor.value, input);
  return requested.ok ? requested : failure(requested.error);
}

/**
 * Where a client's **Scarica** stands (Story 5.9a), polled every 2 s: input
 * `{ clientId, jobId }`. `pending`, `failed`, or `ready` with the signed link (and an
 * `export` case event per case). 403 `FORBIDDEN` without `download client pack`; 400
 * `INVALID_INPUT`; 404 `NOT_FOUND`, `CLIENT_NOT_FOUND`; 409 `NOT_APPROVED`, `EXPORT_STALE`
 * (the pack changed since).
 */
export async function getClientExportStatus(input: unknown): Promise<ActionResult<ExportTicket>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  // Story 5.9b: every role that may download a client's pack (owner/designer, admin, account/sales/social).
  const pack = authorize(actor.value, "download client pack", { status: "approved" });
  if (!pack.ok) return failure(pack.error);
  // What is exported is always approved: the module checks every part has an approved revision.
  const decision = authorize(actor.value, "export", { status: "approved" });
  if (!decision.ok) return failure(decision.error);
  const status = await rendering.packStatus(actor.value, input);
  return status.ok ? status : failure(status.error);
}
