import type { ListedAsset } from "@/modules/material";

// The Media tab's plain helpers (Story 4.5a): no "use client", so the server page can use them too.

/** What the Media tab lists: a case's images and videos. */
export const isMedia = (file: Pick<ListedAsset, "kind">) => file.kind === "image" || file.kind === "video";

/** The upload rules the drop zone follows (Story 2.7): the case's cap, the per-file size and the image and video types. */
export interface MediaUploadRules {
  maxFiles: number;
  maxFileBytes: number;
  /** Image and video content types only. */
  contentTypes: readonly string[];
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
