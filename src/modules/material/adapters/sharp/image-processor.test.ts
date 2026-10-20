import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { RENDITION_SPECS } from "@/modules/material/domain/rendition";
import { classifySharpError, createSharpImageProcessor } from "./image-processor";

const processor = createSharpImageProcessor();
const live = () => new AbortController().signal;
const thumb = RENDITION_SPECS["image.thumb"];
const display = RENDITION_SPECS["image.display"];

/** A solid test image of the given size and format. */
async function fixture(width: number, height: number, format: "jpeg" | "png", orientation?: number) {
  let image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } });
  image = format === "jpeg" ? image.jpeg() : image.png();
  if (orientation !== undefined) image = image.withMetadata({ orientation });
  return new Uint8Array(await image.toBuffer());
}

async function rendered(input: Uint8Array, spec: typeof thumb | typeof display) {
  const result = await processor.render(input, spec, live());
  if (!result.ok) throw new Error(result.error.code);
  const meta = await sharp(result.value.bytes).metadata();
  return { ...result.value, format: meta.format, metaWidth: meta.width, metaHeight: meta.height, orientation: meta.orientation };
}

describe("sharp image renditions (real sharp)", () => {
  it("downscales a 6000×4000 JPEG to a 480×320 thumb and a 2048×1365 display, both WebP", async () => {
    const input = await fixture(6000, 4000, "jpeg");
    const t = await rendered(input, thumb);
    expect(t).toMatchObject({ width: 480, height: 320, format: "webp", metaWidth: 480, metaHeight: 320 });
    const d = await rendered(input, display);
    expect(d).toMatchObject({ width: 2048, height: 1365, format: "webp", metaWidth: 2048, metaHeight: 1365 });
  });

  it("never enlarges: a 300×200 PNG stays 300×200 for thumb and display", async () => {
    const input = await fixture(300, 200, "png");
    expect(await rendered(input, thumb)).toMatchObject({ width: 300, height: 200, format: "webp" });
    expect(await rendered(input, display)).toMatchObject({ width: 300, height: 200, format: "webp" });
  });

  it("keeps a portrait aspect", async () => {
    const t = await rendered(await fixture(1000, 3000, "png"), thumb);
    expect(t).toMatchObject({ width: 160, height: 480 });
  });

  it("applies EXIF orientation 6: the copy is upright, aspect kept, with no orientation left", async () => {
    // Stored 600×400 with orientation 6 (rotate 90° clockwise to display) → upright 400×600.
    const input = await fixture(600, 400, "jpeg", 6);
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const d = await rendered(input, display);
    expect(d).toMatchObject({ width: 400, height: 600, metaWidth: 400, metaHeight: 600 });
    expect(d.orientation ?? 1).toBe(1);
    const t = await rendered(input, thumb);
    expect(t).toMatchObject({ width: 320, height: 480 });
  });

  it("an undecodable file fails for good", async () => {
    const result = await processor.render(new TextEncoder().encode("not an image at all"), thumb, live());
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_UNDECODABLE", retryable: false }) });
  });

  it("a truncated JPEG fails for good", async () => {
    const input = await fixture(1200, 800, "jpeg");
    const result = await processor.render(input.slice(0, 200), thumb, live());
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_UNDECODABLE", retryable: false }) });
  });

  it("does nothing once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await processor.render(await fixture(10, 10, "png"), thumb, controller.signal);
    expect(result).toEqual({ ok: false, error: expect.objectContaining({ code: "ABORTED" }) });
  });
});

describe("classifySharpError", () => {
  it.each([
    "Input buffer contains unsupported image format",
    "Input buffer has corrupt header: VipsJpeg: premature end of JPEG image",
    "VipsJpeg: premature end of JPEG image",
    "vipspng: libpng read error",
    "Input file contains unsupported image format",
  ])("a decode failure fails for good: %s", (message) => {
    expect(classifySharpError(new Error(message))).toMatchObject({ code: "RENDITION_UNDECODABLE", retryable: false });
  });

  it.each([
    "vips_malloc: out of memory",
    "Input image exceeds pixel limit",
    "ENOSPC: no space left on device",
    "something unexpected",
  ])("anything else is a retryable RENDITION_FAILED: %s", (message) => {
    const failure = classifySharpError(new Error(message));
    expect(failure.code).toBe("RENDITION_FAILED");
    expect(failure.retryable).not.toBe(false);
  });

  it("a non-Error throw is retryable too", () => {
    expect(classifySharpError("boom").code).toBe("RENDITION_FAILED");
  });
});

describe("the image pipeline only downscales (static check)", () => {
  const source = readFileSync(fileURLToPath(new URL("./image-processor.ts", import.meta.url)), "utf8");
  const pipeline = /\/\/ pipeline:start\n([\s\S]*?)\/\/ pipeline:end/.exec(source)?.[1] ?? "";

  it("calls exactly sharp(input).rotate().resize({ fit: inside, withoutEnlargement }).webp().toBuffer()", () => {
    expect(pipeline).not.toBe("");
    const calls = [...pipeline.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
    expect(calls).toEqual(["rotate", "resize", "webp", "toBuffer"]);
    expect(pipeline).toMatch(/sharp\(input\)/);
    // rotate() with no angle only applies the EXIF orientation.
    expect(pipeline).toMatch(/\.rotate\(\)/);
    const resize = /\.resize\(([^)]*)\)/.exec(pipeline)?.[1] ?? "";
    expect(resize).toMatch(/fit: "inside"/);
    expect(resize).toMatch(/withoutEnlargement: true/);
    expect(resize).not.toMatch(/position|gravity|kernel|background|fastShrink/);
  });

  it("the whole adapter calls no other sharp operation", () => {
    const FORBIDDEN = [
      "extract", "crop", "trim", "extend", "affine", "flip", "flop", "sharpen", "median", "blur", "flatten", "unflatten",
      "gamma", "negate", "normalise", "normalize", "clahe", "convolve", "threshold", "boolean", "linear", "recomb",
      "modulate", "tint", "greyscale", "grayscale", "pipelineColourspace", "toColourspace", "removeAlpha", "ensureAlpha",
      "extractChannel", "joinChannel", "bandbool", "composite", "dilate", "erode",
    ];
    const calls = new Set([...source.matchAll(/\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
    expect(FORBIDDEN.filter((op) => calls.has(op))).toEqual([]);
  });
});
