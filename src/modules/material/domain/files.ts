import { z } from "zod";

/** At most this many non-deleted assets per case (checked at presign and, atomically, at confirm). */
export const MAX_ASSETS_PER_CASE = 20;

/** Upper size bound of one file, in bytes (100 MB). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** What an asset is, for icons and later renditions. The `asset.kind` check lists exactly these. */
export const ASSET_KINDS = ["image", "video", "document", "text"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/**
 * The upload allowlist: content type → stored extension and kind. The extension
 * always comes from here, never from the file name. The `asset.content_type`
 * check lists exactly these keys.
 */
export const ALLOWED_FILE_TYPES = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
  "application/pdf": { ext: "pdf", kind: "document" },
  "text/plain": { ext: "txt", kind: "text" },
  "text/markdown": { ext: "md", kind: "text" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", kind: "document" },
} as const satisfies Record<string, { ext: string; kind: AssetKind }>;

export type AllowedContentType = keyof typeof ALLOWED_FILE_TYPES;

export const ALLOWED_CONTENT_TYPES = Object.keys(ALLOWED_FILE_TYPES) as AllowedContentType[];

export function isAllowedContentType(value: unknown): value is AllowedContentType {
  return typeof value === "string" && Object.hasOwn(ALLOWED_FILE_TYPES, value);
}

export function extensionFor(contentType: AllowedContentType): string {
  return ALLOWED_FILE_TYPES[contentType].ext;
}

export function kindFor(contentType: AllowedContentType): AssetKind {
  return ALLOWED_FILE_TYPES[contentType].kind;
}

export const contentTypeSchema = z.enum(ALLOWED_CONTENT_TYPES as [AllowedContentType, ...AllowedContentType[]]);
