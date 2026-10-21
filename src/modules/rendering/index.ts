// Public surface of the rendering module. Code outside this module imports only this file.
// Pure and safe for web code: only the format registry so far (Story 3.3).
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
