import { z } from "zod";

/**
 * Client material (Story 2.16): up to 3 files per client, at least 2 of them
 * images for the intro pages. The types and size limit mirror the case material
 * ones (`material/domain/files.ts`); they are copied, never imported (module
 * boundary), and `test/client-material-types.test.ts` keeps both lists equal. The
 * `client_asset` checks list exactly these.
 */
export const CLIENT_MATERIAL_FILE_TYPES = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
  "application/pdf": { ext: "pdf", kind: "document" },
  "text/plain": { ext: "txt", kind: "text" },
  "text/markdown": { ext: "md", kind: "text" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", kind: "document" },
} as const satisfies Record<string, { ext: string; kind: ClientAssetKind }>;

/** What a client file is, for icons and the intro's image count. */
export type ClientAssetKind = "image" | "video" | "document" | "text";

export type ClientMaterialContentType = keyof typeof CLIENT_MATERIAL_FILE_TYPES;
export const CLIENT_MATERIAL_CONTENT_TYPES = Object.keys(CLIENT_MATERIAL_FILE_TYPES) as ClientMaterialContentType[];

/** Upper size bound of one client file, in bytes (50 MB, as the case material). */
export const CLIENT_MATERIAL_MAX_BYTES = 50 * 1024 * 1024;
/** At most this many files per client (checked at presign and, atomically, by `insert_client_asset`). */
export const CLIENT_MATERIAL_MAX_FILES = 3;
/** The intro needs at least this many images. */
export const CLIENT_MATERIAL_MIN_IMAGES = 2;
/** An image's shorter side is at least this many pixels. */
export const CLIENT_IMAGE_MIN_SHORT_SIDE_PX = 1600;
/** No side of an image is longer than this. */
export const CLIENT_IMAGE_MAX_SIDE_PX = 8000;

export function isClientMaterialContentType(value: unknown): value is ClientMaterialContentType {
  return typeof value === "string" && Object.hasOwn(CLIENT_MATERIAL_FILE_TYPES, value);
}

export function clientMaterialExtensionFor(contentType: ClientMaterialContentType): string {
  return CLIENT_MATERIAL_FILE_TYPES[contentType].ext;
}

export function clientMaterialKindFor(contentType: ClientMaterialContentType): ClientAssetKind {
  return CLIENT_MATERIAL_FILE_TYPES[contentType].kind;
}

/** Whether a client file of `sizeBytes` is within 1 B–50 MB. */
export function isClientMaterialSizeAllowed(sizeBytes: number): boolean {
  return Number.isInteger(sizeBytes) && sizeBytes >= 1 && sizeBytes <= CLIENT_MATERIAL_MAX_BYTES;
}

/** Whether an image of `width` × `height` pixels fits: short side ≥1600 px, no side over 8000 px. */
export function isClientImageSizeAllowed(width: number, height: number): boolean {
  return Math.min(width, height) >= CLIENT_IMAGE_MIN_SHORT_SIDE_PX && Math.max(width, height) <= CLIENT_IMAGE_MAX_SIDE_PX;
}

/** A `client_asset` row as the module sees it. `width`/`height` are set for images only. */
export interface ClientAsset {
  id: string;
  clientId: string;
  /** 1–3, chosen by `insert_client_asset` (the lowest free one). */
  position: number;
  /** The browser's file name, trimmed (1–255 characters). */
  fileName: string;
  kind: ClientAssetKind;
  contentType: ClientMaterialContentType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** A client file as the wizard lists it: images carry a signed GET (≤15 minutes), or null. */
export type ListedClientAsset = ClientAsset & { thumbnailUrl: string | null };

/** How many of `assets` are images: the intro needs `CLIENT_MATERIAL_MIN_IMAGES`. */
export function clientImageCount(assets: ReadonlyArray<Pick<ClientAsset, "kind">>): number {
  return assets.filter((asset) => asset.kind === "image").length;
}

/** A signed upload request for one client file: the declared type, size and the cap are checked first. */
export const requestClientMaterialUploadInputSchema = z.object({
  clientId: z.uuid("Required."),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

/** C0/C1 control characters (incl. NUL) and the bidi embedding/override/isolate controls (as the case material). */
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;

/** Confirms an uploaded client file; the server re-checks it before inserting the row. `fileName` is shown on the row. */
export const confirmClientMaterialUploadInputSchema = z.object({
  clientId: z.uuid("Required."),
  assetId: z.uuid("Required."),
  contentType: z.string().min(1),
  fileName: z
    .string()
    .trim()
    .min(1, "Required.")
    .max(255)
    .refine((name) => !UNSAFE_FILE_NAME_CHARS.test(name), "Must not contain control or bidi characters."),
});

/** One client's files. */
export const listClientMaterialInputSchema = z.object({ clientId: z.uuid("Required.") });

/** One file of one client. */
export const removeClientMaterialInputSchema = z.object({
  clientId: z.uuid("Required."),
  assetId: z.uuid("Required."),
});
