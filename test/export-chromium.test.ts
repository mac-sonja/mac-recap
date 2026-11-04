// Story 5.3: an export drawn by the real Playwright Chromium, from the same HTML the
// worker builds (the preview's renderer, the inline Inter font). Skipped when Chromium
// is not installed locally; CI installs it (and fails here if it is missing), and the
// runtime image is Playwright's own (v1.63.0-noble).
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { caseHistoryV2 } from "@/modules/generation";
import { interFontCss } from "@/modules/rendering/adapters/fonts/inter";
import { createPlaywrightExportBrowser } from "@/modules/rendering/adapters/playwright/export-browser";
import { exportHtml } from "@/modules/rendering/application/export-html";
import type { BoundValues, FormatId } from "@/modules/rendering";

const hasChromium = (() => {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
})();

const VALUES: BoundValues = {
  client: { name: "Lumen Srl", sector: "Lusso", description: "Luci per la casa.", logoUrl: null, results: [], testimonial: null },
  case: { year: 2026, services: ["Branding"], results: [{ label: "visitatori", value: "1.800" }], testimonial: null },
};

/** The reference document, cut to its first two pages: an image-free two-slide file. */
async function html(format: FormatId, size: { width: number; height: number }) {
  const doc = caseHistoryV2([format]);
  const twoPages = { ...doc, formats: { [format]: { pages: doc.formats[format].pages.slice(0, 2) } } };
  return exportHtml({
    parts: [{ kind: "case_history", caseId: "cccccccc-0000-4000-8000-000000000001", clientId: "dddddddd-0000-4000-8000-000000000001", doc: twoPages, assets: {}, values: VALUES }],
    format,
    size,
    fontCss: await interFontCss(),
  });
}

describe("Chromium is available in CI", () => {
  it.runIf(process.env.CI === "true")("Playwright's Chromium is installed", () => {
    expect(hasChromium).toBe(true);
  });
});

describe("the inline Inter font", () => {
  it("embeds the Latin and Latin Extended woff2 files as `Inter`", async () => {
    const css = await interFontCss();
    expect(css.match(/@font-face\{font-family:Inter;/g)).toHaveLength(2);
    expect(css).toContain("src:url(data:font/woff2;base64,d09GMg"); // "wOF2"
    expect(css).not.toMatch(/url\((?!data:)/);
  });
});

describe.skipIf(!hasChromium)("export with real Chromium (Story 5.3)", () => {
  const browser = createPlaywrightExportBrowser();

  it("prints a two-page Presentazione as a PDF of two 1920×1080 pages, in Inter", async () => {
    const size = { width: 1920, height: 1080 };
    const pdf = Buffer.from(await browser.pdf(await html("presentazione_16_9", size), size, new AbortController().signal));
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(2);
    // 1920×1080 CSS px = 1440×810 pt.
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Math.round(Number(m[1])), Math.round(Number(m[2]))]);
    expect(boxes).toEqual([
      [1440, 810],
      [1440, 810],
    ]);
    expect(text).toMatch(/\/FontName\s*\/[A-Z]{6}\+Inter/);
  }, 60_000);

  it("shoots a two-slide Carosello as two 1080×1080 PNGs", async () => {
    const size = { width: 1080, height: 1080 };
    const pngs = await browser.pngs(await html("carosello_1_1", size), size, new AbortController().signal);
    expect(pngs).toHaveLength(2);
    for (const png of pngs) {
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["png", 1080, 1080]);
    }
  }, 60_000);

  it("loads nothing from the network", async () => {
    const size = { width: 1920, height: 1080 };
    const page = (await html("presentazione_16_9", size)).replace("</body>", '<img src="https://example.invalid/x.png"></body>');
    // The request is aborted, so the image is broken, and the file is still made.
    const pdf = Buffer.from(await browser.pdf(page, size, new AbortController().signal));
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
  }, 60_000);

  it("stops at once when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(browser.pdf("<!doctype html>", { width: 10, height: 10 }, controller.signal)).rejects.toThrow();
  });
});
