// Public surface of the generation module. Code outside this module imports only this file.
// Pure and safe for web code so far (Story 3.3): the case study document schema and
// `upgrade`. The narrative generator (Story 3.6) will live behind `worker.ts`.
import {
  upgrade as upgradeWith,
  validateNewDocument as validateAgainst,
  type CaseStudyDocument,
  type DefaultPages,
} from "@/modules/generation/domain/document";
import { FORMAT_IDS } from "@/modules/rendering";
import type { Result } from "@/shared/result";

export {
  ANIMATION_FITS,
  ANIMATIONS,
  animationElementSchema,
  backgroundSchema,
  BINDING_RECORDS,
  CASE_BINDING_FIELDS,
  bindingSchema,
  blockSchema,
  caseStudyDocumentSchema,
  caseStudyDocumentV0Schema,
  caseStudyDocumentV1Schema,
  CLAIM_ASPECTS,
  CLAIM_PROVENANCES,
  CLIENT_BINDING_FIELDS,
  cropSchema,
  CURRENT_SCHEMA_VERSION,
  DOCUMENT_INVALID,
  DOCUMENT_KINDS,
  DOCUMENT_SCHEMA_UNSUPPORTED,
  ELEMENT_TYPES,
  elementSchema,
  formatPagesSchema,
  gridSchema,
  MATERIAL_REF_KINDS,
  materialRefSchema,
  MAX_RESULT_ROWS,
  MEDIA_FITS,
  PAGE_ROLES,
  PAGE_SECTIONS,
  pageSchema,
  RESULT_ROW_FIELDS,
  templateRefSchema,
  TEXT_ALIGNS,
  TEXT_GROUP_ALIGNS,
  TEXT_STYLES,
  textElementSchema,
} from "@/modules/generation/domain/document";
/** Reference documents (valid v2 case history and client intro; a stored v1 and v0), for tests of other modules. */
export {
  caseHistoryV0,
  caseHistoryV1,
  caseHistoryV2,
  clientIntroV1,
  clientIntroV2,
  LEGACY_FORMAT_IDS,
} from "@/modules/generation/domain/document-fixtures";
export type {
  AnimationElement,
  AnimationId,
  Background,
  Binding,
  BindingRecord,
  Block,
  CaseStudyDocument,
  CaseStudyDocumentV0,
  CaseStudyDocumentV1,
  ClaimAspect,
  ClaimProvenance,
  Crop,
  DefaultPages,
  DocumentElement,
  DocumentIssue,
  DocumentKind,
  DocumentMaterialRef,
  ElementType,
  FormatPages,
  Grid,
  ImageElement,
  MediaFit,
  Page,
  PageRole,
  PageSection,
  TextAlign,
  TextElement,
  TextGroupAlign,
  TextGroupElement,
  TextStyle,
  VideoElement,
} from "@/modules/generation/domain/document";

/**
 * The template's default pages of a format, which v1 → v2 gives every registry
 * format. TODO(Story 3.4): read them from `rendering/templates/{id}/v{n}/`.
 */
const defaultPages: DefaultPages = () => [];

/**
 * Takes a stored document of any known version (v0, v1, v2) to v2 in memory; the
 * input is never mutated or written back. v1 → v2 drops format keys outside the
 * registry and gives every registry format the template's default pages. Errors:
 * `DOCUMENT_SCHEMA_UNSUPPORTED` (unknown, missing or newer version),
 * `DOCUMENT_INVALID` (zod issues in `details.issues`).
 */
export function upgrade(doc: unknown): Result<CaseStudyDocument> {
  return upgradeWith(doc, { defaultPages, formatIds: FORMAT_IDS });
}

/**
 * Validates the document of a new revision. Errors: `DOCUMENT_SCHEMA_UNSUPPORTED`
 * (not v2), `DOCUMENT_INVALID` (zod issues in `details.issues`: e.g.
 * `unrecognized_keys` for a client value, a text with both or neither of `text`
 * and `binding`, a duplicate page key, block or element id within a format, a crop
 * without `fit: crop`, a size bound), `FORMAT_NOT_IN_REVISION` (not one page list
 * for exactly each registry format; `details: { missing, extra, extraCount }`,
 * `extra` capped at 10 keys).
 */
export function validateNewDocument(doc: unknown): Result<CaseStudyDocument> {
  return validateAgainst(doc, FORMAT_IDS);
}
