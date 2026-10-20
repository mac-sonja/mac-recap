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
  /** Non-deleted assets of the case, oldest first (then by id); `err` only when the read fails. */
  listLive(caseId: string): Promise<Result<Asset[]>>;
  /** Non-deleted assets of the case; `err` only when the read fails. */
  countLive(caseId: string): Promise<Result<number>>;
  /**
   * Inserts the asset under a per-case lock that re-checks the cap. `err
   * FILE_LIMIT_REACHED` (cap reached), `NOT_FOUND` (case unknown or soft-deleted),
   * `ASSET_ALREADY_CONFIRMED` (this asset id exists); nothing is written on any `err`.
   */
  create(asset: NewAsset): Promise<Result<Asset>>;
  /**
   * One non-deleted asset of the case; `ok(null)` when there is none. `err
   * ASSET_LOOKUP_FAILED` when the read fails, `ASSET_INVALID` when the row fails validation.
   */
  get(caseId: string, assetId: string): Promise<Result<Asset | null>>;
  /**
   * One asset by id, soft-deleted or not (check `deletedAt`); `ok(null)` when
   * there is none. `err ASSET_LOOKUP_FAILED` / `ASSET_INVALID` as `get`.
   */
  getById(assetId: string): Promise<Result<Asset | null>>;
  /**
   * One page of the live images and videos of live cases, by id: at most
   * `limit` assets with an id after `afterId` (all from the start when null).
   * Dev tooling only (the renditions backfill). `err ASSET_LOOKUP_FAILED`.
   */
  listLiveMediaPage(afterId: string | null, limit: number): Promise<Result<Asset[]>>;
  /**
   * Compare-and-set: sets `is_favourite = value` on a live asset of the case only
   * where it is currently `!value`. `ok(true)` when a row changed, `ok(false)` when
   * none did (no such live asset, or it already holds `value`). Only images and
   * videos can be favourites (the DB check rejects others: `err ASSET_WRITE_FAILED`).
   */
  setFavourite(caseId: string, assetId: string, value: boolean): Promise<Result<boolean>>;
  /** Sets `deleted_at` on a live asset of the case; `ok(false)` when there is none. */
  softDelete(caseId: string, assetId: string): Promise<Result<boolean>>;
  /**
   * Compensation only: undoes `softDelete` when its `asset_removed` event could
   * not be written (no feature restores a removed file). Clears `deleted_at`
   * under the same lock as `create`: `ok(true)` undone, `ok(false)` it was
   * already live (nothing written). `err NOT_FOUND` (no such asset in the case),
   * `FILE_LIMIT_REACHED` (cap reached).
   */
  undoSoftDelete(caseId: string, assetId: string): Promise<Result<boolean>>;
  /**
   * True when the case exists, is not soft-deleted and has at least one
   * non-deleted asset (the details form never counts). `err MATERIAL_LOOKUP_FAILED`
   * only when the check fails.
   */
  hasMaterial(caseId: string): Promise<Result<boolean>>;
}
