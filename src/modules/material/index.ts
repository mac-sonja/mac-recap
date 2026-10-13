// Public surface of the material module. Code outside this module imports only this file.
// The module owns `asset`, `text_item`, `taxonomy_term`, `material_term` and S3 `cases/{caseId}/assets/**` (AD-11): nobody else writes them.
import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { createS3ObjectStorage } from "@/modules/material/adapters/s3/object-storage";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseTaxonomyRepository } from "@/modules/material/adapters/supabase/taxonomy-repository";
import { createSupabaseTextItemRepository } from "@/modules/material/adapters/supabase/text-item-repository";
import { makeAddTextItem } from "@/modules/material/application/add-text-item";
import { makeConfirmUpload } from "@/modules/material/application/confirm-upload";
import type { MaterialDeps } from "@/modules/material/application/deps";
import { makeEditTextItem } from "@/modules/material/application/edit-text-item";
import { makeGetCaseTerms } from "@/modules/material/application/get-case-terms";
import { makeHasMaterial } from "@/modules/material/application/has-material";
import { makeListTerms } from "@/modules/material/application/list-terms";
import { makePresignUpload, type PresignedAssetUpload } from "@/modules/material/application/presign-upload";
import { makeRemoveAsset } from "@/modules/material/application/remove-asset";
import { makeRemoveTextItem } from "@/modules/material/application/remove-text-item";
import { makeRestoreAsset } from "@/modules/material/application/restore-asset";
import { makeRestoreTextItem } from "@/modules/material/application/restore-text-item";
import { makeSetDeliverableTerms } from "@/modules/material/application/set-deliverable-terms";
import type { Asset } from "@/modules/material/domain/asset";
import type { DeliverableTerms, TermsByKind, TermsSet } from "@/modules/material/domain/taxonomy";
import type { TextItem } from "@/modules/material/domain/text-item";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import { getStorageConfig } from "@/shared/env";
import type { Result } from "@/shared/result";

export { ASSET_REMOVED, ASSET_RESTORED, ASSET_UPLOADED } from "@/modules/material/domain/asset";
export type { Asset } from "@/modules/material/domain/asset";
export {
  MAX_TEXT_BODY_CHARS,
  MAX_TEXT_TITLE_CHARS,
  TEXT_ADDED,
  TEXT_EDITED,
  TEXT_REMOVED,
  TEXT_RESTORED,
} from "@/modules/material/domain/text-item";
export type { TextItem } from "@/modules/material/domain/text-item";
export { DELIVERABLE_KINDS, TERM_KINDS, TERMS_SET } from "@/modules/material/domain/taxonomy";
export type {
  DeliverableKind,
  DeliverableTerms,
  Term,
  TermKind,
  TermsByKind,
  TermsSet,
} from "@/modules/material/domain/taxonomy";
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

/** Use-case dependencies. Text and taxonomy paths pass `withStorage: false`: they never resolve S3. */
function deps({ withStorage = true }: { withStorage?: boolean } = {}): MaterialDeps {
  return {
    assets: createSupabaseAssetRepository(),
    texts: createSupabaseTextItemRepository(),
    taxonomy: createSupabaseTaxonomyRepository(),
    storage: withStorage ? configuredStorage() : null,
    cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
    newId: randomUUID,
  };
}

/** Dependencies without storage, for the paths that never touch S3 (text items, taxonomy). */
const storagelessDeps = () => deps({ withStorage: false });

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

/**
 * Stores pasted text (`{ caseId, title, body }`) and records `text_added`.
 * Authorize `upload` first. Errors: `INVALID_INPUT` (naming `title` / `body`),
 * `TEXT_EMPTY`, `NOT_FOUND`. Never counts toward the file cap; needs no S3.
 */
export function addTextItem(actor: Actor, input: unknown): Promise<Result<TextItem>> {
  return makeAddTextItem(storagelessDeps())(actor, input);
}

/**
 * Replaces title and body of a live text item (`{ caseId, textItemId, title, body }`)
 * and records `text_edited`. Authorize `upload` first. Errors: `INVALID_INPUT`,
 * `TEXT_EMPTY`, `NOT_FOUND` (unknown or removed).
 */
export function editTextItem(actor: Actor, input: unknown): Promise<Result<TextItem>> {
  return makeEditTextItem(storagelessDeps())(actor, input);
}

/** Soft-deletes one text item (`{ caseId, textItemId }`) and records `text_removed`. Authorize `upload` first. */
export function removeTextItem(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRemoveTextItem(storagelessDeps())(actor, input);
}

/** Restores one removed text item (`{ caseId, textItemId }`) and records `text_restored`. Authorize `upload` first. */
export function restoreTextItem(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRestoreTextItem(storagelessDeps())(actor, input);
}

/**
 * Whether the case has material: at least one non-deleted asset or one
 * non-deleted, non-empty text item. The details form never counts. The single
 * check reused by Next: Details (Story 2.10) and the Generate gate (Epic 3).
 * Works without S3. Errors: `INVALID_INPUT` (malformed id), `MATERIAL_LOOKUP_FAILED`.
 */
export function hasMaterial(caseId: unknown): Promise<Result<boolean>> {
  return makeHasMaterial({ texts: createSupabaseTextItemRepository() })(caseId);
}

/**
 * Every taxonomy term, grouped `{ tag, property, flag }` and ordered by label;
 * a kind with nothing seeded is `[]`. Refer to terms by `key` only; labels are
 * display-only. Authorize `tag` first. Works without S3.
 */
export function listTerms(): Promise<Result<TermsByKind>> {
  return makeListTerms(storagelessDeps())();
}

/**
 * Replaces one live deliverable's terms of one kind: `{ caseId, refKind: 'asset' | 'text',
 * refId, kind: 'tag' | 'property' | 'flag', keys }` (`[]` clears it), and records
 * `terms_set { refKind, refId, kind, keys }`. Authorize `tag` first. Errors:
 * `INVALID_INPUT`, `UNKNOWN_TERM` (naming the key), `NOT_FOUND`. Status never changes; works without S3.
 */
export function setDeliverableTerms(actor: Actor, input: unknown): Promise<Result<TermsSet>> {
  return makeSetDeliverableTerms(storagelessDeps())(actor, input);
}

/**
 * The term keys of every live deliverable of a case (`{ caseId }`), each
 * `{ refKind, refId, tag, property, flag }`; untagged ones have all `[]`.
 * Authorize `tag` first. Errors: `INVALID_INPUT`, `NOT_FOUND`. Works without S3.
 */
export function getCaseTerms(input: unknown): Promise<Result<DeliverableTerms[]>> {
  return makeGetCaseTerms(storagelessDeps())(input);
}
