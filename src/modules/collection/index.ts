// Public surface of the collection module (Story 5.10a). Code outside this module imports only
// this file. The module owns `collection`, `collection_item`, `collection_tag` and
// `collection_event` (AD-1): nobody else writes them. It reaches cases only through the
// case-study module's index, and never copies a case: a collection holds case ids, resolved to
// each case's live approved revision at every read.
import type { Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { createSupabaseCollectionRepository } from "@/modules/collection/adapters/supabase/collection-repository";
import { makeCollectionUseCases, type CollectionDetail, type CollectionSummary } from "@/modules/collection/application/collections";
import type { CollectionTags, CollectionWrite } from "@/modules/collection/domain/collection";
import type { Result } from "@/shared/result";

export {
  COLLECTION_ITEMS_MAX,
  COLLECTION_NAME_MAX,
  COLLECTION_TAG_KINDS,
  groupsOf,
} from "@/modules/collection/domain/collection";
export type { CollectionTagKind, CollectionTags, CollectionWrite, ItemGroup } from "@/modules/collection/domain/collection";
export type { CollectionDetail, CollectionItem, CollectionSummary } from "@/modules/collection/application/collections";

const collectionUseCases = () =>
  makeCollectionUseCases({
    collections: createSupabaseCollectionRepository(),
    listCases: () => caseStudy.list({}),
    liveRevision: (caseId) => caseStudy.getLiveRevision({ kind: "case", id: caseId }),
    businessLines: caseStudy.BUSINESS_LINES,
  });

/**
 * Creates a collection: input `{ name, businessLines, industries, caseIds }` (name trimmed,
 * 1–120 characters; at least one business line from `BUSINESS_LINES` and one industry, a
 * `client_sector` key; 1–200 approved, non-deleted cases, each once, in the order they were
 * selected). Saved in that order with each client's cases gathered where its first selected case
 * was, with one `collection_created` event. Returns `{ collectionId, version, caseIds }`. Call
 * only after `authorize(actor, 'manage collections')`. `INVALID_INPUT` (naming the field),
 * `CASE_NOT_COLLECTABLE`; nothing is written on any error.
 */
export function createCollection(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
  return collectionUseCases().create(actor, input);
}

/**
 * Every live collection, newest update first: name, tags, the number of its cases not deleted,
 * who created it, and when it changed. Call only after `authorize(actor, 'manage collections')`.
 */
export function listCollections(): Promise<Result<CollectionSummary[]>> {
  return collectionUseCases().list();
}

/**
 * One live collection with its cases in order, each resolved now to its current record and live
 * approved revision (`revision: null` when it has none any more: "Non disponibile"); a deleted
 * case is left out. Never a working or superseded revision. Call only after
 * `authorize(actor, 'manage collections')`. `COLLECTION_NOT_FOUND` for an unknown, malformed or
 * deleted id.
 */
export function getCollection(collectionId: unknown): Promise<Result<CollectionDetail>> {
  return collectionUseCases().get(collectionId);
}

/**
 * Renames a collection: input `{ collectionId, expectedVersion, name }`, a compare-and-set on its
 * version. Returns `{ collectionId, version, name }`. Call only after `authorize(actor, 'manage
 * collections')`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
 */
export function renameCollection(actor: Actor, input: unknown): Promise<Result<{ collectionId: string; version: number; name: string }>> {
  return collectionUseCases().rename(actor, input);
}

/**
 * Replaces a collection's tags: input `{ collectionId, expectedVersion, businessLines,
 * industries }`, at least one of each; a compare-and-set on its version. Call only after
 * `authorize(actor, 'manage collections')`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
 */
export function retagCollection(actor: Actor, input: unknown): Promise<Result<{ collectionId: string; version: number; tags: CollectionTags }>> {
  return collectionUseCases().retag(actor, input);
}

/**
 * Soft-deletes a collection: input `{ collectionId }`. It leaves every list and read. Call only
 * after `authorize(actor, 'manage collections')`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`.
 */
export function deleteCollection(actor: Actor, input: unknown): Promise<Result<void>> {
  return collectionUseCases().remove(actor, input);
}

/**
 * Adds cases to a collection: input `{ collectionId, expectedVersion, caseIds }`; each joins the
 * end of its client's group, or a new group at the end. A compare-and-set on the version. Call
 * only after `authorize(actor, 'manage collections')`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`,
 * `STALE_COLLECTION`, `CASE_NOT_COLLECTABLE`, `COLLECTION_FULL`.
 */
export function addCollectionItems(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
  return collectionUseCases().addItems(actor, input);
}

/**
 * Removes cases from a collection: input `{ collectionId, expectedVersion, caseIds }`. The last
 * case stays (`COLLECTION_LAST_ITEM`). A compare-and-set on the version. Call only after
 * `authorize(actor, 'manage collections')`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
 */
export function removeCollectionItems(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
  return collectionUseCases().removeItems(actor, input);
}

/**
 * Moves a client's whole group: input `{ collectionId, expectedVersion, clientId, to }`. A
 * compare-and-set on the version. Call only after `authorize(actor, 'manage collections')`.
 * `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
 */
export function moveCollectionGroup(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
  return collectionUseCases().moveGroup(actor, input);
}

/**
 * Moves one case within its client's group: input `{ collectionId, expectedVersion, caseId, to }`.
 * A compare-and-set on the version. Call only after `authorize(actor, 'manage collections')`.
 * `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
 */
export function moveCollectionItem(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
  return collectionUseCases().moveItem(actor, input);
}
