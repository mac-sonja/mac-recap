import { describe, expect, it } from "vitest";
import { FILE_TYPES, FORMAT_IDS, FORMATS, getFormat, isFormatId, requireFormat } from "./formats";

describe("format registry", () => {
  it("lists exactly the three formats, in registry order (C28)", () => {
    expect(FORMATS.map((f) => f.id)).toEqual(["presentazione_16_9", "carosello_1_1", "video_9_16"]);
    expect(FORMATS.map((f) => f.id)).toEqual([...FORMAT_IDS]);
  });

  it("gives each format its name, size, page model, file type and motion", () => {
    expect(FORMATS).toEqual([
      {
        id: "presentazione_16_9",
        name: "Presentazione",
        ratio: "16:9",
        pixelSize: { width: 1920, height: 1080 },
        pageModel: "slides",
        fileType: "pdf",
        motion: false,
      },
      { id: "carosello_1_1", name: "Carosello", ratio: "1:1", pixelSize: { width: 1080, height: 1080 }, pageModel: "slides", fileType: "zip_png", motion: false },
      { id: "video_9_16", name: "Video", ratio: "9:16", pixelSize: { width: 1080, height: 1920 }, pageModel: "slides", fileType: "mp4_webm", motion: true },
    ]);
  });

  it("lists every file type a format uses", () => {
    for (const f of FORMATS) expect(FILE_TYPES).toContain(f.fileType);
  });

  it("has pixel sizes that match each ratio", () => {
    for (const f of FORMATS) {
      const [w, h] = f.ratio.split(":").map(Number);
      expect(Math.abs(f.pixelSize.width / f.pixelSize.height - w / h), f.id).toBeLessThan(0.001);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(FORMATS)).toBe(true);
    for (const f of FORMATS) {
      expect(Object.isFrozen(f)).toBe(true);
      expect(Object.isFrozen(f.pixelSize)).toBe(true);
    }
  });

  it("looks formats up by id", () => {
    expect(getFormat("video_9_16").name).toBe("Video");
    expect(isFormatId("carosello_1_1")).toBe(true);
    expect(isFormatId("story_9_16")).toBe(false);
    expect(isFormatId("toString")).toBe(false);
    expect(isFormatId(undefined)).toBe(false);
  });
});

describe("requireFormat", () => {
  const revision = { doc: { formats: { presentazione_16_9: { pages: ["a"] }, video_9_16: { pages: ["b"] } } } };

  it("returns the revision's entry for a format it has", () => {
    expect(requireFormat(revision, "presentazione_16_9")).toEqual({ ok: true, value: { pages: ["a"] } });
  });

  it.each(["carosello_1_1", "story_9_16", "toString", "__proto__", 42, undefined])("refuses %s with FORMAT_NOT_IN_REVISION", (id) => {
    const result = requireFormat(revision, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORMAT_NOT_IN_REVISION");
  });
});
