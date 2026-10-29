// Public surface of the material module. Code outside this module imports only this file.
// The module owns `asset` (including its favourite flag), `context_form`, `rendition` and the
// `material` storage bucket's `cases/{caseId}/assets/**` (AD-11): nobody else writes them.
// The worker-only rendition handler lives in `./worker.ts`, which this file never imports.
import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as jobs from "@/modules/jobs";
import { assetKey } from "@/modules/material/adapters/asset-key";
import { createSupabaseAssetRepository } from "@/modules/material/adapters/supabase/asset-repository";
import { createSupabaseDetailsFormRepository } from "@/modules/material/adapters/supabase/details-form-repository";
import { createSupabaseObjectStorage } from "@/modules/material/adapters/supabase/object-storage";
import { createSupabaseRenditionRepository } from "@/modules/material/adapters/supabase/rendition-repository";
import { makeBuildManifest, type MaterialManifest } from "@/modules/material/application/build-manifest";
import { makeConfirmUpload } from "@/modules/material/application/confirm-upload";
import type { MaterialDeps } from "@/modules/material/application/deps";
import { makeGetDetailsForm } from "@/modules/material/application/get-details-form";
import { makeGetRendition } from "@/modules/material/application/get-rendition";
import { makeHasMaterial } from "@/modules/material/application/has-material";
import { makeListAssets } from "@/modules/material/application/list-assets";
import {
  makeListGenerationAssets,
  makeReadAssetBytes,
  type AssetBytesVariant,
  type GenerationAsset,
} from "@/modules/material/application/read-for-generation";
import { makePresignUpload, type PresignedAssetUpload } from "@/modules/material/application/presign-upload";
import { makeRemoveAsset } from "@/modules/material/application/remove-asset";
import { makeResolveRefs } from "@/modules/material/application/resolve-refs";
import { makeSaveCaseResults } from "@/modules/material/application/save-case-results";
import { makeSaveCaseTestimonial } from "@/modules/material/application/save-case-testimonial";
import { makeSaveDetailsField } from "@/modules/material/application/save-details-field";
import { makeSetFavourite } from "@/modules/material/application/set-favourite";
import type { Asset, ListedAsset } from "@/modules/material/domain/asset";
import type {
  CaseResultsSaved,
  CaseStoryLimits,
  CaseTestimonialSaved,
  DetailsFieldSaved,
  DetailsForm,
  ResolvedRef,
} from "@/modules/material/domain/details-form";
import type { RenditionLink } from "@/modules/material/domain/rendition";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import type { Result } from "@/shared/result";

export { ASSET_FAVOURITED, ASSET_REMOVED, ASSET_UNFAVOURITED, ASSET_UPLOADED } from "@/modules/material/domain/asset";
export type { Asset, ListedAsset } from "@/modules/material/domain/asset";
export { DETAILS_SAVED, FORM_FIELDS, MATERIAL_REF_KINDS, MAX_FORM_FIELD_CHARS } from "@/modules/material/domain/details-form";
export type {
  CaseResult,
  CaseResultsSaved,
  CaseTestimonial,
  CaseTestimonialSaved,
  DetailsFieldSaved,
  DetailsForm,
  FormField,
  MaterialRef,
  MaterialRefKind,
  ResolvedRef,
} from "@/modules/material/domain/details-form";
export {
  ALLOWED_CONTENT_TYPES,
  ASSET_KINDS,
  MAX_ASSETS_PER_CASE,
  MAX_FILE_BYTES,
} from "@/modules/material/domain/files";
export type { AllowedContentType, AssetKind } from "@/modules/material/domain/files";
export { RENDITION_NOT_READY, RENDITION_SPEC_NAMES } from "@/modules/material/domain/rendition";
export type { RenditionLink, RenditionSpecName } from "@/modules/material/domain/rendition";
export type { MaterialManifest } from "@/modules/material/application/build-manifest";
export { ASSET_BYTES_VARIANTS } from "@/modules/material/application/read-for-generation";
export type { AssetBytesVariant, GenerationAsset } from "@/modules/material/application/read-for-generation";
export type { PresignedAssetUpload } from "@/modules/material/application/presign-upload";

/** One Supabase Storage adapter, built on first use and reused across requests. */
let storageMemo: ObjectStorage | undefined;

function configuredStorage(): ObjectStorage {
  storageMemo ??= createSupabaseObjectStorage();
  return storageMemo;
}

/** Use-case dependencies. Details-form paths pass `withStorage: false`: they never resolve storage. */
function deps({ withStorage = true }: { withStorage?: boolean } = {}): MaterialDeps {
  return {
    assets: createSupabaseAssetRepository(),
    renditions: createSupabaseRenditionRepository(),
    form: createSupabaseDetailsFormRepository(),
    storage: withStorage ? configuredStorage() : null,
    cases: { get: caseStudy.get, recordEvent: caseStudy.recordEvent },
    jobs: { enqueue: jobs.enqueue, liveSubjects: jobs.liveSubjects },
    newId: randomUUID,
  };
}

