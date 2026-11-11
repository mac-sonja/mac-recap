"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as collection from "@/modules/collection";
import * as rendering from "@/modules/rendering/server";
import type { ExportTicket } from "@/modules/rendering/server";

// Story 5.10a: one collection's Pagine panel and top bar; 5.11a: its own text edits, hidden
// pages and page orders. Every change is a compare-and-set on
// the collection's `version` (`expectedVersion`); a stale one is 409 `STALE_COLLECTION` and
// writes nothing. Every role may manage every collection (`manage collections`).

/**
 * Moves a client's whole group: input `{ collectionId, expectedVersion, clientId, to }`. Returns
 * `{ collectionId, version, caseIds }`. 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404
 * `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`.
 */
export async function moveCollectionGroup(input: unknown): Promise<ActionResult<collection.CollectionWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.moveCollectionGroup(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * Moves one case within its client's group: input `{ collectionId, expectedVersion, caseId, to }`.
 * 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`.
 */
export async function moveCollectionItem(input: unknown): Promise<ActionResult<collection.CollectionWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.moveCollectionItem(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * **Aggiungi casi**: input `{ collectionId, expectedVersion, caseIds }`. 403 `FORBIDDEN`; 400
 * `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`, `CASE_NOT_COLLECTABLE`,
 * `COLLECTION_FULL`.
 */
export async function addCollectionItems(input: unknown): Promise<ActionResult<collection.CollectionWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.addCollectionItems(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * **Rimuovi dalla raccolta**: input `{ collectionId, expectedVersion, caseIds }`. 403
 * `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`,
 * `COLLECTION_LAST_ITEM` (a collection keeps at least one case).
 */
export async function removeCollectionItems(input: unknown): Promise<ActionResult<collection.CollectionWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.removeCollectionItems(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * The top bar's tags: input `{ collectionId, expectedVersion, businessLines, industries }`.
 * 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`.
 */
export async function retagCollection(input: unknown): Promise<ActionResult<{ collectionId: string; version: number; tags: collection.CollectionTags }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.retagCollection(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * Story 5.11a, double-click a free text and type: the collection's own words, stored in the
 * collection only (no revision, client or intro is written). Input `{ collectionId,
 * expectedVersion, part: { kind, id }, formatId, pageKey, elementId, text }`. Every role. 403
 * `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`,
 * `TEXT_NOT_EDITABLE`.
 */
export async function setCollectionText(input: unknown): Promise<ActionResult<collection.CollectionEditWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.setCollectionText(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * Story 5.11a, **Ripristina testo originale** / **Usa originale**: input `{ collectionId,
 * expectedVersion, part, formatId, pageKey, elementId }`. 403 `FORBIDDEN`; 400 `INVALID_INPUT`;
 * 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`.
 */
export async function restoreCollectionText(input: unknown): Promise<ActionResult<collection.CollectionEditWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.restoreCollectionText(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * Story 5.11a, **Elimina dalla raccolta** (`hidden: true`) and **Ripristina** on a page: input
 * `{ collectionId, expectedVersion, part, formatId, pageKey, hidden }`. 403 `FORBIDDEN`; 400
 * `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`, `COLLECTION_LAST_PAGE`.
 */
export async function setCollectionPageHidden(input: unknown): Promise<ActionResult<collection.CollectionEditWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.setCollectionPageHidden(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * Story 5.11a, a part's pages moved: input `{ collectionId, expectedVersion, part, formatId,
 * pageKeys }`. 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`.
 */
export async function setCollectionPageOrder(input: unknown): Promise<ActionResult<collection.CollectionEditWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const done = await collection.setCollectionPageOrder(actor.value, input);
  return done.ok ? { ok: true, value: done.value } : failure(done.error);
}

/**
 * **Esporta** on a collection (Story 5.10b): input `{ collectionId, formats }`. Builds the
 * collection's file from live approved revisions, per client group in its order (a client's
 * approved intro and closing wrap its cases only with 2 or more of them; a "Non disponibile" case
 * is left out); when the same file was exported before, returns `{ status: "ready", url,
 * fileName }` at once (with a `collection_exported` event), otherwise enqueues an `export` job and
 * returns `{ status: "pending", jobId }`. Web requests never render. Every role (`manage
 * collections`, owner 2026-11-10: admin included). 403 `FORBIDDEN`; 400 `INVALID_INPUT`,
 * `FORMAT_NOT_EXPORTABLE`, `FORMAT_NOT_IN_REVISION`; 404 `COLLECTION_NOT_FOUND`; 409
 * `NOT_APPROVED` (no available case). Nothing is enqueued on any error.
 */
export async function requestCollectionExport(input: unknown): Promise<ActionResult<ExportTicket>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  // What is exported is always approved: the module checks every part has an approved revision.
  const approved = authorize(actor.value, "export", { status: "approved" });
  if (!approved.ok) return failure(approved.error);
  const requested = await rendering.requestCollection(actor.value, input);
  return requested.ok ? requested : failure(requested.error);
}

/**
 * Where a collection's **Esporta** stands (Story 5.10b), polled every 2 s: input
 * `{ collectionId, jobId }`. `pending`, `failed`, or `ready` with the signed link (and a
 * `collection_exported` event). 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`,
 * `COLLECTION_NOT_FOUND`; 409 `NOT_APPROVED`, `EXPORT_STALE` (the collection changed since).
 */
export async function getCollectionExportStatus(input: unknown): Promise<ActionResult<ExportTicket>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const approved = authorize(actor.value, "export", { status: "approved" });
  if (!approved.ok) return failure(approved.error);
  const status = await rendering.collectionStatus(actor.value, input);
  return status.ok ? status : failure(status.error);
}
