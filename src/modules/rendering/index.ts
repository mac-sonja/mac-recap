// Public surface of the rendering module. Code outside this module imports only this file.
// Pure and safe for web code: the format registry (Story 3.3), the templates (Story 3.4),
// their renderers and the overflow helper (Story 3.5), and composeParts for combined files.
// The templates import generation's types only (`import type`): generation's index
// imports this module at runtime, so there is no cycle.
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
  defaultPages,
  layouts,
  renderFormat,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  templates,
  textStyles,
} from "@/modules/rendering/templates";
export { composeParts, renderComposed } from "@/modules/rendering/compose";
export type { CasePart, ClientIntroPart, ComposedFile, ComposedSegment, ComposePart } from "@/modules/rendering/compose";
export { measureOverflow } from "@/modules/rendering/overflow";
export type { BlockOverflow, OverflowReport, PageOverflow } from "@/modules/rendering/overflow";
export type {
  BoundResult,
  BoundTestimonial,
  BoundValues,
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