/** Dependencies without storage, for the paths that never touch it (details form, material refs, favourites). */
const storagelessDeps = () => deps({ withStorage: false });

/** A case's Risultati and Testimonial take the client's limits (Story 2.21): one definition, in case-study. */
const storyLimits = (): CaseStoryLimits => ({
  resultsMax: caseStudy.CLIENT_RESULTS_MAX,
  resultLabelMax: caseStudy.CLIENT_RESULT_LABEL_MAX,
  resultValueMax: caseStudy.CLIENT_RESULT_VALUE_MAX,
  testimonialQuoteMax: caseStudy.CLIENT_TESTIMONIAL_QUOTE_MAX,
  testimonialAuthorMax: caseStudy.CLIENT_TESTIMONIAL_AUTHOR_MAX,
});

/**
 * A signed upload for one file: `{ assetId, url, method: "PUT", headers }`; the
 * browser sends the raw file to `url` with those headers. Input
 * `{ caseId, contentType, sizeBytes }`. Call only after `authorize(actor, 'upload')`.
 * Errors: `INVALID_INPUT`, `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`,
 * `FILE_LIMIT_REACHED`, `NOT_FOUND`, `STORAGE_NOT_CONFIGURED`.
 */
export function presignUpload(actor: Actor, input: unknown): Promise<Result<PresignedAssetUpload>> {
  return makePresignUpload(deps())(actor, input);
}

/**
 * Creates the asset after checking the uploaded object's stored metadata, and records
 * `asset_uploaded`. Input `{ caseId, assetId, contentType, fileName }`. Call only
 * after `authorize(actor, 'upload')`. An image or video also gets a `rendition`
 * job (a failed enqueue is only logged). Errors: `UPLOAD_NOT_FOUND`, `UPLOAD_REJECTED`,
 * `FILE_LIMIT_REACHED`, `ASSET_ALREADY_CONFIRMED`, `NOT_FOUND`, `STORAGE_NOT_CONFIGURED`.
 */
export function confirmUpload(actor: Actor, input: unknown): Promise<Result<Asset>> {
  return makeConfirmUpload(deps())(actor, input);
}

/**
 * The non-deleted assets of a case (`{ caseId }`), oldest first. `thumbnailUrl`
 * (signed GET, 15 minutes) is the thumbnail rendition when it exists (image
 * thumb, video poster), else an image's original; `null` for a video without
 * its poster and other kinds. `thumbnailPending` is true while an image's or
 * video's thumbnail is not made yet. Authorize `upload` first. Errors:
 * `INVALID_INPUT`, `NOT_FOUND`, `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`, `STORAGE_FAILED`.
 */
export function listAssets(input: unknown): Promise<Result<ListedAsset[]>> {
  return makeListAssets(deps())(input);
}

/** Soft-deletes one asset (`{ caseId, assetId }`) and records `asset_removed`. Authorize `upload` first. */
export function removeAsset(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRemoveAsset(deps())(actor, input);
}

/**
 * Sets or clears the favourite flag of one asset (`{ caseId, assetId, isFavourite }`)
 * and records `asset_favourited` / `asset_unfavourited { assetId }`; setting the
 * current value again changes nothing and records no event. Only images and
 * videos can be favourites; any number per case, none required. Authorize
 * `mark favourites` first. Errors: `INVALID_INPUT`, `NOT_FOUND`, `NOT_FAVOURITABLE`,
 * `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`, `ASSET_WRITE_FAILED`, and the event-write
 * error (the flag is then put back).
 * Any status; status never changes; never touches storage. Generation sends favourite images to the AI first (Story 3.6).
 */
export function setFavourite(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeSetFavourite(storagelessDeps())(actor, input);
}

/**
 * Whether the case has material: at least one non-deleted asset. The details
 * form never counts. The single
 * check reused by Next: Details (Story 2.10) and the Generate gate (Epic 3).
 * Never touches storage. Errors: `INVALID_INPUT` (malformed id), `MATERIAL_LOOKUP_FAILED`.
 */
export function hasMaterial(caseId: unknown): Promise<Result<boolean>> {
  return makeHasMaterial(storagelessDeps())(caseId);
}

/**
 * The material manifest of a case now (Story 3.7): `{ assets: [{ id, sizeBytes, contentType }]
 * (non-deleted, oldest first), formHash }` where `formHash` is a sha256 of the details-form
 * values. A generate job stores it and the worker reads only those assets. Reads only; never
 * touches storage. Errors: `INVALID_INPUT`, `NOT_FOUND`, `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`.
 */
export function buildManifest(caseId: unknown): Promise<Result<MaterialManifest>> {
  return makeBuildManifest(storagelessDeps())(caseId);
}

