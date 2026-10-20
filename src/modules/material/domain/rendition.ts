import { z } from "zod";
import type { AssetKind } from "@/modules/material/domain/files";

/**
 * Display renditions (Story 3.2): light copies of a case image or video for
 * thumbnails, the configurator and shared links. Every spec keeps the
 * original's aspect ratio (`fit: inside`) and never enlarges: a smaller source
 * keeps its own size, and the only other change allowed is applying the EXIF
 * orientation. No crop, focal point, recolouring, filter, watermark or AI.
 *
 * A spec is identified in storage and in `rendition.spec_hash` by its
 * `specHash` (first 16 hex characters of the sha256 of its canonical JSON,
 * computed in `application/spec-hash.ts`), so changing any field (bump
 * `version` when you do) makes a new rendition instead of reusing a stale one.
 */
export const RENDITION_SPECS = {
  "image.thumb": {
    name: "image.thumb",
    version: 1,
    source: "image",
    output: "webp",
    contentType: "image/webp",
    ext: "webp",
    maxLongSide: 480,
    fit: "inside",
    withoutEnlargement: true,
    quality: 80,
  },
  "image.display": {
    name: "image.display",
    version: 1,
    source: "image",
    output: "webp",
    contentType: "image/webp",
    ext: "webp",
    maxLongSide: 2048,
    fit: "inside",
    withoutEnlargement: true,
    quality: 85,
  },
  "video.poster": {
    name: "video.poster",
    version: 1,
    source: "video",
    output: "webp",
    contentType: "image/webp",
    ext: "webp",
    /** The frame at this second, or the first frame when the video is not longer. */
    atSeconds: 1,
    maxLongSide: 2048,
    fit: "inside",
    withoutEnlargement: true,
    quality: 85,
  },
  "video.display": {
    name: "video.display",
    version: 1,
    source: "video",
    output: "mp4",
    contentType: "video/mp4",
    ext: "mp4",
    maxLongSide: 1920,
    fit: "inside",
    withoutEnlargement: true,
    videoCodec: "h264",
    crf: 23,
    preset: "medium",
    pixelFormat: "yuv420p",
    /** Peak video bitrate and its buffer, so the copy stays well under the 50 MB bucket cap. */
    maxrateKbps: 4000,
    bufsizeKbps: 8000,
    audioCodec: "aac",
    audioBitrateKbps: 128,
    faststart: true,
  },
} as const;

export type RenditionSpecName = keyof typeof RENDITION_SPECS;
export type RenditionSpec = (typeof RENDITION_SPECS)[RenditionSpecName];
export type ImageRenditionSpec = Extract<RenditionSpec, { output: "webp" }>;
export type VideoDisplaySpec = (typeof RENDITION_SPECS)["video.display"];
export type VideoPosterSpec = (typeof RENDITION_SPECS)["video.poster"];

export const RENDITION_SPEC_NAMES = Object.keys(RENDITION_SPECS) as RenditionSpecName[];

export const renditionSpecNameSchema = z.enum(RENDITION_SPEC_NAMES as [RenditionSpecName, ...RenditionSpecName[]]);

/** The kinds that get renditions; documents and text files get none (no job is enqueued). */
export const RENDITION_KINDS = ["image", "video"] as const satisfies readonly AssetKind[];
export type RenditionKind = (typeof RENDITION_KINDS)[number];

export function hasRenditions(kind: AssetKind): kind is RenditionKind {
  return (RENDITION_KINDS as readonly AssetKind[]).includes(kind);
}

/** Every spec made for one kind, in the order the worker makes them (the thumbnail first). */
export const SPECS_BY_KIND: Readonly<Record<RenditionKind, readonly RenditionSpecName[]>> = {
  image: ["image.thumb", "image.display"],
  video: ["video.poster", "video.display"],
};

/** The rendition the Material step shows on a row of this kind. */
export const THUMBNAIL_SPEC: Readonly<Record<RenditionKind, RenditionSpecName>> = {
  image: "image.thumb",
  video: "video.poster",
};

/** Content types a rendition can have; the `rendition.content_type` check lists exactly these. */
export const RENDITION_CONTENT_TYPES = ["image/webp", "video/mp4"] as const;

/** How long a rendition's signed GET stays valid, in seconds (at most 15 minutes). */
export const RENDITION_URL_TTL_SECONDS = 15 * 60;

/** A `rendition` row as the material module sees it. `path` is the stored key, opaque outside adapters. */
export const renditionSchema = z.object({
  assetId: z.uuid(),
  specHash: z.string().regex(/^[0-9a-f]{16}$/),
  path: z.string().min(1),
  contentType: z.enum(RENDITION_CONTENT_TYPES),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  sizeBytes: z.number().int().min(1),
  createdAt: z.string(),
});
export type Rendition = z.infer<typeof renditionSchema>;

/** What `getRendition` returns: a signed GET (≤ 15 min) and the rendition's facts. */
export interface RenditionLink {
  url: string;
  width: number;
  height: number;
  contentType: Rendition["contentType"];
}

export const getRenditionInputSchema = z.object({
  assetId: z.uuid(),
  specName: renditionSpecNameSchema,
});

/** Error codes the rendition worker returns. */
export const RENDITION_UNDECODABLE = "RENDITION_UNDECODABLE";
/** Any other rendering failure (OOM or signal kill, disk full, …): retryable. */
export const RENDITION_FAILED = "RENDITION_FAILED";
/** ffmpeg/ffprobe ran past its time limit: not retried. */
export const RENDITION_TIMEOUT = "RENDITION_TIMEOUT";
/** A made copy over the bucket's per-object cap: not retried. */
export const RENDITION_TOO_LARGE = "RENDITION_TOO_LARGE";
export const RENDITION_NOT_READY = "RENDITION_NOT_READY";
