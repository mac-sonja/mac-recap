import { describe, expect, it } from "vitest";
import { formatLength, isMedia, pageAssetIds } from "./media-files";

describe("formatLength", () => {
  it.each([
    [0, "0:00"],
    [9.4, "0:09"],
    [59.6, "1:00"],
    [754, "12:34"],
    [-3, "0:00"],
  ])("%s s → %s", (seconds, text) => {
    expect(formatLength(seconds)).toBe(text);
  });
});

describe("pageAssetIds", () => {
  it("finds media, backgrounds and animations, lowercased, never text source refs", () => {
    const ids = pageAssetIds([
      { background: { kind: "image", assetId: "AAAA" } },
      { blocks: [{ elements: [{ type: "animation", assetIds: ["bbbb"] }, { type: "text", sourceRefs: [{ kind: "asset", id: "cccc" }] }] }] },
    ]);
    expect([...ids].sort()).toEqual(["aaaa", "bbbb"]);
  });
});

describe("isMedia", () => {
  it("keeps images and videos only", () => {
    expect((["image", "video", "document", "text"] as const).filter((kind) => isMedia({ kind }))).toEqual(["image", "video"]);
  });
});