/**
 * The live assets of a case for generation (Story 3.6): `[{ id, kind, contentType, sizeBytes,
 * isFavourite }]`, oldest first. Module-only (the generate job); reads only, never touches
 * storage. Errors: `INVALID_INPUT`, `NOT_FOUND`, `ASSET_LOOKUP_FAILED`, `ASSET_INVALID`.
 */
export function listGenerationAssets(caseId: unknown): Promise<Result<GenerationAsset[]>> {
  return makeListGenerationAssets(storagelessDeps())(caseId);
}

/**
 * The bytes of one live asset (`{ caseId, assetId, variant: 'original' | 'image.display' }`),
 * for the generate job (Story 3.6) to send to the AI. Module-only: no server action, no
 * signed link. Errors: `INVALID_INPUT`, `NOT_FOUND`, `RENDITION_NOT_READY`,
 * `STORAGE_NOT_CONFIGURED`, the lookup and download errors.
 */
export function readAssetBytes(input: { caseId: string; assetId: string; variant: AssetBytesVariant }): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
  return makeReadAssetBytes(deps(), (asset) => assetKey(asset.caseId, asset.id, asset.contentType))(input);
}

/**
 * Saves one details-form field: `{ caseId, field: 'context' | 'solution', text }`
 * (`""` clears it; at most 5,000 characters) and records `details_saved { field }`
 * (never the text); saving the stored text again changes nothing and records no
 * event. Authorize `fill details` first. Errors: `INVALID_INPUT` (naming `text`),
 * `UNKNOWN_FIELD`, `NOT_FOUND`. Any status; status never changes; never touches storage.
 * The form is never material.
 */
export function saveDetailsField(actor: Actor, input: unknown): Promise<Result<DetailsFieldSaved>> {
  return makeSaveDetailsField(storagelessDeps())(actor, input);
}

/**
 * Replaces a case's results (Story 2.21): `{ caseId, results: [{ label, value }] }`, at
 * most 3 filled rows (label ≤ 80, value ≤ 20 characters after trimming, the client's
 * limits); `[]` clears them. Records `details_saved { field: 'results' }` (never the
 * text); saving the stored list again changes nothing and records no event; a failed
 * event puts the previous list back. Authorize `fill details` first. Errors:
 * `INVALID_INPUT`, `NOT_FOUND`. Any status; status never changes; never material.
 */
export function saveCaseResults(actor: Actor, input: unknown): Promise<Result<CaseResultsSaved>> {
  return makeSaveCaseResults(storagelessDeps(), storyLimits())(actor, input);
}

/**
 * Replaces a case's testimonial (Story 2.21): `{ caseId, quote, author }` (quote ≤ 600,
 * author ≤ 120 characters after trimming; an author needs a quote; `""` and `""` clear
 * it). Records `details_saved { field: 'testimonial' }` (never the text), like
 * `saveCaseResults`. Authorize `fill details` first. Errors: `INVALID_INPUT`, `NOT_FOUND`.
 */
export function saveCaseTestimonial(actor: Actor, input: unknown): Promise<Result<CaseTestimonialSaved>> {
  return makeSaveCaseTestimonial(storagelessDeps(), storyLimits())(actor, input);
}

/**
 * The details form of a case (`{ caseId }`): `{ context, solution, results,
 * testimonialQuote, testimonialAuthor }`, each text `""` and `results` `[]` when never
 * saved. Authorize `fill details` first. Errors: `INVALID_INPUT`, `NOT_FOUND`. Never touches storage.
 */
export function getDetailsForm(input: unknown): Promise<Result<DetailsForm>> {
  return makeGetDetailsForm(storagelessDeps())(input);
}

/**
 * Resolves `MaterialRef`s of a case to their current text, in order: `[{ ref, text }]`.
 * Only `{ kind: 'form_field', id: 'context' | 'solution' }` resolves so
 * far; anything else is `UNKNOWN_REF` naming it (nothing resolved). Errors:
 * `INVALID_INPUT`, `UNKNOWN_REF`, `NOT_FOUND`. Never touches storage. The only way
 * other modules read cited material.
 */
export function resolveRefs(caseId: unknown, refs: unknown): Promise<Result<ResolvedRef[]>> {
  return makeResolveRefs(storagelessDeps())(caseId, refs);
}

/**
 * A signed GET (valid 15 minutes) for one display rendition of a case asset:
 * `{ url, width, height, contentType }`. `specName` is `image.thumb`,
 * `image.display`, `video.poster` or `video.display`. The only way other
 * modules read renditions; call only after authorizing access to the asset's
 * case. Errors: `INVALID_INPUT`, `NOT_FOUND` (unknown or soft-deleted asset,
 * or a spec of another kind), `RENDITION_NOT_READY`, `STORAGE_NOT_CONFIGURED`,
 * `ASSET_LOOKUP_FAILED`, `RENDITION_LOOKUP_FAILED`, `STORAGE_FAILED`.
 */
export function getRendition(assetId: unknown, specName: unknown): Promise<Result<RenditionLink>> {
  return makeGetRendition(deps())(assetId, specName);
}
