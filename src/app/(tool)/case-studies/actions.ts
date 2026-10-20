"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { CaseStudy } from "@/modules/case-study";
import * as material from "@/modules/material";
import type { Asset, DetailsFieldSaved, DetailsForm, ListedAsset, PresignedAssetUpload } from "@/modules/material";

/**
 * Creates a case study (status `draft`, permanent id, readable code such as
 * `LUM-2026-01`) with its `case_created` event. Input: `{ name, clientId, year, locale? }`.
 * 403 `FORBIDDEN` when the actor's role may not `create case`; 400 `INVALID_INPUT`
 * names each field; 404 `CLIENT_NOT_FOUND` for an unknown client. Nothing is
 * written on any error.
 */
export async function createCaseStudy(input: unknown): Promise<ActionResult<CaseStudy>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "create case");
  if (!decision.ok) return failure(decision.error);
  const created = await caseStudy.create(actor.value, input);
  return created.ok ? created : failure(created.error);
}

/**
 * A signed upload for one project file: `{ assetId, url, method, headers }`; the
 * browser sends the raw file straight to storage with those headers. Input `{ caseId, contentType, sizeBytes }`.
 * 403 `FORBIDDEN` unless the role may `upload`; 400 `FILE_TYPE_NOT_ALLOWED` /
 * `FILE_TOO_LARGE`; 409 `FILE_LIMIT_REACHED`; 404 `NOT_FOUND`; 503 `STORAGE_NOT_CONFIGURED`.
 */
export async function presignAssetUpload(input: unknown): Promise<ActionResult<PresignedAssetUpload>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const presigned = await material.presignUpload(actor.value, input);
  return presigned.ok ? presigned : failure(presigned.error);
}

/**
 * Confirms an upload once the browser's POST succeeded: HEAD-checks the object,
 * creates the asset and records `asset_uploaded`. Input `{ caseId, assetId,
 * contentType, fileName }`. 404 `UPLOAD_NOT_FOUND`; 400 `UPLOAD_REJECTED`;
 * 409 `FILE_LIMIT_REACHED` / `ASSET_ALREADY_CONFIRMED`.
 */
export async function confirmAssetUpload(input: unknown): Promise<ActionResult<Asset>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const confirmed = await material.confirmUpload(actor.value, input);
  return confirmed.ok ? confirmed : failure(confirmed.error);
}

/**
 * The files of a case study: `{ caseId }` → its non-deleted assets, oldest first.
 * Images and videos carry a `thumbnailUrl` valid 15 minutes (the thumbnail rendition
 * when made, else an image's original; `null` for a video without its poster) and
 * `thumbnailPending`; other kinds carry `null`. 403 `FORBIDDEN` unless the role may `upload`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`;
 * 500 for `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`, `STORAGE_FAILED`.
 */
export async function listAssets(input: unknown): Promise<ActionResult<ListedAsset[]>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const listed = await material.listAssets(input);
  return listed.ok ? listed : failure(listed.error);
}

/** Removes (soft-deletes) one asset: `{ caseId, assetId }`. 404 `NOT_FOUND` when unknown or already removed. */
export async function removeAsset(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const removed = await material.removeAsset(actor.value, input);
  return removed.ok ? removed : failure(removed.error);
}

/**
 * Marks or unmarks one image or video as favourite: `{ caseId, assetId, isFavourite }`.
 * Setting the current value again changes nothing. 403 `FORBIDDEN` unless the role
 * may `mark favourites`; 400 `INVALID_INPUT` / `NOT_FAVOURITABLE`; 404 `NOT_FOUND`;
 * 500 for `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`, `ASSET_WRITE_FAILED` and an event-write
 * failure (the flag is then put back). Status never changes.
 */
export async function setAssetFavourite(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "mark favourites");
  if (!decision.ok) return failure(decision.error);
  const updated = await material.setFavourite(actor.value, input);
  return updated.ok ? updated : failure(updated.error);
}

/**
 * Saves one details-form field: `{ caseId, field: 'context' | 'solution' | 'results', text }`
 * (`""` clears it; at most 5,000 characters). Saving the stored text again changes
 * nothing. 403 `FORBIDDEN` unless the role may `fill details`; 400 `UNKNOWN_FIELD`;
 * 400 `INVALID_INPUT` naming `text`; 404 `NOT_FOUND`. Status never changes.
 */
export async function saveDetailsField(input: unknown): Promise<ActionResult<DetailsFieldSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const saved = await material.saveDetailsField(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * The details form of a case: `{ caseId }` → `{ context, solution, results }`,
 * each `""` when never saved. 403 `FORBIDDEN` unless the role may `fill details`; 404 `NOT_FOUND`.
 */
export async function getDetailsForm(input: unknown): Promise<ActionResult<DetailsForm>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const form = await material.getDetailsForm(input);
  return form.ok ? form : failure(form.error);
}
