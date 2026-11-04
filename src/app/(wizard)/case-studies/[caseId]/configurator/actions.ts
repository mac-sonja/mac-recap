"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import type { CaseResultsSaved, CaseTestimonialSaved } from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { clientMediaFiles, clientRenderAssetsOf, renderAssetsOf } from "../../../_lib/configurator-data";
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
  // An approved case's copy is updated through updateApprovedVersion (Story 4.9), never approved again here.
  const found = await caseStudy.get(typeof input === "object" && input !== null ? (input as { caseId?: unknown }).caseId : undefined);
  if (found.ok && found.value?.status === "approved") {
    return failure({ code: "CASE_NOT_APPROVABLE", message: "Only a case study in review can be approved.", details: { status: "approved" } });
  }
  const approved = await caseStudy.approve(actor.value, input, material.liveAssetIds);
  if (!approved.ok) return failure(approved.error);
  // Other cases waiting decide where the person goes next; a failed read only sends them to Case studies.
  const waiting = await caseStudy.list({ status: "in_review" });
  return { ok: true, value: { waiting: waiting.ok && waiting.value.length > 0 } };
}

/**
 * The first edit of an approved case (Story 4.9): input `{ caseId, expectedHeadVersion }`.
 * Forks the approved revision into the working copy every later save goes to, or returns the
 * copy that already exists (idempotent); live reads keep the approved revision. Returns
 * `{ revisionId, version, headVersion }`. 403 `FORBIDDEN` unless the role may `edit`; 400
 * `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `STALE_HEAD`, `CASE_NOT_EDITABLE` (not approved),
 * `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function forkCaseHead(input: unknown): Promise<ActionResult<caseStudy.ForkedHead>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const forked = await caseStudy.forkHead(actor.value, input);
  return forked.ok ? { ok: true, value: forked.value } : failure(forked.error);
}

/**
 * **Aggiorna la versione approvata** (Story 4.9): input as `approveCase`, `revisionId` the
 * approved case's working copy. Runs Story 4.8's checks on the copy, which then becomes the
 * approved revision (the previous one `superseded`); the case stays approved. 403 `FORBIDDEN`
 * unless the role may `update approved version`; 400 `INVALID_INPUT`, `OVERFLOW_NOT_CLEARED`,
 * `MATERIAL_MISSING` (with `assetIds`); 404 `NOT_FOUND`; 409 `STALE_REVISION`, `STALE_HEAD`,
 * `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function updateApprovedVersion(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "update approved version");
  if (!decision.ok) return failure(decision.error);
  const found = await caseStudy.get(typeof input === "object" && input !== null ? (input as { caseId?: unknown }).caseId : undefined);
  if (!found.ok) return failure(found.error);
  // Only an approved case's copy: Da approvare is approved through approveCase, with its own redirect.
  if (found.value?.status !== "approved") {
    return failure({ code: "CASE_NOT_APPROVABLE", message: "Only an approved case study's approved version can be updated.", details: { status: found.value?.status } });
  }
  const updated = await caseStudy.approve(actor.value, input, material.liveAssetIds);
  return updated.ok ? { ok: true, value: undefined } : failure(updated.error);
}

/**
 * **Scarta le modifiche** (Story 4.9): input `{ caseId, revisionId, expectedHeadVersion }`,
 * `revisionId` the approved case's working copy. The copy is superseded and the head goes
 * back to the approved revision. 403 `FORBIDDEN` unless the role may `discard`; 400
 * `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `STALE_HEAD`, `CASE_NOT_EDITABLE`,
 * `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function discardCaseChanges(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "discard");
  if (!decision.ok) return failure(decision.error);
  const discarded = await caseStudy.discardHead(actor.value, input);
  return discarded.ok ? { ok: true, value: undefined } : failure(discarded.error);
}

/**
 * The case's year and services from the configurator (Story 4.3d): input `{ caseId, year,
 * businessLines }`, both as they should be after the save. The code never changes. 403
 * `FORBIDDEN` unless the role may `fill details`; 400 `INVALID_INPUT` (naming each field: a
 * year outside 1900–2100, no or an unknown business line); 404 `NOT_FOUND`; 409
 * `STALE_STATUS` (the case is no longer Da approvare). Nothing is written on any error.
 */
export async function updateCaseFields(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.updateCaseFields(actor.value, input);
  return saved.ok ? { ok: true, value: undefined } : failure(saved.error);
}

/**
 * The case's own words a page binds to are saved from the configurator only while the case
 * is Da approvare (Story 4.3d, owner): an approved case open in a stale tab is refused.
 * `NOT_FOUND` for an unknown or deleted case, `STALE_STATUS` for any other status.
 */
async function whileInReview(input: unknown): Promise<ActionResult<never> | null> {
  const caseId = typeof input === "object" && input !== null ? (input as { caseId?: unknown }).caseId : undefined;
  const found = await caseStudy.get(caseId);
  if (!found.ok) return failure(found.error);
  const status = found.value?.status;
  if (status !== "in_review") {
    return failure({ code: "STALE_STATUS", message: "The case study is no longer Da approvare.", details: { status } });
  }
  return null;
}

/**
 * The case's Risultati from the configurator (Story 4.3d): input `{ caseId, results }` as
 * `saveCaseResults` takes it (the whole list). 403 `FORBIDDEN` unless the role may `fill
 * details`; 404 `NOT_FOUND`; 409 `STALE_STATUS` unless the case is Da approvare; then the
 * material save's own errors (400 `INVALID_INPUT`). Nothing is written on any error.
 */
export async function saveCaseResults(input: unknown): Promise<ActionResult<CaseResultsSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const refused = await whileInReview(input);
  if (refused !== null) return refused;
  const saved = await material.saveCaseResults(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * The case's Testimonial from the configurator (Story 4.3d): input `{ caseId, quote, author }`
 * as `saveCaseTestimonial` takes it. Same refusals as `saveCaseResults` here.
 */
export async function saveCaseTestimonial(input: unknown): Promise<ActionResult<CaseTestimonialSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const refused = await whileInReview(input);
  if (refused !== null) return refused;
  const saved = await material.saveCaseTestimonial(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * The render assets of files the Media tab listed after the page loaded (Story 4.5b): input
 * `{ caseId, assetIds }`; returns, by asset id, those that are this case's live images and
 * videos with a rendition ready (an id that isn't, or whose rendition is still being made,
 * is left out, so the caller asks again later; so is one whose rendition can't be read,
 * without failing the others). Story 4.5c-2: an id may also be a live image or video of this
 * case's client, read from the client renditions in the same way; a file of any other
 * client is left out. 403 `FORBIDDEN` unless the role may `edit`; 400 `INVALID_INPUT`.
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
  for (const file of files) wanted.delete(file.id.toLowerCase());
  // What's left may be the client's: only files of this case's client, read from the client renditions.
  const ofClient = wanted.size === 0 ? {} : await clientAssetsOf(caseId, wanted);
  return { ok: true, value: Object.assign({}, ...each, ofClient) };
}

/** The render assets of `wanted` among the live images and videos of `caseId`'s client; none when either can't be read. */
async function clientAssetsOf(caseId: unknown, wanted: ReadonlySet<string>): Promise<Record<string, RenderAsset>> {
  const found = await caseStudy.get(caseId);
  if (!found.ok) return {};
  const listed = await caseStudy.listClientMaterial({ clientId: found.value.client.id });
  if (!listed.ok) return {};
  const files = clientMediaFiles(listed.value).filter((file) => wanted.has(file.id.toLowerCase()));
  return clientRenderAssetsOf(files, (assetId, spec) => material.getClientRendition(assetId, spec));
}
