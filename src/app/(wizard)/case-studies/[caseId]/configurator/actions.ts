"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";

/**
 * The configurator's autosave (Story 4.3a): input `{ caseId, revisionId, doc,
 * expectedVersion }`, the whole edited document of the case's head revision and the
 * `version` it was based on; returns the new `version`. 403 `FORBIDDEN` unless the role
 * may `edit`; 400 `INVALID_INPUT`, `DOCUMENT_INVALID`, `DOCUMENT_SCHEMA_UNSUPPORTED`,
 * `FORMAT_NOT_IN_REVISION`, `ASSET_NOT_ALLOWED`; 404 `NOT_FOUND`; 409 `STALE_REVISION`,
 * `STALE_HEAD`, `REVISION_NOT_WRITABLE`, `CASE_NOT_EDITABLE` (the case is no longer In
 * revisione, e.g. generating). Nothing is written on any error.
 */
export async function saveRevisionDoc(input: unknown): Promise<ActionResult<{ version: number }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveRevisionDoc(actor.value, input);
  return saved.ok ? { ok: true, value: { version: saved.value.version } } : failure(saved.error);
}
