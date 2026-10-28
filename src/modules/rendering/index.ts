// Public surface of the rendering module. Code outside this module imports only this file.
// Pure and safe for web code: the format registry (Story 3.3) and the templates (Story 3.4).
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
  starterPages,
  TEMPLATE_TEXT_KEYS,
  templates,
  textStyles,
} from "@/modules/rendering/templates";
export type {
  DefaultPage,
  GridArea,
  Layout,
  TemplateContext,
  TemplateTextKey,
  TemplateVersion,
  TextStyleSpec,
} from "@/modules/rendering/templates";
