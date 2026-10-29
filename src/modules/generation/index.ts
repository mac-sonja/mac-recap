// Public surface of the generation module. Code outside this module imports only this file.
// Pure and safe for web code so far (Story 3.3): the case study document schema and
// `upgrade` (v1 → v2 reads the template's starter pages from rendering, Story 3.4). The narrative generator (Story 3.6) will live behind `worker.ts`.
import {
  upgrade as upgradeWith,
  validateNewDocument as validateAgainst,
  type CaseStudyDocument,
  type DefaultPages,
} from "@/modules/generation/domain/document";
import { FORMAT_IDS, starterPages, type TemplateContext } from "@/modules/rendering";
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
  dividerElementSchema,
  DOCUMENT_INVALID,
  DOCUMENT_KINDS,
  DOCUMENT_SCHEMA_UNSUPPORTED,
  ELEMENT_TYPES,
  elementSchema,
  formatPagesSchema,
  gridSchema,
  MATERIAL_REF_KINDS,
  materialRefSchema,
  MAX_BINDINGS,
  MAX_RESULT_ROWS,
  MIN_BINDINGS,
  MEDIA_FITS,
  PAGE_DECORATIONS,
  PAGE_ROLES,
  PAGE_SECTIONS,
  pageSchema,
  RESULT_ROW_FIELDS,
  ROW_ALIGNS,
  rowElementSchema,
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
  DividerElement,
  ElementType,
  FormatPages,
  Grid,
  ImageElement,
  LogosElement,
  MediaFit,
  Page,
  PageDecoration,
  PageRole,
  PageSection,
  RowAlign,
  RowElement,
  ServicesElement,
  TextAlign,
  TextElement,
  TextGroupAlign,
  TextGroupElement,
  TextStyle,
  VideoElement,
} from "@/modules/generation/domain/document";

/** Story 3.10's test draft and the document builder Story 3.7 reuses with the AI's texts (pure). */
export {
  buildCaseDocument,
  buildTestDraft,
  TEST_DRAFT_MARKER,
  testDraftTexts,
} from "@/modules/generation/application/test-draft";
export type { CaseDocumentInput, DraftText, TestDraftForm, TestDraftInput } from "@/modules/generation/application/test-draft";

/** Story 3.7: the generate job's payload, input hash and the text-source seam Story 3.6 replaces (pure; the handler is in `worker.ts`). */
export { generateInputHash, generatePayloadSchema, JOB_OK } from "@/modules/generation/application/generate-case";
export type { GenerateManifest, GeneratePayload } from "@/modules/generation/application/generate-case";
export { testDraftTextSource } from "@/modules/generation/application/text-source";
export type { TextSource, TextSourceInput } from "@/modules/generation/application/text-source";

/** The uuid prefix of the ids an upgrade gives the template's pages; a 12-digit counter per format follows. */
export const UPGRADE_ID_PREFIX = "00000000-0000-4000-8000-";

/**
 * What v1 → v2 builds the template's starter pages from: no texts, no images (empty
 * image blocks), and ids from a counter, so reading the same stored document twice
 * gives the same document. A v1 document says nothing of the case's result rows or
 * testimonial, so Risultati e testimonial is left out (it comes back from Pagine di
 * default). No v1 revision exists on any environment (Story 3.3 v2).
 */
const upgradeContext = (): TemplateContext => {
  let counter = 0;
  return {
    newId: () => `${UPGRADE_ID_PREFIX}${String(++counter).padStart(12, "0")}`,
    texts: {},
    images: [],
    resultRows: 0,
    hasTestimonial: false,
  };
};

/** The template's starter pages of a format, which v1 → v2 gives every registry format (`mac-case@1` is v1's template ref too). */
const defaultPages: DefaultPages = (template, kind, formatId) => starterPages(template, kind, formatId, upgradeContext());

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
