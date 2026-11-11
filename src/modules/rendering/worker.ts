// Worker-only entry of the rendering module (Story 5.3). Only src/worker imports this
// file: it pulls in Playwright and sharp, which web code must never reach (AD-10;
// test/web-imports.test.ts). index.ts and server.ts never import it.
import * as caseStudy from "@/modules/case-study";
import type { JobHandler } from "@/modules/jobs";
import * as material from "@/modules/material";
import { readCollection } from "@/modules/rendering/adapters/collection/read-collection";
import { interFontCss } from "@/modules/rendering/adapters/fonts/inter";
import { fetchBytes } from "@/modules/rendering/adapters/http/fetch-bytes";
import { createPlaywrightExportBrowser } from "@/modules/rendering/adapters/playwright/export-browser";
import { rasteriseSvgLogo } from "@/modules/rendering/adapters/sharp/svg-logo";
import { createSupabaseExportRepository } from "@/modules/rendering/adapters/supabase/export-repository";
import { createSupabaseExportStorage } from "@/modules/rendering/adapters/supabase/export-storage";
import { readStoredZip, storeZip } from "@/modules/rendering/adapters/zip/store-zip";
import { makeExportHandler, type ExportHandlerDeps } from "@/modules/rendering/application/export-handler";

/**
 * The `export` job handler, wired to Supabase, Playwright Chromium, sharp (SVG logos) and
 * the inline Inter font. Register it in the worker as `{ export: exportHandler() }`.
 * `overrides` replaces single dependencies (tests).
 */
export function exportHandler(overrides: Partial<ExportHandlerDeps> = {}): JobHandler {
  return makeExportHandler({
    getCase: caseStudy.get,
    getLiveRevision: caseStudy.getLiveRevision,
    getClientInfoForCase: caseStudy.getClientInfoForCase,
    getDetailsForm: material.getDetailsForm,
    getClient: caseStudy.getClient,
    getClientIntro: caseStudy.getClientIntro,
    listClientCasesInOrder: caseStudy.listClientCasesInOrder,
    getCollection: readCollection,
    exports: createSupabaseExportRepository(),
    storage: createSupabaseExportStorage(),
    listCaseMedia: (caseId) => material.listAssets({ caseId }),
    listClientMedia: (clientId) => caseStudy.listClientMaterial({ clientId }),
    getRendition: material.getRendition,
    getClientRendition: material.getClientRendition,
    readClientLogo: caseStudy.readClientLogo,
    fetchBytes,
    rasteriseSvg: rasteriseSvgLogo,
    fontCss: interFontCss,
    browser: createPlaywrightExportBrowser(),
    zip: storeZip,
    unzip: readStoredZip,
    ...overrides,
  });
}
