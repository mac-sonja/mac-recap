"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { renderAssetsOf } from "../../../_lib/configurator-data";
import { isMedia } from "../../../_components/configurator/media-files";

/** The most render assets one call reads (the case holds at most 20 files). */
const MAX_RENDER_ASSETS = 50;

/**
 * The configurator's autosave (Story 4.3a): input `{ caseId, revisionId, doc,
 * expectedVersion }`, the whole edited document of the case's head revision and the
 * `version` it was based on; returns the new `version`. 403 `FORBIDDEN` unless the role
 * may `edit`; 400 `INVALID_INPUT`, `DOCUMENT_INVALID`, `DOCUMENT_SCHEMA_UNSUPPORTED`,
 * `FORMAT_NOT_IN_REVISION`, `ASSET_NOT_ALLOWED` (a new file that is not this case's or its
 * client's, Story 4.5a); 404 `NOT_FOUND`; 409 `STALE_REVISION`,
 * `STALE_HEAD`, `REVISION_NOT_WRITABLE`, `CASE_NOT_EDITABLE` (the case is no longer In
 * revisione, e.g. generating). Nothing is written on any error.
 */
export async function saveRevisionDoc(input: unknown): Promise<ActionResult<{ version: number }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveRevisionDoc(actor.value, input, material.liveAssetIds);
  return saved.ok ? { ok: true, value: { version: saved.value.version } } : failure(saved.error);
}

/**
 * **Approva** (Story 4.8): input `{ caseId, revisionId, expectedRevisionVersion,
 * expectedHeadVersion, overflow }` (each format of that revision version, `true` when a
 * page overflows, as the browser measured it). Returns `{ waiting }`: whether other cases
 * are still in Da approvare (the configurator goes there, else to Case studies). 403
 * `FORBIDDEN` unless the role may `approve`; 400 `INVALID_INPUT`, `OVERFLOW_NOT_CLEARED`,
 * `MATERIAL_MISSING` (with `assetIds`); 404 `NOT_FOUND`; 409 `STALE_REVISION`, `STALE_HEAD`,
 * `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function approveCase(input: unknown): Promise<ActionResult<{ waiting: boolean }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "approve");
  if (!decision.ok) return failure(decision.error);
  const approved = await caseStudy.approve(actor.value, input, material.liveAssetIds);
  if (!approved.ok) return failure(approved.error);
  // Other cases waiting decide where the person goes next; a failed read only sends them to Case studies.
  const waiting = await caseStudy.list({ status: "in_review" });
  return { ok: true, value: { waiting: waiting.ok && waiting.value.length > 0 } };
}

/**
 * The render assets of files the Media tab listed after the page loaded (Story 4.5b): input
 * `{ caseId, assetIds }`; returns, by asset id, those that are this case's live images and
 * videos with a rendition ready (an id that isn't, or whose rendition is still being made,
 * is left out, so the caller asks again later; so is one whose rendition can't be read,
 * without failing the others). 403 `FORBIDDEN` unless the role may `edit`; 400 `INVALID_INPUT`.
 */
export async function getRenderAssets(input: unknown): Promise<ActionResult<Record<string, RenderAsset>>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const { caseId, assetIds } = (input ?? {}) as { caseId?: unknown; assetIds?: unknown };
  if (!Array.isArray(assetIds) || assetIds.length > MAX_RENDER_ASSETS || !assetIds.every((id) => typeof id === "string")) {
    return failure({ code: "INVALID_INPUT", message: "assetIds must be a list of ids.", details: { fields: ["assetIds"] } });
  }
  const listed = await material.listAssets({ caseId });
  if (!listed.ok) return failure(listed.error);
  const wanted = new Set(assetIds.map((id) => id.toLowerCase()));
  const files = listed.value.filter((asset) => isMedia(asset) && wanted.has(asset.id.toLowerCase()));
  const read = (assetId: string, spec: string) => material.getRendition(assetId, spec);
  const each = await Promise.all(files.map((file) => renderAssetsOf([file], read).catch(() => ({}))));
  return { ok: true, value: Object.assign({}, ...each) };
}
