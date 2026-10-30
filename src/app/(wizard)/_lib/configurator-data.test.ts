import { describe, expect, it } from "vitest";
import type { ListedAsset } from "@/modules/material";
import { imagePoolOf } from "./configurator-data";

const A = "bbbbbbbb-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "bbbbbbbb-0000-4000-8000-00000000000c";
const V = "bbbbbbbb-0000-4000-8000-00000000000f";

const listed = (id: string, kind: ListedAsset["kind"]): ListedAsset => ({
  id,
  kind,
  originalFileName: `${id}.bin`,
  contentType: kind === "video" ? "video/mp4" : "image/png",
  sizeBytes: 1000,
  createdAt: "2026-10-14T10:00:00+00:00",
  isFavourite: false,
  thumbnailUrl: null,
  thumbnailPending: false,
});

describe("imagePoolOf", () => {
  it("keeps the case's images, oldest first, that either document references; never a video or an unused image", () => {
    const doc = { blocks: [{ background: { kind: "image", assetId: C.toUpperCase() } }] };
    const generated = { elements: [{ type: "animation", assetIds: [A, V] }] };
    expect(imagePoolOf([listed(A, "image"), listed(B, "image"), listed(C, "image"), listed(V, "video")], [doc, generated])).toEqual([A, C]);
    expect(imagePoolOf([listed(A, "image")], [])).toEqual([]);
  });
});
