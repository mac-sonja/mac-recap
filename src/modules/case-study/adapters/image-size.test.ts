import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { imageSize } from "./image-size";

// Real encoder output (sharp, test-only): the header reader must agree with it.
const base = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } });

describe("imageSize", () => {
  it.each([
    ["PNG", "png", (w: number, h: number) => base(w, h).png().toBuffer()],
    ["JPEG", "jpeg", (w: number, h: number) => base(w, h).jpeg().toBuffer()],
    ["JPEG with EXIF", "jpeg", (w: number, h: number) => base(w, h).jpeg().withMetadata({ orientation: 1 }).toBuffer()],
    ["progressive JPEG", "jpeg", (w: number, h: number) => base(w, h).jpeg({ progressive: true }).toBuffer()],
    ["lossy WebP", "webp", (w: number, h: number) => base(w, h).flatten().webp({ quality: 80 }).toBuffer()],
    ["lossy WebP with alpha", "webp", (w: number, h: number) => base(w, h).webp({ quality: 80 }).toBuffer()],
    ["lossless WebP", "webp", (w: number, h: number) => base(w, h).webp({ lossless: true }).toBuffer()],
  ] as const)("reads a %s", async (_label, format, encode) => {
    for (const [w, h] of [
      [400, 399],
      [1201, 400],
      [1, 1],
      [16383, 2],
    ]) {
      expect(imageSize(new Uint8Array(await encode(w, h)))).toEqual({ format, width: w, height: h });
    }
  });

  it.each([
    ["a GIF", async () => base(10, 10).gif().toBuffer()],
    ["an SVG", async () => Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'/>")],
    ["a PDF", async () => Buffer.from("%PDF-1.4\n")],
    ["empty bytes", async () => Buffer.alloc(0)],
    ["a truncated PNG", async () => (await base(500, 500).png().toBuffer()).subarray(0, 20)],
    ["a truncated JPEG", async () => (await base(500, 500).jpeg().toBuffer()).subarray(0, 40)],
    ["a PNG without its IEND chunk", async () => {
      const full = await base(500, 500).png().toBuffer();
      return full.subarray(0, full.length - 12);
    }],
    ["a PNG with garbage after a valid header", async () => {
      const full = await base(500, 500).png().toBuffer();
      return Buffer.concat([full.subarray(0, 33), Buffer.alloc(200, 7)]);
    }],
    ["a JPEG without its EOI marker", async () => {
      const full = await base(500, 500).jpeg().toBuffer();
      return full.subarray(0, full.length - 2);
    }],
    ["a WebP cut short (RIFF size larger than the bytes)", async () => {
      const full = await base(500, 500).webp().toBuffer();
      return full.subarray(0, full.length - 10);
    }],
    ["a WebP with bytes past its RIFF size", async () => Buffer.concat([await base(500, 500).webp().toBuffer(), Buffer.alloc(4)])],
  ])("returns null for %s", async (_label, make) => {
    expect(imageSize(new Uint8Array(await make()))).toBeNull();
  });
});
