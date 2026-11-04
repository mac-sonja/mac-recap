import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { rasteriseSvgLogo } from "@/modules/rendering/adapters/sharp/svg-logo";

const svg = (body: string, viewBox = "0 0 400 100") =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="400" height="100">${body}</svg>`);

describe("rasteriseSvgLogo (Story 5.3, real sharp)", () => {
  it("draws a safe SVG as a PNG no larger than 1200 px", async () => {
    const result = await rasteriseSvgLogo(svg('<rect width="400" height="100" fill="#012234"/>'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.value).metadata();
    expect(meta.format).toBe("png");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1200);
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(300);
  });

  it("refuses an unsafe SVG without drawing it", async () => {
    expect(await rasteriseSvgLogo(svg('<script>alert(1)</script><rect width="1" height="1"/>'))).toMatchObject({
      ok: false,
      error: { code: "LOGO_UNSAFE" },
    });
    expect(await rasteriseSvgLogo(svg('<image href="https://example.invalid/x.png" width="10" height="10"/>'))).toMatchObject({
      ok: false,
      error: { code: "LOGO_UNSAFE" },
    });
  });

  it("is LOGO_RASTERISE_FAILED for an SVG that passes the scan but can't be drawn", async () => {
    // Safe markup, but a zero-sized canvas librsvg refuses.
    const result = await rasteriseSvgLogo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>'));
    expect(result).toMatchObject({ ok: false, error: { code: "LOGO_RASTERISE_FAILED" } });
  });
});
