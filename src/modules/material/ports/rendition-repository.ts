import type { Rendition } from "@/modules/material/domain/rendition";
import type { Result } from "@/shared/result";

export type NewRendition = Omit<Rendition, "createdAt">;

/** Reads and writes `rendition`. Implemented by `adapters/supabase/rendition-repository.ts`. */
export interface RenditionRepository {
  /** Every rendition of the asset; `err RENDITION_LOOKUP_FAILED` when the read fails. */
  listForAsset(assetId: string): Promise<Result<Rendition[]>>;
  /** The renditions of these assets with one of these spec hashes, in one read. */
  listFor(assetIds: readonly string[], specHashes: readonly string[]): Promise<Result<Rendition[]>>;
  /** One rendition; `ok(null)` when it was not made yet. */
  get(assetId: string, specHash: string): Promise<Result<Rendition | null>>;
  /**
   * Records the rendition, replacing the row of the same (asset, spec hash).
   * Worker only. `err RENDITION_WRITE_FAILED` on failure.
   */
  upsert(rendition: NewRendition): Promise<Result<Rendition>>;
}
