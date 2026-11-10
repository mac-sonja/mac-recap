import type { CollectionTags, StoredCollection } from "@/modules/collection/domain/collection";
import type { Result } from "@/shared/result";

/**
 * Reads and writes `collection`, `collection_item`, `collection_tag` and `collection_event`
 * (Story 5.10a). Every write goes through a security-definer function and, but for create and
 * delete, is a compare-and-set on the collection's `version`. Implemented by
 * `adapters/supabase/collection-repository.ts`.
 */
export interface CollectionRepository {
  /** Every live (non-deleted) collection, newest update first. `err` only when the read fails. */
  list(): Promise<Result<StoredCollection[]>>;
  /** One live collection; `ok(null)` when unknown or deleted. */
  find(id: string): Promise<Result<StoredCollection | null>>;
  /**
   * Creates a collection with its tags and cases (in order). `err INVALID_INPUT` /
   * `CASE_NOT_COLLECTABLE`; nothing is written on any `err`.
   */
  create(input: { name: string; tags: CollectionTags; caseIds: readonly string[] }, actorId: string): Promise<Result<{ id: string; version: number }>>;
  /**
   * Replaces the cases (in order) if the version is still `expectedVersion`; returns the new
   * version. `err COLLECTION_NOT_FOUND` / `STALE_COLLECTION` / `INVALID_INPUT` / `CASE_NOT_COLLECTABLE`.
   */
  setItems(
    id: string,
    expectedVersion: number,
    caseIds: readonly string[],
    actorId: string,
    event: { type: string; data: Record<string, unknown> },
  ): Promise<Result<number>>;
  /** Renames it if the version is still `expectedVersion`; returns the new version. */
  rename(id: string, expectedVersion: number, name: string, actorId: string): Promise<Result<number>>;
  /** Replaces its tags if the version is still `expectedVersion`; returns the new version. */
  setTags(id: string, expectedVersion: number, tags: CollectionTags, actorId: string): Promise<Result<number>>;
  /** Soft-deletes it. `err COLLECTION_NOT_FOUND` when unknown or already deleted. */
  softDelete(id: string, actorId: string): Promise<Result<void>>;
}
