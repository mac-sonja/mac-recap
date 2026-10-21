import { z } from "zod";
import { err, ok, type AppError, type Result } from "@/shared/result";

/**
 * The case study document (Story 3.3, AD-18): what a revision holds. One shared
 * part (narrative blocks with stable ids, their claims and check state, and the
 * selected media) and one entry per format of the registry (variant, slot →
 * asset, spacing, text scale, font pairing).
 *
 * The document never holds a client value: the About area (logo, name,
 * industries, description) is filled at render time from the client's current
 * info. Every object is strict, so a stray `about` or `clientName` key is an
 * unknown-key error.
 *
 * Stored documents are read through `upgrade`, which takes any known older
 * version to the current one in memory; it is never written back.
 */
export const CURRENT_SCHEMA_VERSION = 1;

export const DOCUMENT_KINDS = ["case_history", "client_intro"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const CLAIM_ASPECTS = ["technical", "graphic"] as const;
export type ClaimAspect = (typeof CLAIM_ASPECTS)[number];

export const CLAIM_PROVENANCES = ["generated", "human_edited", "human_added"] as const;
export type ClaimProvenance = (typeof CLAIM_PROVENANCES)[number];

/** A case history opens with these three sections, in this order, each exactly once. */
export const NARRATIVE_SECTIONS = ["challenge", "approach", "result"] as const;

/** Section names reserved for client info, which is never stored in a document. */
export const CLIENT_SECTIONS = ["about"] as const;

/**
 * The material a claim can cite. Mirrors `MaterialRef` of `@/modules/material`
 * (domain code may not import another module; `src/modules/generation/index.test.ts`
 * keeps the two in sync). `client_field` refs arrive with Story 3.6.
 */
export const MATERIAL_REF_KINDS = ["asset", "form_field"] as const;
export const MAX_REF_ID_CHARS = 64;

/** Size bounds of a document. */
export const MAX_TEXT_CHARS = 5_000;
export const MAX_CLAIMS_PER_BLOCK = 50;
export const MAX_BLOCKS = 50;
export const MAX_SELECTED_MEDIA = 100;
export const MAX_TEXT_HASH_CHARS = 128;
/** The most unknown format keys named in a `FORMAT_NOT_IN_REVISION` error. */
const MAX_SHOWN_EXTRA_FORMATS = 10;

const textSchema = z.string().max(MAX_TEXT_CHARS, `At most ${MAX_TEXT_CHARS} characters.`);

export const materialRefSchema = z.strictObject({
  kind: z.enum(MATERIAL_REF_KINDS),
  id: z.string().max(MAX_REF_ID_CHARS),
});
export type DocumentMaterialRef = z.infer<typeof materialRefSchema>;

/** `{templateId}@{version}`, e.g. `mac-case@1` (templates live at `rendering/templates/{id}/v{n}/`). */
export const templateRefSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*@[1-9][0-9]*$/, "Must be {templateId}@{version}.");

const sectionSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case.")
  .refine((s) => !(CLIENT_SECTIONS as readonly string[]).includes(s), "Client info is never stored in a document.");

export const claimSchema = z.strictObject({
  claimId: z.uuid(),
  text: textSchema,
  aspect: z.enum(CLAIM_ASPECTS),
  provenance: z.enum(CLAIM_PROVENANCES),
  sourceRefs: z.array(materialRefSchema).optional(),
});
export type Claim = z.infer<typeof claimSchema>;

/** Who checked a block, when, and the hash of the text they checked (null: never checked). */
export const checkSchema = z
  .strictObject({
    by: z.uuid(),
    at: z.iso.datetime({ offset: true }),
    textHash: z.string().min(1).max(MAX_TEXT_HASH_CHARS),
  })
  .nullable();
export type Check = z.infer<typeof checkSchema>;

export const blockSchema = z.strictObject({
  blockId: z.uuid(),
  section: sectionSchema,
  text: textSchema,
  claims: z.array(claimSchema).max(MAX_CLAIMS_PER_BLOCK),
  check: checkSchema,
});
export type Block = z.infer<typeof blockSchema>;

/**
 * One format's layout. `variant`, `spacing` and `fontPairing` name options the
 * template designed (Story 3.4); `slots` maps each slot of the variant to an
 * asset id, or null when empty.
 */
