import type { Asset } from "@/modules/material/domain/asset";
import type { AllowedContentType, AssetKind } from "@/modules/material/domain/files";
import type { Result } from "@/shared/result";

export interface NewAsset {
  id: string;
  caseId: string;
  kind: AssetKind;
  originalFileName: string;
  contentType: AllowedContentType;
  sizeBytes: number;
  createdBy: string;
}

/** Reads and writes `asset`. Implemented by `adapters/supabase/asset-repository.ts`. */
export interface AssetRepository {
  /** Non-deleted assets of the case; `err` only when the read fails. */
  countLive(caseId: string): Promise<Result<number>>;
  /**
   * Inserts the asset under a per-case lock that re-checks the cap. `err
   * FILE_LIMIT_REACHED` (cap reached), `NOT_FOUND` (case unknown or soft-deleted),
   * `ASSET_ALREADY_CONFIRMED` (this asset id exists); nothing is written on any `err`.
   */
  create(asset: NewAsset): Promise<Result<Asset>>;
  /** Sets `deleted_at` on a live asset of the case; `ok(false)` when there is none. */
  softDelete(caseId: string, assetId: string): Promise<Result<boolean>>;
  /**
   * Clears `deleted_at` under the same lock as `create`: `ok(true)` restored,
   * `ok(false)` it was already live (nothing written). `err NOT_FOUND` (no such
   * asset in the case), `FILE_LIMIT_REACHED` (cap reached).
   */
  restore(caseId: string, assetId: string): Promise<Result<boolean>>;
}
