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
import { readStoredZip, storeZip } from "@/modules/rendering/adapters/zip/store-zip";
import { bundleHashOf, readExportSources } from "@/modules/rendering/application/export-source";
import { makeExportHandler, pdfPageCount, type ExportHandlerDeps } from "@/modules/rendering/application/export-handler";
import { exportHtml } from "@/modules/rendering/application/export-html";
import { ACTOR, CASE_ID, CASE_IMAGE, CLIENT_IMAGE, REVISION_ID, sourceDeps } from "@/modules/rendering/application/export.fixtures";
import type { ExportRecord, NewExport } from "@/modules/rendering/domain/export";
import type { BoundValues, FormatId } from "@/modules/rendering";
import type { Job } from "@/modules/jobs";
import { err, ok } from "@/shared/result";

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
  it("embeds the Latin and Latin Extended woff2 files, and Latin italic, as `Inter`", async () => {
    const css = await interFontCss();
    expect(css.match(/@font-face\{font-family:Inter;/g)).toHaveLength(3);
    expect(css).toContain("src:url(data:font/woff2;base64,d09GMg"); // "wOF2"
    expect(css).not.toMatch(/url\((?!data:)/);
  });
});

describe.skipIf(!hasChromium)("export with real Chromium (Story 5.3)", () => {
  const browser = createPlaywrightExportBrowser();

  it("prints a two-page Presentazione between MAC's intro and outro as a PDF of four 1920×1080 pages, in Inter, W-Group linked", async () => {
    const size = { width: 1920, height: 1080 };
    const pdf = Buffer.from(await browser.pdf(await html("presentazione_16_9", size), size, new AbortController().signal));
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(4);
    // 1920×1080 CSS px = 1440×810 pt.
    const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Math.round(Number(m[1])), Math.round(Number(m[2]))]);
    expect(boxes).toEqual(Array.from({ length: 4 }, () => [1440, 810]));
    expect(text).toMatch(/\/FontName\s*\/[A-Z]{6}\+Inter/);
    // MAC's outro: "W-Group" is a link in the PDF.
    expect(text).toMatch(/\/URI\s*\(https:\/\/w-group\.it\/\)/);
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

  it("bundles a Presentazione and a Carosello into one ZIP: the PDF at the root, Carosello/01.png… (Story 5.4)", async () => {
    const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#c8ff00" } }).png().toBuffer();
    const rows: ExportRecord[] = [];
    const files = new Map<string, Uint8Array>();
    const deps: ExportHandlerDeps = {
      ...sourceDeps(),
      exports: {
        findByHash: async (hash) => ok(rows.find((r) => r.contentHash === hash) ?? null),
        insert: async (r: NewExport) => {
          const record = { ...r, id: `88888888-0000-4000-8000-00000000000${rows.length + 1}`, createdAt: "2026-11-04T10:00:00Z" } as ExportRecord;
          rows.push(record);
          return ok(record);
        },
      },
      storage: {
        upload: async ({ contentHash, format }, bytes) => {
          const path = `exports/${contentHash}/${format}.${format === "presentazione_16_9" ? "pdf" : "zip"}`;
          files.set(path, bytes);
          return ok({ path });
        },
        read: async (path) => {
          const bytes = files.get(path);
          return bytes === undefined ? err({ code: "STORAGE_FAILED", message: "Missing." }) : ok(bytes);
        },
      },
      listCaseMedia: async () => ok([{ id: CASE_IMAGE, kind: "image" }]),
      listClientMedia: async () => ok([{ id: CLIENT_IMAGE, kind: "image" }]),
      getRendition: async () => ok({ url: "https://storage.test/x.png", contentType: "image/png" }),
      getClientRendition: async () => ok({ url: "https://storage.test/y.png", contentType: "image/png" }),
      readClientLogo: async () => ok(null),
      fetchBytes: async () => new Uint8Array(image),
      rasteriseSvg: async () => ok(new Uint8Array()),
      fontCss: interFontCss,
      browser,
      zip: storeZip,
      unzip: readStoredZip,
    };
    const sources = await readExportSources(deps, CASE_ID, ["presentazione_16_9", "carosello_1_1"]);
    if (!sources.ok) throw new Error(sources.error.code);
    const [pdfPages, slides] = sources.value.map((source) => source.pages.length);
    const job = {
      id: "99999999-0000-4000-8000-000000000001",
      kind: "export",
      subjectId: CASE_ID,
      inputHash: bundleHashOf(sources.value),
      payload: { parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }], format: "bundle", formats: ["carosello_1_1", "presentazione_16_9"], requestedBy: ACTOR.id },
      status: "running",
      attempts: 1,
      maxAttempts: 3,
      lockedUntil: null,
      error: null,
      createdAt: "2026-11-04T10:00:00Z",
      updatedAt: "2026-11-04T10:00:00Z",
      finishedAt: null,
    } satisfies Job;

    expect(await makeExportHandler(deps).run(job, new AbortController().signal)).toEqual(ok(undefined));
    expect(rows.map((r) => r.format)).toEqual(["presentazione_16_9", "carosello_1_1", "bundle"]);
    const entries = readStoredZip(files.get(rows[2].path) ?? new Uint8Array());
    const width = Math.max(2, String(slides).length);
    expect(entries.map((e) => e.name)).toEqual([
      "LUM-2026-01 Rebrand Lumen – Presentazione.pdf",
      ...Array.from({ length: slides }, (_, i) => `Carosello/${String(i + 1).padStart(width, "0")}.png`),
    ]);
    expect(Buffer.from(entries[0].bytes).toString("latin1").startsWith("%PDF-")).toBe(true);
    // The case's pages between MAC's intro and outro.
    expect(pdfPageCount(entries[0].bytes)).toBe(pdfPages + 2);
    for (const entry of entries.slice(1)) {
      const meta = await sharp(entry.bytes).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["png", 1080, 1080]);
    }
  }, 180_000);

  it("stops at once when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(browser.pdf("<!doctype html>", { width: 10, height: 10 }, controller.signal)).rejects.toThrow();
  });
});