export const formatEntrySchema = z.strictObject({
  variant: z.string().min(1),
  slots: z.record(z.string().min(1), z.uuid().nullable()),
  spacing: z.string().min(1),
  textScale: z.number().positive(),
  fontPairing: z.string().min(1),
});
export type FormatEntry = z.infer<typeof formatEntrySchema>;

const hasDuplicates = (values: readonly string[]) => new Set(values).size !== values.length;

export const caseStudyDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    kind: z.enum(DOCUMENT_KINDS),
    template: templateRefSchema,
    blocks: z.array(blockSchema).max(MAX_BLOCKS),
    selectedMedia: z.array(z.uuid()).max(MAX_SELECTED_MEDIA),
    // Keyed by format registry id. The keys are checked against the registry when a
    // revision is created (`validateNewDocument`) and fixed from then on.
    formats: z.record(z.string(), formatEntrySchema),
  })
  .superRefine((doc, ctx) => {
    if (doc.kind === "case_history") {
      const sections = doc.blocks.map((b) => b.section);
      const opening = sections.slice(0, NARRATIVE_SECTIONS.length);
      const narrativeCount = sections.filter((s) => (NARRATIVE_SECTIONS as readonly string[]).includes(s)).length;
      if (opening.join() !== NARRATIVE_SECTIONS.join() || narrativeCount !== NARRATIVE_SECTIONS.length) {
        ctx.addIssue({
          code: "custom",
          path: ["blocks"],
          message: "A case history opens with challenge, approach and result, in that order, each exactly once.",
        });
      }
    }
    if (hasDuplicates(doc.blocks.map((b) => b.blockId))) {
      ctx.addIssue({ code: "custom", path: ["blocks"], message: "Block ids must be unique." });
    }
    if (hasDuplicates(doc.blocks.flatMap((b) => b.claims.map((c) => c.claimId)))) {
      ctx.addIssue({ code: "custom", path: ["blocks"], message: "Claim ids must be unique." });
    }
    if (hasDuplicates(doc.selectedMedia)) {
      ctx.addIssue({ code: "custom", path: ["selectedMedia"], message: "Each asset is selected at most once." });
    }
    // A slot shows only selected media.
    const selected = new Set(doc.selectedMedia);
    for (const [formatId, entry] of Object.entries(doc.formats)) {
      for (const [slotId, assetId] of Object.entries(entry.slots)) {
        if (assetId !== null && !selected.has(assetId)) {
          ctx.addIssue({ code: "custom", path: ["formats", formatId, "slots", slotId], message: "A slot's asset must be in selectedMedia." });
        }
      }
    }
  });
export type CaseStudyDocument = z.infer<typeof caseStudyDocumentSchema>;

// ---------------------------------------------------------------------------
// Version 0: the pre-release shape, kept so stored v0 documents still read.
// The template was two fields, blocks had `id`, claims had no provenance (all
// were generated), blocks had no check state, and the media set was `media`.
// ---------------------------------------------------------------------------

export const caseStudyDocumentV0Schema = z.strictObject({
  schemaVersion: z.literal(0),
  kind: z.enum(DOCUMENT_KINDS),
  templateId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  templateVersion: z.number().int().positive(),
  blocks: z.array(
    z.strictObject({
      id: z.uuid(),
      section: sectionSchema,
      text: z.string(),
      claims: z.array(
        z.strictObject({
          claimId: z.uuid(),
          text: z.string(),
          aspect: z.enum(CLAIM_ASPECTS),
          sourceRefs: z.array(materialRefSchema).optional(),
        }),
      ),
    }),
  ),
  media: z.array(z.uuid()),
  formats: z.record(z.string(), formatEntrySchema),
});
export type CaseStudyDocumentV0 = z.infer<typeof caseStudyDocumentV0Schema>;

function fromV0(doc: CaseStudyDocumentV0): unknown {
  return {
    schemaVersion: 1,
    kind: doc.kind,
    template: `${doc.templateId}@${doc.templateVersion}`,
    blocks: doc.blocks.map((b) => ({
      blockId: b.id,
      section: b.section,
      text: b.text,
      claims: b.claims.map((c) => ({ ...c, provenance: "generated" })),
      check: null,
    })),
    selectedMedia: [...doc.media],
    formats: structuredClone(doc.formats),
  };
}

// ---------------------------------------------------------------------------

