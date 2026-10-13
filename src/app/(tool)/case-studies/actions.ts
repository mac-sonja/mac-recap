"use server";

import { authorize, getActor, httpStatusFor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { CaseStudy } from "@/modules/case-study";
import * as material from "@/modules/material";
import type {
  Asset,
  DeliverableTerms,
  DetailsFieldSaved,
  DetailsForm,
  PresignedAssetUpload,
  TermsByKind,
  TermsSet,
  TextItem,
} from "@/modules/material";
import type { AppError } from "@/shared/result";

/**
 * What a server action returns to the client: the value, or the HTTP-style
 * status with `{ error: { code, message } }`. `details` stays server-side;
 * only an `INVALID_INPUT` adds the names of the failing fields.
 */
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: { code: string; message: string; fields?: string[] } };

function failure(error: AppError): ActionResult<never> {
  const { code, message } = error;
  const fields =
    code === "INVALID_INPUT" && error.details && typeof error.details === "object" && "fields" in error.details
      ? (error.details as { fields: string[] }).fields
      : undefined;
  return { ok: false, status: httpStatusFor(error), error: fields ? { code, message, fields } : { code, message } };
}

/**
 * Creates a case study (status `draft`, permanent id) with its `case_created`
 * event. Input: `{ name, client, year, locale? }`. 403 `FORBIDDEN` when the
 * actor's role may not `create case`; 400 `INVALID_INPUT` names each field.
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
 * A presigned POST for one project file: `{ assetId, url, fields }`; the browser
 * posts `fields` plus the file straight to S3. Input `{ caseId, contentType, sizeBytes }`.
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

/** Removes (soft-deletes) one asset: `{ caseId, assetId }`. 404 `NOT_FOUND` when unknown or already removed. */
export async function removeAsset(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const removed = await material.removeAsset(actor.value, input);
  return removed.ok ? removed : failure(removed.error);
}

/** Restores one removed asset (Undo): `{ caseId, assetId }`. 409 `FILE_LIMIT_REACHED` at the cap. */
export async function restoreAsset(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const restored = await material.restoreAsset(actor.value, input);
  return restored.ok ? restored : failure(restored.error);
}

/**
 * Adds pasted text as material: `{ caseId, title, body }`. Never counts toward
 * the file cap. 400 `TEXT_EMPTY` for a whitespace-only body; 400 `INVALID_INPUT`
 * naming `title` / `body`; 404 `NOT_FOUND`.
 */
export async function addTextItem(input: unknown): Promise<ActionResult<TextItem>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const added = await material.addTextItem(actor.value, input);
  return added.ok ? added : failure(added.error);
}

/** Edits a live text item: `{ caseId, textItemId, title, body }`. 404 `NOT_FOUND` when unknown or removed. */
export async function editTextItem(input: unknown): Promise<ActionResult<TextItem>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const edited = await material.editTextItem(actor.value, input);
  return edited.ok ? edited : failure(edited.error);
}

/** Removes (soft-deletes) one text item: `{ caseId, textItemId }`. 404 `NOT_FOUND` when unknown or already removed. */
export async function removeTextItem(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const removed = await material.removeTextItem(actor.value, input);
  return removed.ok ? removed : failure(removed.error);
}

/** Restores one removed text item (Undo): `{ caseId, textItemId }`. 404 `NOT_FOUND` when unknown. */
export async function restoreTextItem(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "upload");
  if (!decision.ok) return failure(decision.error);
  const restored = await material.restoreTextItem(actor.value, input);
  return restored.ok ? restored : failure(restored.error);
}

/**
 * Every taxonomy term, `{ tag, property, flag }`, each `[{ key, label }]` ordered
 * by label; an unseeded kind is `[]`. 403 `FORBIDDEN` unless the role may `tag`.
 */
export async function listTaxonomyTerms(): Promise<ActionResult<TermsByKind>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "tag");
  if (!decision.ok) return failure(decision.error);
  const terms = await material.listTerms();
  return terms.ok ? terms : failure(terms.error);
}

/**
 * Replaces one deliverable's terms of one kind: `{ caseId, refKind: 'asset' | 'text',
 * refId, kind: 'tag' | 'property' | 'flag', keys }` (`[]` clears that kind).
 * 400 `UNKNOWN_TERM` naming the key; 404 `NOT_FOUND` for a removed or unknown
 * deliverable or another case's; 400 `INVALID_INPUT`. Status never changes.
 */
export async function setDeliverableTerms(input: unknown): Promise<ActionResult<TermsSet>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "tag");
  if (!decision.ok) return failure(decision.error);
  const set = await material.setDeliverableTerms(actor.value, input);
  return set.ok ? set : failure(set.error);
}

/**
 * The term keys of every live deliverable of a case: `{ caseId }` →
 * `[{ refKind, refId, tag, property, flag }]` (untagged: all `[]`). 404 `NOT_FOUND`.
 */
export async function getCaseTerms(input: unknown): Promise<ActionResult<DeliverableTerms[]>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "tag");
  if (!decision.ok) return failure(decision.error);
  const terms = await material.getCaseTerms(input);
  return terms.ok ? terms : failure(terms.error);
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
