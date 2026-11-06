import type { ListedClientAsset } from "@/modules/case-study";
import type { ListedAsset } from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";

// The Media tab's plain helpers (Story 4.5a): no "use client", so the server page can use them too.

/** What the Media tab lists: a case's images and videos. */
export const isMedia = (file: Pick<ListedAsset, "kind">) => file.kind === "image" || file.kind === "video";

/** A Media tile's drag data type (Story 4.5b): the asset id, in a type no file drag carries. */
export const MEDIA_DRAG_TYPE = "application/x-mac-media";

/** The upload rules the drop zone follows (Story 2.7): the case's cap, the per-file size and the image and video types. */
export interface MediaUploadRules {
  maxFiles: number;
  maxFileBytes: number;
  /** Image and video content types only. */
  contentTypes: readonly string[];
  /** Client mode (Story 4.11a): a client image's pixel bounds, for the refusal's words. */
  imagePixels?: { min: number; max: number };
}

/**
 * Every asset id the pages show: media and backgrounds (`assetId`) and animations
 * (`assetIds`), lowercased. Text source refs are not on a page.
 */
export function pageAssetIds(pages: unknown): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.assetId === "string") found.add(record.assetId.toLowerCase());
    if (Array.isArray(record.assetIds)) for (const id of record.assetIds) if (typeof id === "string") found.add(id.toLowerCase());
    for (const child of Object.values(record)) walk(child);
  };
  walk(pages);
  return found;
}

/** A length in seconds as m:ss. */
export function formatLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The client's images and videos as the configurator's Media lists them (Story 4.5c-2,
 * "Del cliente"), in position order, shaped as a case file's listing: never a favourite,
 * never pending, the file name as listed on the client page. The tile shows the image's
 * display copy (else its signed original) and the video's poster (else no thumbnail).
 * PDFs and text files are left out: they never go on a page.
 */
export function clientMediaOf(files: readonly ListedClientAsset[], assets: Readonly<Record<string, RenderAsset>>): ListedAsset[] {
  return files.flatMap((file): ListedAsset[] => {
    if (file.kind !== "image" && file.kind !== "video") return [];
    const drawn = assets[file.id];
    const thumbnailUrl = file.kind === "image" ? (drawn?.url ?? file.thumbnailUrl) : drawn?.kind === "video" ? (drawn.posterUrl ?? null) : null;
    return [
      {
        id: file.id,
        kind: file.kind,
        originalFileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        isFavourite: false,
        thumbnailUrl,
        thumbnailPending: false,
      },
    ];
  });
}
