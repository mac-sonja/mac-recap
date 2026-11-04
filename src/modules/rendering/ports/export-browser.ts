/**
 * The headless browser that turns an export's HTML into a file (Story 5.3): Playwright
 * Chromium in the worker (`adapters/playwright/export-browser.ts`), a fake in unit tests.
 * Web requests never reach it (AD-10). The HTML is self-contained (fonts and images
 * inline as `data:` URLs); the browser loads nothing from the network.
 */
export interface ExportBrowser {
  /** A PDF with one `size` page per `section.mr-page`. Throws on failure or when `signal` aborts. */
  pdf(html: string, size: { width: number; height: number }, signal: AbortSignal): Promise<Uint8Array>;
  /** One PNG of `size` per `section.mr-page`, in order. Throws on failure or when `signal` aborts. */
  pngs(html: string, size: { width: number; height: number }, signal: AbortSignal): Promise<Uint8Array[]>;
}
