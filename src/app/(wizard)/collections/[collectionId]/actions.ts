"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as collection from "@/modules/collection";

// Story 5.10a: one collection's Pagine panel and top bar. Every change is a compare-and-set on
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
