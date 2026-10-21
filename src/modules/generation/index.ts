// Public surface of the generation module. Code outside this module imports only this file.
// Pure and safe for web code so far (Story 3.3): the case study document schema and
// `upgrade`. The narrative generator (Story 3.6) will live behind `worker.ts`.
import { validateNewDocument as validateAgainst, type CaseStudyDocument } from "@/modules/generation/domain/document";
import { FORMAT_IDS } from "@/modules/rendering";
import type { Result } from "@/shared/result";

export {
  blockSchema,
  caseStudyDocumentSchema,
  caseStudyDocumentV0Schema,
  checkSchema,
  CLAIM_ASPECTS,
  CLAIM_PROVENANCES,
  claimSchema,
  CLIENT_SECTIONS,
  CURRENT_SCHEMA_VERSION,
  DOCUMENT_INVALID,
  DOCUMENT_KINDS,
  DOCUMENT_SCHEMA_UNSUPPORTED,
  formatEntrySchema,
  MATERIAL_REF_KINDS,
  materialRefSchema,
  NARRATIVE_SECTIONS,
  templateRefSchema,
  upgrade,
} from "@/modules/generation/domain/document";
/** Reference documents (valid v1 case history and client intro, a stored v0), for tests of other modules. */
export { caseHistoryV0, caseHistoryV1, clientIntroV1 } from "@/modules/generation/domain/document-fixtures";
export type {
  Block,
  CaseStudyDocument,
  CaseStudyDocumentV0,
  Check,
  Claim,
  ClaimAspect,
  ClaimProvenance,
  DocumentIssue,
  DocumentKind,
  DocumentMaterialRef,
  FormatEntry,
} from "@/modules/generation/domain/document";

/**
 * Validates the document of a new revision. Errors: `DOCUMENT_SCHEMA_UNSUPPORTED`
 * (not the current schema version), `DOCUMENT_INVALID` (zod issues in
 * `details.issues`: e.g. path `blocks` for a missing or misordered narrative,
 * `unrecognized_keys` for a client value, a slot asset outside `selectedMedia`, a
 * size bound), `FORMAT_NOT_IN_REVISION` (not one entry for exactly each registry
 * format; `details: { missing, extra, extraCount }`, `extra` capped at 10 keys).
 * `upgrade(doc)` (stored documents) returns `DOCUMENT_SCHEMA_UNSUPPORTED` or
 * `DOCUMENT_INVALID`.
 */
export function validateNewDocument(doc: unknown): Result<CaseStudyDocument> {
  return validateAgainst(doc, FORMAT_IDS);
}
