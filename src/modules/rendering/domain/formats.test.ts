import { describe, expect, it } from "vitest";
import { FORMAT_IDS, FORMATS, getFormat, isFormatId, requireFormat } from "./formats";

describe("format registry", () => {
  it("lists exactly the three MVP formats, in registry order", () => {
    expect(FORMATS.map((f) => f.id)).toEqual(["deck_16_9", "social_carousel_4_5", "pdf_a4"]);
    expect(FORMATS.map((f) => f.id)).toEqual([...FORMAT_IDS]);
  });

  it("gives each format its name, size, page model and file type, all static", () => {
    expect(FORMATS).toEqual([
      { id: "deck_16_9", name: "Deck 16:9", ratio: "16:9", pixelSize: { width: 1920, height: 1080 }, pageModel: "slides", fileType: "pdf", static: true },
      {
        id: "social_carousel_4_5",
        name: "Carosello social 4:5",
        ratio: "4:5",
        pixelSize: { width: 1080, height: 1350 },
        pageModel: "slides",
        fileType: "zip_png",
        static: true,
      },
      { id: "pdf_a4", name: "PDF A4", ratio: "210:297", pixelSize: { width: 2480, height: 3508 }, pageModel: "pages", fileType: "pdf", static: true },
    ]);
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
    expect(getFormat("pdf_a4").name).toBe("PDF A4");
    expect(isFormatId("deck_16_9")).toBe(true);
    expect(isFormatId("story_9_16")).toBe(false);
    expect(isFormatId("toString")).toBe(false);
    expect(isFormatId(undefined)).toBe(false);
  });
});

describe("requireFormat", () => {
  const revision = { doc: { formats: { deck_16_9: { variant: "a" }, pdf_a4: { variant: "b" } } } };

  it("returns the revision's entry for a format it has", () => {
    expect(requireFormat(revision, "deck_16_9")).toEqual({ ok: true, value: { variant: "a" } });
  });

  it.each(["social_carousel_4_5", "story_9_16", "toString", "__proto__", 42, undefined])("refuses %s with FORMAT_NOT_IN_REVISION", (id) => {
    const result = requireFormat(revision, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORMAT_NOT_IN_REVISION");
  });
});
