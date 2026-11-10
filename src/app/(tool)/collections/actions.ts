"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as collection from "@/modules/collection";

// Story 5.10a: collections from the library and the Raccolte list. Every role may manage every
// collection (`manage collections`, owner 2026-11-10); each action resolves the actor and
// authorizes it before the use case runs.

/**
 * **Crea raccolta** in the library: input `{ name, businessLines, industries, caseIds }`, the
 * selected cases in the order they were selected. Returns `{ collectionId, version, caseIds }`.
 * 403 `FORBIDDEN` unless the role may `manage collections`; 400 `INVALID_INPUT` (with the failing
 * `fields`); 409 `CASE_NOT_COLLECTABLE`. Nothing is written on any error.
 */
export async function createCollection(input: unknown): Promise<ActionResult<collection.CollectionWrite>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const created = await collection.createCollection(actor.value, input);
  return created.ok ? { ok: true, value: created.value } : failure(created.error);
}

/**
 * **Rinomina** on the Raccolte list: input `{ collectionId, expectedVersion, name }`. Returns
 * `{ collectionId, version, name }`. 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404
 * `COLLECTION_NOT_FOUND`; 409 `STALE_COLLECTION`.
 */
export async function renameCollection(input: unknown): Promise<ActionResult<{ collectionId: string; version: number; name: string }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const renamed = await collection.renameCollection(actor.value, input);
  return renamed.ok ? { ok: true, value: renamed.value } : failure(renamed.error);
}

/**
 * **Elimina** on the Raccolte list, after its confirmation: input `{ collectionId }`, a soft
 * delete. 403 `FORBIDDEN`; 400 `INVALID_INPUT`; 404 `COLLECTION_NOT_FOUND`.
 */
export async function deleteCollection(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage collections");
  if (!decision.ok) return failure(decision.error);
  const deleted = await collection.deleteCollection(actor.value, input);
  return deleted.ok ? { ok: true, value: undefined } : failure(deleted.error);
}
