import { chromium, type Browser, type Page } from "playwright";
import type { ExportBrowser } from "@/modules/rendering/ports/export-browser";

/** How long loading the export's HTML (fonts and images are inline) may take. */
const LOAD_TIMEOUT_MS = 60_000;

/** Waits for the inline fonts and every image to be decoded. A string, so no bundler helper leaks into the page. */
const READY = `Promise.all([document.fonts.ready, ...Array.from(document.images, (img) => img.decode().catch(() => undefined))]).then(() => document.fonts.status)`;

const PAGE_SELECTOR = "section.mr-page";

/** `promise`, or a rejection once `ms` pass first (the timer never outlives the race). */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Playwright Chromium for exports (Story 5.3), worker only. One browser per file, closed
 * afterwards (and at once when `signal` aborts). The context is offline and every request
 * is aborted: the HTML carries its fonts and images as `data:` URLs, so nothing is fetched.
 */
export function createPlaywrightExportBrowser(launch: () => Promise<Browser> = () => chromium.launch()): ExportBrowser {
  async function withPage<T>(html: string, size: { width: number; height: number }, signal: AbortSignal, work: (page: Page) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const browser = await launch();
    const close = () => void browser.close().catch(() => undefined);
    signal.addEventListener("abort", close, { once: true });
    try {
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, offline: true });
      await context.route("**/*", (route) => route.abort());
      const page = await context.newPage();
      await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
      await page.setContent(html, { waitUntil: "load", timeout: LOAD_TIMEOUT_MS });
      await withTimeout(page.evaluate(READY), LOAD_TIMEOUT_MS, "fonts and images did not load in time");
      signal.throwIfAborted();
      const result = await work(page);
      signal.throwIfAborted();
      return result;
    } finally {
      signal.removeEventListener("abort", close);
      await browser.close().catch(() => undefined);
    }
  }

  return {
    pdf: (html, size, signal) =>
      withPage(html, size, signal, async (page) => {
        const pdf = await page.pdf({
          width: `${size.width}px`,
          height: `${size.height}px`,
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        return new Uint8Array(pdf);
      }),

    pngs: (html, size, signal) =>
      withPage(html, size, signal, async (page) => {
        const sections = page.locator(PAGE_SELECTOR);
        const count = await sections.count();
        const shots: Uint8Array[] = [];
        for (let i = 0; i < count; i++) {
          signal.throwIfAborted();
          shots.push(new Uint8Array(await sections.nth(i).screenshot({ type: "png", animations: "disabled" })));
        }
        return shots;
      }),
  };
}
