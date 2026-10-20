import { describe, expect, it } from "vitest";
import { ASSET_KINDS } from "./files";
import {
  hasRenditions,
  RENDITION_CONTENT_TYPES,
  RENDITION_SPEC_NAMES,
  RENDITION_SPECS,
  renditionSpecNameSchema,
  SPECS_BY_KIND,
  THUMBNAIL_SPEC,
  RENDITION_URL_TTL_SECONDS,
} from "./rendition";

describe("rendition specs", () => {
  it("has exactly the four named, versioned specs", () => {
    expect(RENDITION_SPEC_NAMES).toEqual(["image.thumb", "image.display", "video.poster", "video.display"]);
    for (const name of RENDITION_SPEC_NAMES) {
      expect(RENDITION_SPECS[name].name).toBe(name);
      expect(Number.isInteger(RENDITION_SPECS[name].version)).toBe(true);
    }
  });

  it("matches the story's sizes and formats", () => {
    expect(RENDITION_SPECS["image.thumb"]).toMatchObject({ output: "webp", contentType: "image/webp", maxLongSide: 480 });
    expect(RENDITION_SPECS["image.display"]).toMatchObject({ output: "webp", contentType: "image/webp", maxLongSide: 2048 });
    expect(RENDITION_SPECS["video.poster"]).toMatchObject({ output: "webp", contentType: "image/webp", maxLongSide: 2048, atSeconds: 1 });
    expect(RENDITION_SPECS["video.display"]).toMatchObject({
      output: "mp4",
      contentType: "video/mp4",
      maxLongSide: 1920,
      videoCodec: "h264",
      audioCodec: "aac",
      faststart: true,
    });
  });

  it("every spec fits inside and never enlarges", () => {
    for (const name of RENDITION_SPEC_NAMES) {
      expect(RENDITION_SPECS[name]).toMatchObject({ fit: "inside", withoutEnlargement: true });
    }
  });

  it("no spec carries a crop, focal point, filter or watermark field", () => {
    const allowed = new Set([
      "name", "version", "source", "output", "contentType", "ext", "maxLongSide", "fit", "withoutEnlargement", "quality",
      "atSeconds", "videoCodec", "crf", "preset", "pixelFormat", "maxrateKbps", "bufsizeKbps", "audioCodec", "audioBitrateKbps", "faststart",
    ]);
    for (const name of RENDITION_SPEC_NAMES) {
      for (const key of Object.keys(RENDITION_SPECS[name])) expect(allowed, `${name}.${key}`).toContain(key);
    }
  });

  it("content types are the bucket-allowed WebP and MP4", () => {
    expect([...new Set(RENDITION_SPEC_NAMES.map((n) => RENDITION_SPECS[n].contentType))].sort()).toEqual([...RENDITION_CONTENT_TYPES].sort());
  });

  it("images and videos get renditions; documents and text files don't", () => {
    expect(ASSET_KINDS.filter(hasRenditions)).toEqual(["image", "video"]);
    expect(SPECS_BY_KIND.image.every((n) => RENDITION_SPECS[n].source === "image")).toBe(true);
    expect(SPECS_BY_KIND.video.every((n) => RENDITION_SPECS[n].source === "video")).toBe(true);
    expect(THUMBNAIL_SPEC).toEqual({ image: "image.thumb", video: "video.poster" });
  });

  it("signed URLs live at most 15 minutes", () => {
    expect(RENDITION_URL_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
  });

  it("parses spec names", () => {
    expect(renditionSpecNameSchema.safeParse("image.thumb").success).toBe(true);
    expect(renditionSpecNameSchema.safeParse("image.crop").success).toBe(false);
  });
});
