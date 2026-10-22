"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type {
  Client,
  ClientBriefFieldSaved,
  ClientDeleted,
  ClientResultsSaved,
  ClientTestimonialSaved,
  ListedClientAsset,
  PresignedClientLogoUpload,
  PresignedClientMaterial,
} from "@/modules/case-study";

// Clients are added, edited and deleted (owner, 2026-10-19: clients can be deleted
// (soft), with their cases).
// Every action resolves the actor and authorizes `manage clients` before the use case runs.

/**
 * Adds a client with an automatic code: input `{ name, industries, description }`,
 * all required. 403 `FORBIDDEN` unless the role may `manage clients`; 400
 * `INVALID_INPUT` / `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG` naming the
 * fields; 409 `CLIENT_NAME_TAKEN` / `CLIENT_CODE_EXHAUSTED`. Nothing is written on any error.
 */
export async function createClient(input: unknown): Promise<ActionResult<Client>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const created = await caseStudy.createClient(actor.value, input);
  return created.ok ? created : failure(created.error);
}

/**
 * Edits a client: input `{ clientId, name, industries, description, logoId }`, all
 * required; its code never changes. 403 `FORBIDDEN` unless the role may `manage
 * clients`; 400 `INVALID_INPUT` / `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG` /
 * `CLIENT_LOGO_INVALID`; 404
 * `CLIENT_NOT_FOUND`; 409 `CLIENT_NAME_TAKEN`. Nothing is written on any error.
 */
export async function updateClient(input: unknown): Promise<ActionResult<Client>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const updated = await caseStudy.updateClient(actor.value, input);
  return updated.ok ? updated : failure(updated.error);
}

/**
 * Deletes a client and all its case histories, approved ones included: input
 * `{ clientId, confirmName }`, where `confirmName` is the name the person typed. 403
 * `FORBIDDEN` unless the role may `manage clients`; 400 `INVALID_INPUT` /
 * `CLIENT_DELETE_NAME_MISMATCH`; 404 `CLIENT_NOT_FOUND` (unknown or already deleted).
 * Nothing is written on any error.
 */
export async function deleteClient(input: unknown): Promise<ActionResult<ClientDeleted>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const deleted = await caseStudy.deleteClient(actor.value, input);
  return deleted.ok ? deleted : failure(deleted.error);
}

/**
 * Saves one brief text: input `{ clientId, field, text }` (context or solution; at
 * most 5000 characters after trimming). 403 `FORBIDDEN` unless the role
 * may `manage clients`; 400 `INVALID_INPUT` / `UNKNOWN_FIELD` /
 * `CLIENT_FIELD_TOO_LONG`; 404 `CLIENT_NOT_FOUND`. Nothing is written on any error.
 */
export async function saveClientBriefField(input: unknown): Promise<ActionResult<ClientBriefFieldSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveClientBriefField(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * Replaces a client's results: input `{ clientId, results: [{ label, value }] }`, at
 * most 3 filled rows (label ≤ 80, value ≤ 20 characters after trimming); `[]` clears
 * them. 403 `FORBIDDEN` unless the role may `manage clients`; 400 `INVALID_INPUT` /
 * `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG`; 404 `CLIENT_NOT_FOUND`. Nothing is
 * written on any error.
 */
export async function saveClientResults(input: unknown): Promise<ActionResult<ClientResultsSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveClientResults(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * Replaces a client's testimonial: input `{ clientId, quote, author }` (quote ≤ 600,
 * author ≤ 120 characters after trimming; an author needs a quote; `""` and `""` clear
 * it). 403 `FORBIDDEN` unless the role may `manage clients`; 400 `INVALID_INPUT` /
 * `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG`; 404 `CLIENT_NOT_FOUND`. Nothing is
 * written on any error.
 */
export async function saveClientTestimonial(input: unknown): Promise<ActionResult<ClientTestimonialSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveClientTestimonial(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * A signed upload for a new logo: input `{ clientId, contentType, sizeBytes }`.
 * 403 `FORBIDDEN` unless the role may `manage clients`; 400 `CLIENT_LOGO_INVALID`
 * (not PNG, JPEG, WebP or SVG, or not 1 B–5 MB); 404 `CLIENT_NOT_FOUND`. Nothing is written.
 */
export async function requestClientLogoUpload(input: unknown): Promise<ActionResult<PresignedClientLogoUpload>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const presigned = await caseStudy.requestClientLogoUpload(actor.value, input);
  return presigned.ok ? presigned : failure(presigned.error);
}

/**
 * Records an uploaded logo after the server re-checks it: input `{ clientId, logoId,
 * contentType }`; returns `{ logoId }` for `updateClient`. 403 `FORBIDDEN` unless the
 * role may `manage clients`; 400 `CLIENT_LOGO_INVALID` (no row written); 404 `CLIENT_NOT_FOUND`.
 */
export async function confirmClientLogoUpload(input: unknown): Promise<ActionResult<{ logoId: string }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const confirmed = await caseStudy.confirmClientLogoUpload(actor.value, input);
  return confirmed.ok ? confirmed : failure(confirmed.error);
}

/**
 * A signed upload for one client file: input `{ clientId, contentType, sizeBytes }`.
 * 403 `FORBIDDEN` unless the role may `manage clients`; 400 `FILE_TYPE_NOT_ALLOWED` /
 * `FILE_TOO_LARGE`; 404 `CLIENT_NOT_FOUND`; 409 `CLIENT_MATERIAL_LIMIT` (3 files
 * already). Nothing is written.
 */
export async function requestClientMaterialUpload(input: unknown): Promise<ActionResult<PresignedClientMaterial>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const presigned = await caseStudy.requestClientMaterialUpload(actor.value, input);
  return presigned.ok ? presigned : failure(presigned.error);
}

/**
 * Records an uploaded client file after the server re-checks it (type, size, and an
 * image's pixels): input `{ clientId, assetId, contentType }`. 403 `FORBIDDEN` unless
 * the role may `manage clients`; 400 `UPLOAD_REJECTED` / `FILE_TYPE_NOT_ALLOWED`;
 * 404 `CLIENT_NOT_FOUND` / `UPLOAD_NOT_FOUND`; 409 `CLIENT_MATERIAL_LIMIT`. No row is
 * written on any error.
 */
export async function confirmClientMaterialUpload(input: unknown): Promise<ActionResult<ListedClientAsset>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const confirmed = await caseStudy.confirmClientMaterialUpload(actor.value, input);
  return confirmed.ok ? confirmed : failure(confirmed.error);
}

/**
 * A client's files, in position order, images with a thumbnail URL: input
 * `{ clientId }`. 403 `FORBIDDEN` unless the role may `manage clients`; 404
 * `CLIENT_NOT_FOUND`. Reads only.
 */
export async function listClientMaterial(input: unknown): Promise<ActionResult<ListedClientAsset[]>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const listed = await caseStudy.listClientMaterial(input);
  return listed.ok ? listed : failure(listed.error);
}

/**
 * Removes one client file at once, row and object, with no undo: input
 * `{ clientId, assetId }`. 403 `FORBIDDEN` unless the role may `manage clients`; 404
 * `NOT_FOUND` (unknown file, or another client's). A failed object delete is only logged.
 */
export async function removeClientMaterial(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const removed = await caseStudy.removeClientMaterial(actor.value, input);
  return removed.ok ? removed : failure(removed.error);
}
