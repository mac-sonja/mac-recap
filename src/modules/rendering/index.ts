// Public surface of the rendering module. Code outside this module imports only this file (server actions also `server.ts`, src/worker also `worker.ts`).
// Pure and safe for web code: the format registry (Story 3.3), the templates (Story 3.4),
// their renderers and the overflow helper (Story 3.5), and composeParts for combined files.
// The templates import generation's types only (`import type`): generation's index
// imports this module at runtime, so there is no cycle.
// Exports (Story 5.3) live in two other entries, so this file stays safe for client
// components: `server.ts` (the export use cases, for server actions) and `worker.ts`
// (the `export` job handler with Playwright, for src/worker only).
export {
  FILE_TYPES,
  FORMAT_IDS,
  FORMAT_NOT_IN_REVISION,
  FORMATS,
  formatIdSchema,
  getFormat,
  isFormatId,
  PAGE_MODELS,
  requireFormat,
} from "@/modules/rendering/domain/formats";
export type { FileType, Format, FormatId, PageModel } from "@/modules/rendering/domain/formats";
export {
  CASE_TEMPLATE,
  CLIENT_TEMPLATE,
  CLIENT_TEMPLATE_TEXT_KEYS,
  defaultPages,
  layouts,
  renderFormat,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  templates,
  textStyles,
} from "@/modules/rendering/templates";
// The formats that export today (Story 5.3/5.4), pure: the picker offers exactly these.
export { EXPORT_FORMAT_IDS, isExportFormatId } from "@/modules/rendering/domain/export";
export type { ExportFormatId } from "@/modules/rendering/domain/export";
export { composeParts, renderComposed } from "@/modules/rendering/compose";
export type { BrandPart, CasePart, ClientIntroPart, ComposedFile, ComposedSegment, ComposeOptions, ComposePart } from "@/modules/rendering/compose";
// MAC's own intro and outro of every Presentazione file: code constants, drawn by `renderFormat(BRAND_TEMPLATE, …)`.
export {
  BRAND_FORMAT,
  BRAND_INTRO,
  BRAND_INTRO_KEY,
  BRAND_OUTRO,
  BRAND_OUTRO_KEY,
  BRAND_PAGES,
  BRAND_PART_ID,
  BRAND_TEMPLATE,
  BRAND_TITLE,
  BRAND_TITLE_ELEMENT_ID,
  brandPageCount,
  hasBrandPages,
  isBrandPage,
  isBrandPageKey,
  templateOfPage,
  withBrandPages,
} from "@/modules/rendering/brand/pages";
// Story 5.11b: a collection's edits laid over its parts, one rule set for its page and its export.
export {
  applyCollectionEdits,
  BRAND_PART_KEY,
  collectionPartKey,
  freeTextIn,
  isFreeText,
  NO_COLLECTION_EDITS,
  normalisePartKey,
  orderedPages,
  pageTextEdits,
  wordedPage,
} from "@/modules/rendering/collection-edits";
export type {
  AppliedCollectionEdits,
  ApplyCollectionEditsOptions,
  CollectionEditSet,
  CollectionHiddenPageRef,
  CollectionPageOrderRef,
  CollectionPartKey,
  CollectionTextOverride,
  EffectivePartEdits,
} from "@/modules/rendering/collection-edits";
export { measureOverflow } from "@/modules/rendering/overflow";
export type { BlockOverflow, OverflowReport, PageOverflow } from "@/modules/rendering/overflow";
export type {
  BoundResult,
  BoundTestimonial,
  BoundValues,
  ClientTemplateTextKey,
  DefaultPage,
  GridArea,
  Layout,
  RenderAsset,
  RenderInput,
  RenderOptions,
  TemplateContext,
  TemplateTextKey,
  TemplateVersion,
  TextStyleSpec,
} from "@/modules/rendering/templates";
