"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { CaseStudy } from "@/modules/case-study";
import { generateInputHash } from "@/modules/generation";
import * as jobs from "@/modules/jobs";
import * as material from "@/modules/material";
import type {
  Asset,
  CaseResultsSaved,
  CaseTestimonialSaved,
  DetailsFieldSaved,
  DetailsForm,
  ListedAsset,
  PresignedAssetUpload,
} from "@/modules/material";

/**
 * Creates a case study (status `draft`, permanent id, readable code such as
 * `LUM-2026-01`) with its `case_created` event. Input: `{ name, clientId, year, locale?, businessLines? }`.
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
 * Saves a draft's name, year, locale and business line (wizard step 1, Story 2.17).
 * Input: `{ caseId, name, clientId, year, locale, businessLines }`; a client or year change renumbers the draft.
 * 403 `FORBIDDEN` when the actor's role may not `create case`; 400 `INVALID_INPUT`
 * names each field; 404 `NOT_FOUND`; 409 `STALE_STATUS` once the case is no longer a
 * draft. Nothing is written on any error.
 */
export async function updateCaseStudyDetails(input: unknown): Promise<ActionResult<CaseStudy>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "create case");
  if (!decision.ok) return failure(decision.error);
  const updated = await caseStudy.updateDetails(actor.value, input);
  return updated.ok ? updated : failure(updated.error);
}

/**
 * Deletes a draft (Story 4.1, **Elimina bozza**) or an approved case (Story 5.2,
 * **Elimina**): input `{ caseId, status }`, `status` being the one the person confirmed
 * (`draft` or `approved`). The case is soft-deleted with a `case_deleted` event and
 * disappears from every list. 400 `INVALID_INPUT` (a missing or other status included);
 * 403 `FORBIDDEN` unless the role may `delete case` in that status; 404 `NOT_FOUND`
 * (unknown or already deleted); 409 `CASE_NOT_DELETABLE` once the case is no longer in
 * that status (checked in the same transaction as the delete). Nothing is written on any error.
 */
export async function deleteCaseStudy(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  // The status the person confirmed is what gets authorized; anything but `approved` is
  // authorized as a draft, and the use case rejects a missing or other status as INVALID_INPUT.
  const stated = typeof input === "object" && input !== null && "status" in input ? input.status : undefined;
  const decision = authorize(actor.value, "delete case", { status: stated === "approved" ? "approved" : "draft" });
  if (!decision.ok) return failure(decision.error);
  const deleted = await caseStudy.deleteCaseStudy(actor.value, input);
  return deleted.ok ? deleted : failure(deleted.error);
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
 * Saves one details-form field: `{ caseId, field: 'context' | 'solution', text }`
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
 * Replaces a case's Risultati (Story 2.21): `{ caseId, results: [{ label, value }] }`, at
 * most 3 filled rows (label ≤ 80, value ≤ 20 characters after trimming, as for a client);
 * `[]` clears them. Saving the stored list again changes nothing. 403 `FORBIDDEN` unless
 * the role may `fill details`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`. Status never changes.
 */
export async function saveCaseResults(input: unknown): Promise<ActionResult<CaseResultsSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const saved = await material.saveCaseResults(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * Replaces a case's Testimonial (Story 2.21): `{ caseId, quote, author }` (quote ≤ 600,
 * author ≤ 120 characters after trimming; an author needs a quote; `""` and `""` clear
 * it). 403 `FORBIDDEN` unless the role may `fill details`; 400 `INVALID_INPUT`; 404
 * `NOT_FOUND`. Status never changes.
 */
export async function saveCaseTestimonial(input: unknown): Promise<ActionResult<CaseTestimonialSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const saved = await material.saveCaseTestimonial(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * The details form of a case: `{ caseId }` → `{ context, solution, results,
 * testimonialQuote, testimonialAuthor }`, each text `""` and `results` `[]` when never saved. 403 `FORBIDDEN` unless the role may `fill details`; 404 `NOT_FOUND`.
 */
export async function getDetailsForm(input: unknown): Promise<ActionResult<DetailsForm>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "fill details");
  if (!decision.ok) return failure(decision.error);
  const form = await material.getDetailsForm(input);
  return form.ok ? form : failure(form.error);
}

/**
 * Generates a draft case study (Story 3.7a): input `{ caseId }`. Re-checks the gate (at
 * least one non-deleted file), enqueues one `generate` job with the material manifest and the
 * head version, and moves the case to `generating`; the worker builds the document and moves
 * it to `in_review`. A second press with the same material returns the same job. Returns `{ jobId }`.
 * 403 `FORBIDDEN` unless the role may `generate`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`;
 * 409 `STALE_STATUS` unless the case is a draft; 409 `NO_MATERIAL` without a file (the form
 * alone is not enough; no job, no transition). Nothing is written on those errors.
 */
export async function generateCaseStudy(input: unknown): Promise<ActionResult<{ jobId: string }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "generate", { status: "draft" });
  if (!decision.ok) return failure(decision.error);

  const caseId = typeof input === "object" && input !== null ? (input as { caseId?: unknown }).caseId : undefined;
  if (typeof caseId !== "string") {
    return failure({ code: "INVALID_INPUT", message: "Invalid or missing: caseId.", details: { fields: ["caseId"] } });
  }
  const found = await caseStudy.get(caseId);
  if (!found.ok) return failure(found.error);
  if (found.value.status !== "draft") {
    return failure({ code: "STALE_STATUS", message: "Only a draft can be generated.", details: { status: found.value.status } });
  }
  const gate = await material.hasMaterial(found.value.id);
  if (!gate.ok) return failure(gate.error);
  if (!gate.value) return failure({ code: "NO_MATERIAL", message: "The case has no material to generate from." });

  const manifest = await material.buildManifest(found.value.id);
  if (!manifest.ok) return failure(manifest.error);
  const baseHeadVersion = found.value.headVersion;
  const enqueued = await jobs.enqueue({
    kind: "generate",
    subjectId: found.value.id,
    inputHash: generateInputHash(found.value.id, baseHeadVersion, manifest.value),
    payload: { baseHeadVersion, manifest: manifest.value },
  });
  if (!enqueued.ok) return failure(enqueued.error);

  const moved = await caseStudy.transition(found.value.id, "generate", actor.value);
  if (moved.ok) return { ok: true, value: { jobId: enqueued.value.id } };
  // A double click: the other press already moved the case and the job it returned is still live.
  if (moved.error.code === "INVALID_TRANSITION" || moved.error.code === "STALE_STATUS") {
    const again = await caseStudy.get(found.value.id);
    if (again.ok && again.value.status === "generating" && ["queued", "running"].includes(enqueued.value.status)) {
      return { ok: true, value: { jobId: enqueued.value.id } };
    }
  }
  return failure(moved.error);
}
