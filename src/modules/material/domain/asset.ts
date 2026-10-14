import { z } from "zod";
import { ASSET_KINDS, contentTypeSchema, MAX_FILE_BYTES, type AssetKind } from "@/modules/material/domain/files";

/** An `asset` row as the material module sees it. The storage key stays in adapters. */
export const assetSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  kind: z.enum(ASSET_KINDS),
  originalFileName: z.string(),
  contentType: contentTypeSchema,
  sizeBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
  createdBy: z.uuid(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
  isFavourite: z.boolean(),
});
export type Asset = z.infer<typeof assetSchema>;

/**
 * Request for a signed upload. `contentType` and `sizeBytes` are checked by the
 * use case (FILE_TYPE_NOT_ALLOWED / FILE_TOO_LARGE), so here they are loose.
 */
export const presignInputSchema = z.object({
  caseId: z.uuid(),
  contentType: z.string(),
  sizeBytes: z.number().int().min(1),
});
export type PresignInput = z.infer<typeof presignInputSchema>;

/** C0/C1 control characters (incl. NUL) and the bidi embedding/override/isolate controls. */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;

/** Confirms an upload issued by presign; the size is read back from storage, never trusted. */
export const confirmInputSchema = z.object({
  caseId: z.uuid(),
  assetId: z.uuid(),
  contentType: z.string(),
  fileName: z
    .string()
    .trim()
    .min(1, "Required.")
    .max(255)
    .refine((name) => !UNSAFE_FILE_NAME_CHARS.test(name), "Must not contain control or bidi characters."),
});
export type ConfirmInput = z.infer<typeof confirmInputSchema>;

/** Identifies one asset of one case (remove). */
export const assetRefInputSchema = z.object({
  caseId: z.uuid(),
  assetId: z.uuid(),
});
export type AssetRefInput = z.infer<typeof assetRefInputSchema>;

/** Sets or clears the favourite flag of one asset of one case. */
export const favouriteInputSchema = assetRefInputSchema.extend({
  isFavourite: z.boolean(),
});
export type FavouriteInput = z.infer<typeof favouriteInputSchema>;

/** The only kinds that can be favourites. The `asset_favourite_kind_check` constraint lists exactly these. */
export const FAVOURITABLE_KINDS = ["image", "video"] as const satisfies readonly AssetKind[];

/** Event types the material module records through `case-study.recordEvent`, each with `{ assetId }`. */
export const ASSET_UPLOADED = "asset_uploaded";
export const ASSET_REMOVED = "asset_removed";
export const ASSET_FAVOURITED = "asset_favourited";
export const ASSET_UNFAVOURITED = "asset_unfavourited";

/** Lists the live assets of one case. */
export const listAssetsInputSchema = z.object({
  caseId: z.uuid(),
});

/** How long an image's presigned GET (its thumbnail URL) stays valid, in seconds. */
export const THUMBNAIL_URL_TTL_SECONDS = 15 * 60;

/**
 * One row of a case's file list: the asset (with its favourite flag) without
 * its author or deletion stamp, plus a signed GET for images (`null` for other kinds, or when storage
 * isn't available).
 */
export type ListedAsset = Pick<Asset, "id" | "kind" | "originalFileName" | "contentType" | "sizeBytes" | "createdAt" | "isFavourite"> & {
  thumbnailUrl: string | null;
};
