// Public surface of the material module. Code outside this module imports only this file.
// The module owns `asset` and S3 `cases/{caseId}/assets/**` (AD-11): nobody else writes them.
import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { createS3ObjectStorage } from "@/modules/material/adapters/s3/object-storage";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { makeConfirmUpload } from "@/modules/material/application/confirm-upload";
import type { MaterialDeps } from "@/modules/material/application/deps";
import { makePresignUpload, type PresignedAssetUpload } from "@/modules/material/application/presign-upload";
import { makeRemoveAsset } from "@/modules/material/application/remove-asset";
import { makeRestoreAsset } from "@/modules/material/application/restore-asset";
import type { Asset } from "@/modules/material/domain/asset";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import { getStorageConfig } from "@/shared/env";
import type { Result } from "@/shared/result";

export { ASSET_REMOVED, ASSET_RESTORED, ASSET_UPLOADED } from "@/modules/material/domain/asset";
export type { Asset } from "@/modules/material/domain/asset";
export {
  ALLOWED_CONTENT_TYPES,
  ASSET_KINDS,
  MAX_ASSETS_PER_CASE,
  MAX_FILE_BYTES,
} from "@/modules/material/domain/files";
export type { AllowedContentType, AssetKind } from "@/modules/material/domain/files";
export type { PresignedAssetUpload } from "@/modules/material/application/presign-upload";

/** One S3 adapter (and client) per resolved bucket/region, reused across requests. */
let storageMemo: { key: string; storage: ObjectStorage } | undefined;

function configuredStorage(): ObjectStorage | null {
  const config = getStorageConfig();
  if (config === null) return null;
  const key = `${config.bucket}/${config.region}`;
  if (storageMemo?.key !== key) storageMemo = { key, storage: createS3ObjectStorage(config) };
  return storageMemo.storage;
}

function deps(): MaterialDeps {
  return {
    assets: createSupabaseAssetRepository(),
    storage: configuredStorage(),
    cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
    newId: randomUUID,
  };
}

/**
 * A presigned POST for one file: `{ assetId, url, fields }`. Input
 * `{ caseId, contentType, sizeBytes }`. Call only after `authorize(actor, 'upload')`.
 * Errors: `INVALID_INPUT`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`,
 * `FILE_LIMIT_REACHED`, `NOT_FOUND`, `STORAGE_NOT_CONFIGURED`.
 */
export function presignUpload(actor: Actor, input: unknown): Promise<Result<PresignedAssetUpload>> {
  return makePresignUpload(deps())(actor, input);
}

/**
 * Creates the asset after HEAD-checking the uploaded object, and records
 * `asset_uploaded`. Input `{ caseId, assetId, contentType, fileName }`. Call only
 * after `authorize(actor, 'upload')`. Errors: `UPLOAD_NOT_FOUND`, `UPLOAD_REJECTED`,
 * `FILE_LIMIT_REACHED`, `ASSET_ALREADY_CONFIRMED`, `NOT_FOUND`, `STORAGE_NOT_CONFIGURED`.
 */
export function confirmUpload(actor: Actor, input: unknown): Promise<Result<Asset>> {
  return makeConfirmUpload(deps())(actor, input);
}

/** Soft-deletes one asset (`{ caseId, assetId }`) and records `asset_removed`. Authorize `upload` first. */
export function removeAsset(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRemoveAsset(deps())(actor, input);
}

/** Restores one removed asset (`{ caseId, assetId }`) and records `asset_restored`. Authorize `upload` first. */
export function restoreAsset(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRestoreAsset(deps())(actor, input);
}