export const DOCUMENT_SCHEMA_UNSUPPORTED = "DOCUMENT_SCHEMA_UNSUPPORTED" as const;
export const DOCUMENT_INVALID = "DOCUMENT_INVALID" as const;

export interface DocumentIssue {
  path: string;
  code: string;
  message: string;
}

const issuesOf = (error: z.ZodError): DocumentIssue[] =>
  error.issues.map((issue) => ({ path: issue.path.map(String).join("."), code: issue.code, message: issue.message }));

function invalid(error: z.ZodError, version: number): Result<never> {
  const issues = issuesOf(error);
  const paths = [...new Set(issues.map((i) => i.path || "(document)"))];
  return err({
    code: DOCUMENT_INVALID,
    message: `The case study document is invalid: ${paths.join(", ")}.`,
    details: { schemaVersion: version, issues },
  });
}

const unsupported = (version: unknown): Result<never> =>
  err({
    code: DOCUMENT_SCHEMA_UNSUPPORTED,
    message: "This case study document version is not supported.",
    details: { schemaVersion: typeof version === "number" && Number.isFinite(version) ? version : null },
  });

const versionOf = (doc: unknown): unknown =>
  typeof doc === "object" && doc !== null && !Array.isArray(doc) ? (doc as { schemaVersion?: unknown }).schemaVersion : undefined;

/** Known older versions and the step that takes each one version up. */
const UPGRADES: Readonly<Record<number, { schema: z.ZodType; up: (doc: never) => unknown }>> = {
  0: { schema: caseStudyDocumentV0Schema, up: fromV0 as (doc: never) => unknown },
};

/**
 * Takes a stored document of any known version to the current one, in memory
 * (the input is never mutated, and nothing is written back). An unknown, missing
 * or newer version is `DOCUMENT_SCHEMA_UNSUPPORTED`; a known version that fails
 * its schema is `DOCUMENT_INVALID` with the zod issues in `details.issues`.
 */
export function upgrade(doc: unknown): Result<CaseStudyDocument> {
  let version = versionOf(doc);
  let current: unknown = doc;
  while (version !== CURRENT_SCHEMA_VERSION) {
    if (typeof version !== "number" || !Object.hasOwn(UPGRADES, version)) return unsupported(version);
    const step = UPGRADES[version];
    const parsed = step.schema.safeParse(current);
    if (!parsed.success) return invalid(parsed.error, version);
    current = step.up(parsed.data as never);
    version = versionOf(current);
  }
  const parsed = caseStudyDocumentSchema.safeParse(current);
  return parsed.success ? ok(parsed.data) : invalid(parsed.error, CURRENT_SCHEMA_VERSION);
}

export const FORMAT_NOT_IN_REVISION = "FORMAT_NOT_IN_REVISION" as const;

/**
 * Validates the document of a new revision: it must be the current version
 * (anything else is `DOCUMENT_SCHEMA_UNSUPPORTED`), pass the schema
 * (`DOCUMENT_INVALID`, issues in `details.issues`), and have one format entry
 * for exactly each id of `formatIds`, the format registry
 * (`FORMAT_NOT_IN_REVISION`, naming the missing and extra ids). The module index
 * binds `formatIds` to the registry.
 */
export function validateNewDocument(doc: unknown, formatIds: readonly string[]): Result<CaseStudyDocument, AppError> {
  const version = versionOf(doc);
  if (version !== CURRENT_SCHEMA_VERSION) return unsupported(version);
  const parsed = caseStudyDocumentSchema.safeParse(doc);
  if (!parsed.success) return invalid(parsed.error, CURRENT_SCHEMA_VERSION);
  const keys = Object.keys(parsed.data.formats);
  const missing = formatIds.filter((id) => !keys.includes(id));
  const extraKeys = keys.filter((key) => !formatIds.includes(key));
  const extra = extraKeys.slice(0, MAX_SHOWN_EXTRA_FORMATS).map((key) => Array.from(key).slice(0, MAX_REF_ID_CHARS).join(""));
  if (missing.length > 0 || extraKeys.length > 0) {
    return err({
      code: FORMAT_NOT_IN_REVISION,
      message: "A new revision has one entry for exactly each registry format.",
      details: { missing, extra, extraCount: extraKeys.length },
    });
  }
  return ok(parsed.data);
}
