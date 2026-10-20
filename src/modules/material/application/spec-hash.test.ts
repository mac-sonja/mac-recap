import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RENDITION_SPEC_NAMES, RENDITION_SPECS } from "@/modules/material/domain/rendition";
import { canonicalJson, renditionInputHash, specHash, specHashOf } from "./spec-hash";

const ASSET_ID = "bbbbbbbb-0000-4000-8000-000000000001";

describe("canonicalJson", () => {
  it("sorts keys at every level and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: "x" } })).toBe('{"a":{"c":"x","d":[2,1]},"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});

describe("specHash", () => {
  it("is the first 16 hex characters of the sha256 of the canonical JSON", () => {
    const spec = RENDITION_SPECS["image.thumb"];
    const expected = createHash("sha256").update(canonicalJson(spec)).digest("hex").slice(0, 16);
    expect(specHash(spec)).toBe(expected);
    expect(specHash(spec)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is distinct per spec and changes when any field (e.g. the version) changes", () => {
    const hashes = RENDITION_SPEC_NAMES.map(specHashOf);
    expect(new Set(hashes).size).toBe(hashes.length);
    const spec = RENDITION_SPECS["image.display"];
    expect(specHash({ ...spec, version: 2 } as unknown as typeof spec)).not.toBe(specHash(spec));
    expect(specHash({ ...spec })).toBe(specHash(spec));
  });
});

describe("renditionInputHash", () => {
  it("hashes the asset id with every spec hash of the kind", () => {
    const expected = createHash("sha256")
      .update(canonicalJson({ assetId: ASSET_ID, specs: [specHashOf("image.thumb"), specHashOf("image.display")] }))
      .digest("hex");
    expect(renditionInputHash(ASSET_ID, "image")).toBe(expected);
    expect(renditionInputHash(ASSET_ID, "video")).not.toBe(expected);
    expect(renditionInputHash("bbbbbbbb-0000-4000-8000-000000000002", "image")).not.toBe(expected);
  });
});
