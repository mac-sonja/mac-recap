import { z } from "zod";
import { err, ok, type AppError, type Result } from "@/shared/result";

/**
 * The case study document (Story 3.3 v2, AD-18, C29–C30): what a revision holds.
 * One page list per format of the registry. A page is a bento grid of blocks, and a
 * block holds typed elements stacked top to bottom. Each format owns its pages: an
 * edit in one format never reaches another, and the same ids may appear in two
 * formats as independent copies.
 *
 * The document never holds a client or case value: client name, sector, logo and
 * case year or services are stored as bindings (`{ record, field }`) that renderers
 * read at render time (answer 2). Every object is strict, so a stray `about` or
 * `clientName` key is an unknown-key error (AD-22).
 *
 * Stored documents are read through `upgrade`, which takes any known older version
 * (v0 → v1 → v2) to the current one in memory; it is never written back. Only the
 * current version is accepted for a new revision (`validateNewDocument`).
 */
export const CURRENT_SCHEMA_VERSION = 2;

export const DOCUMENT_KINDS = ["case_history", "client_intro"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const CLAIM_ASPECTS = ["technical", "graphic"] as const;
export type ClaimAspect = (typeof CLAIM_ASPECTS)[number];

export const CLAIM_PROVENANCES = ["generated", "human_edited", "human_added"] as const;
export type ClaimProvenance = (typeof CLAIM_PROVENANCES)[number];

/**
 * The material a text can cite. Mirrors `MaterialRef` of `@/modules/material`
 * (domain code may not import another module; `src/modules/generation/index.test.ts`
 * keeps the two in sync). `client_field` refs arrive with Story 3.6.
 */
export const MATERIAL_REF_KINDS = ["asset", "form_field"] as const;
export const MAX_REF_ID_CHARS = 64;

/** Size bounds of a document. */
export const MAX_TEXT_CHARS = 5_000;
export const MAX_NAME_CHARS = 100;
export const MAX_PAGES_PER_FORMAT = 50;
/** A page's bento grid holds at most six blocks (C30). */
export const MAX_BLOCKS_PER_PAGE = 6;
export const MAX_ELEMENTS_PER_BLOCK = 30;
export const MAX_ITEMS_PER_GROUP = 20;
export const MAX_GRID_TRACKS = 12;
export const MAX_ANIMATION_ASSETS = 30;
export const MAX_SOURCE_REFS = 50;
/** The most unknown format keys named in a `FORMAT_NOT_IN_REVISION` error. */
const MAX_SHOWN_EXTRA_FORMATS = 10;

const textSchema = z.string().max(MAX_TEXT_CHARS, `At most ${MAX_TEXT_CHARS} characters.`);
const nameSchema = z.string().min(1).max(MAX_NAME_CHARS);

export const materialRefSchema = z.strictObject({
  kind: z.enum(MATERIAL_REF_KINDS),
  id: z.string().max(MAX_REF_ID_CHARS),
});
export type DocumentMaterialRef = z.infer<typeof materialRefSchema>;

/** `{templateId}@{version}`, e.g. `mac-case@1` (templates live at `rendering/templates/{id}/v{n}/`). */
export const templateRefSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*@[1-9][0-9]*$/, "Must be {templateId}@{version}.");

// ---------------------------------------------------------------------------
// Version 2 (current): per-format pages, blocks and elements.
// ---------------------------------------------------------------------------

/** `#rrggbb`. */
const hexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be #rrggbb.");

/** A page's or block's background: a colour, transparent, or an image from the case's or client's media. */
export const backgroundSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("colour"), value: hexColourSchema }),
  z.strictObject({ kind: z.literal("transparent") }),
  z.strictObject({ kind: z.literal("image"), assetId: z.uuid() }),
]);
export type Background = z.infer<typeof backgroundSchema>;

/** The seven text styles (C32): Etichetta, Titolo XL, Titolo, Sottotitolo, Testo, Numero, Citazione. */
export const TEXT_STYLES = ["lab", "xl", "title", "sub", "text", "num", "quote"] as const;
export type TextStyle = (typeof TEXT_STYLES)[number];

export const TEXT_ALIGNS = ["left", "centre", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** The records a text can be bound to (answer 2): the client's and the case's. */
export const BINDING_RECORDS = ["client", "case"] as const;
export type BindingRecord = (typeof BINDING_RECORDS)[number];

/** The client's fields a text can be bound to. The logo is read by the `logos` element, not a binding. */
export const CLIENT_BINDING_FIELDS = ["name", "sector", "description", "resultLabel", "resultValue", "testimonialQuote", "testimonialAuthor"] as const;
/** The case's fields a text can be bound to. The services are read by the `services` element, not a binding. */
export const CASE_BINDING_FIELDS = ["year", "resultLabel", "resultValue", "testimonialQuote", "testimonialAuthor"] as const;
/** Fields of a typed result row (Story 2.21): they take the row's `index`, and no other field does. */
export const RESULT_ROW_FIELDS = ["resultLabel", "resultValue"] as const;
/** At most three result rows (Story 2.21). */
export const MAX_RESULT_ROWS = 3;

const indexOnlyOnResultRows = (binding: { field: string; index?: number }, ctx: z.RefinementCtx) => {
  const isRow = (RESULT_ROW_FIELDS as readonly string[]).includes(binding.field);
  if (isRow && binding.index === undefined) {
    ctx.addIssue({ code: "custom", path: ["index"], message: "A result row field needs the row's index." });
  }
  if (!isRow && binding.index !== undefined) {
    ctx.addIssue({ code: "custom", path: ["index"], message: "Only a result row field takes an index." });
  }
};

const rowIndexSchema = z.number().int().min(0).max(MAX_RESULT_ROWS - 1);

/**
 * A text bound to a field of the client's or case's record (e.g.
 * `{ record: "client", field: "name" }`, or `{ record: "case", field: "resultValue", index: 0 }`
 * for a result row): the document holds no value.
 */
export const bindingSchema = z.discriminatedUnion("record", [
  z.strictObject({ record: z.literal("client"), field: z.enum(CLIENT_BINDING_FIELDS), index: rowIndexSchema.optional() }).superRefine(indexOnlyOnResultRows),
  z.strictObject({ record: z.literal("case"), field: z.enum(CASE_BINDING_FIELDS), index: rowIndexSchema.optional() }).superRefine(indexOnlyOnResultRows),
]);
export type Binding = z.infer<typeof bindingSchema>;

/** A text holds exactly one of `text` (its own words) or `binding` (a record field read at render time). */
export const textElementSchema = z
  .strictObject({
    elementId: z.uuid(),
    type: z.literal("text"),
    style: z.enum(TEXT_STYLES),
    /** `#rrggbb` or transparent; defaults to the template's (`#012234`). */
    colour: z.union([hexColourSchema, z.literal("transparent")]).optional(),
    align: z.enum(TEXT_ALIGNS).optional(),
    /** One or two columns (answer 14). */
    columns: z.union([z.literal(1), z.literal(2)]).optional(),
    /** The template's Figma size in px, where it differs from the style's. */
    size: z.number().positive().max(1000).optional(),
    text: textSchema.optional(),
    binding: bindingSchema.optional(),
    provenance: z.enum(CLAIM_PROVENANCES),
    aspect: z.enum(CLAIM_ASPECTS).optional(),
    sourceRefs: z.array(materialRefSchema).max(MAX_SOURCE_REFS).optional(),
  })
  .superRefine((el, ctx) => {
    if ((el.text === undefined) === (el.binding === undefined)) {
      ctx.addIssue({ code: "custom", path: [], message: "A text holds exactly one of text or binding." });
    }
  });
export type TextElement = z.infer<typeof textElementSchema>;

/** How a Testi group sits in its block; `split` puts the first `splitAt` texts on top and the rest at the bottom. */
export const TEXT_GROUP_ALIGNS = ["top", "centre", "bottom", "split"] as const;
export type TextGroupAlign = (typeof TEXT_GROUP_ALIGNS)[number];

export const textGroupElementSchema = z
  .strictObject({
    elementId: z.uuid(),
    type: z.literal("text_group"),
    align: z.enum(TEXT_GROUP_ALIGNS),
    splitAt: z.number().int().min(1).optional(),
    items: z.array(textElementSchema).max(MAX_ITEMS_PER_GROUP),
  })
  .superRefine((el, ctx) => {
    if (el.splitAt === undefined && el.align === "split") {
      ctx.addIssue({ code: "custom", path: ["splitAt"], message: "A split group needs splitAt." });
    }
    if (el.splitAt !== undefined && el.align !== "split") {
      ctx.addIssue({ code: "custom", path: ["splitAt"], message: "splitAt is set only when the group is split." });
    }
    if (el.splitAt !== undefined && el.splitAt > el.items.length) {
      ctx.addIssue({ code: "custom", path: ["splitAt"], message: "splitAt is at most the number of texts." });
    }
  });
export type TextGroupElement = z.infer<typeof textGroupElementSchema>;

/** Riempi, Adatta, Ritaglia. */
export const MEDIA_FITS = ["fill", "fit", "crop"] as const;
export type MediaFit = (typeof MEDIA_FITS)[number];

/** Where the image sits inside its block (`x`, `y` in 0–1) and how far it is zoomed (1–4); only with `fit: crop` (answer 8). */
export const cropSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(4),
});
export type Crop = z.infer<typeof cropSchema>;

const mediaElementShape = {
  elementId: z.uuid(),
  /** Null: an empty block, exported transparent (answer 10). */
  assetId: z.uuid().nullable(),
  fit: z.enum(MEDIA_FITS),
  crop: cropSchema.optional(),
};

const cropOnlyWhenCropped = (el: { fit: MediaFit; crop?: Crop }, ctx: z.RefinementCtx) => {
  if (el.crop !== undefined && el.fit !== "crop") {
    ctx.addIssue({ code: "custom", path: ["crop"], message: "A crop is set only with fit crop." });
  }
};

export const imageElementSchema = z.strictObject({ ...mediaElementShape, type: z.literal("image") }).superRefine(cropOnlyWhenCropped);
export type ImageElement = z.infer<typeof imageElementSchema>;

export const videoElementSchema = z.strictObject({ ...mediaElementShape, type: z.literal("video") }).superRefine(cropOnlyWhenCropped);
export type VideoElement = z.infer<typeof videoElementSchema>;

/** The Animazione types (C35): Carousel 01, Carousel 03, Carousel 04 and Wheel 02. */
export const ANIMATIONS = ["carousel_01", "carousel_03", "carousel_04", "wheel_02"] as const;
export type AnimationId = (typeof ANIMATIONS)[number];

/** Adatta or Riempi (C35). */
export const ANIMATION_FITS = ["fill", "fit"] as const;

export const animationElementSchema = z.strictObject({
  elementId: z.uuid(),
  type: z.literal("animation"),
  animation: z.enum(ANIMATIONS),
  assetIds: z.array(z.uuid()).max(MAX_ANIMATION_ASSETS),
  fit: z.enum(ANIMATION_FITS),
  /** Percent of the block, 50–150 (C35). */
  size: z.number().min(50).max(150).optional(),
});
export type AnimationElement = z.infer<typeof animationElementSchema>;

/** The case's services as tags, read from the case's record at render time (answer 7). */
export const servicesElementSchema = z.strictObject({ elementId: z.uuid(), type: z.literal("services") });
export type ServicesElement = z.infer<typeof servicesElementSchema>;

/** The client's and MAC's logos, read at render time. */
export const logosElementSchema = z.strictObject({ elementId: z.uuid(), type: z.literal("logos") });
export type LogosElement = z.infer<typeof logosElementSchema>;

export const dividerElementSchema = z.strictObject({ elementId: z.uuid(), type: z.literal("divider") });
export type DividerElement = z.infer<typeof dividerElementSchema>;

export const elementSchema = z.discriminatedUnion("type", [
  textElementSchema,
  textGroupElementSchema,
  imageElementSchema,
  videoElementSchema,
  animationElementSchema,
  servicesElementSchema,
  logosElementSchema,
  dividerElementSchema,
]);
export type DocumentElement = z.infer<typeof elementSchema>;
export type ElementType = DocumentElement["type"];
export const ELEMENT_TYPES = ["text", "text_group", "image", "video", "animation", "services", "logos", "divider"] as const satisfies readonly ElementType[];

export const blockSchema = z.strictObject({
  blockId: z.uuid(),
  name: nameSchema,
  background: backgroundSchema,
  elements: z.array(elementSchema).max(MAX_ELEMENTS_PER_BLOCK),
});
export type Block = z.infer<typeof blockSchema>;

/** The bento grid: the template layout it came from and its own track sizes (fractions). */
export const gridSchema = z.strictObject({
  layoutId: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Must be a layout id.").max(MAX_REF_ID_CHARS),
  rows: z.array(z.number().positive()).min(1).max(MAX_GRID_TRACKS),
  cols: z.array(z.number().positive()).min(1).max(MAX_GRID_TRACKS),
});
export type Grid = z.infer<typeof gridSchema>;

export const PAGE_ROLES = ["intro", "body", "outro"] as const;
export type PageRole = (typeof PAGE_ROLES)[number];

/** A case's pages are grouped as Intro, Output and Risultati (C36). */
export const PAGE_SECTIONS = ["intro", "output", "risultati"] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

export const pageSchema = z.strictObject({
  /** Stable, unique within its format. */
  pageKey: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Must be a page key.").max(MAX_REF_ID_CHARS),
  name: nameSchema,
  role: z.enum(PAGE_ROLES),
  section: z.enum(PAGE_SECTIONS),
  background: backgroundSchema,
  grid: gridSchema,
  blocks: z.array(blockSchema).max(MAX_BLOCKS_PER_PAGE),
});
export type Page = z.infer<typeof pageSchema>;

export const formatPagesSchema = z.strictObject({
  pages: z.array(pageSchema).max(MAX_PAGES_PER_FORMAT),
});
export type FormatPages = z.infer<typeof formatPagesSchema>;

/** Every element id of a block, Testi group items included. */
const elementIdsOf = (elements: readonly DocumentElement[]): string[] =>
  elements.flatMap((el) => (el.type === "text_group" ? [el.elementId, ...el.items.map((item) => item.elementId)] : [el.elementId]));

const firstDuplicate = (values: readonly string[]): string | undefined => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
};

export const caseStudyDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    kind: z.enum(DOCUMENT_KINDS),
    template: templateRefSchema,
    // Keyed by format registry id. The keys are checked against the registry when a
    // revision is created (`validateNewDocument`) and fixed from then on.
    formats: z.record(z.string(), formatPagesSchema),
  })
  .superRefine((doc, ctx) => {
    // Ids are unique within a format; the same id in two formats names independent copies.
    for (const [formatId, { pages }] of Object.entries(doc.formats)) {
      const checks = [
        ["pageKey", pages.map((p) => p.pageKey)],
        ["blockId", pages.flatMap((p) => p.blocks.map((b) => b.blockId))],
        ["elementId", pages.flatMap((p) => p.blocks.flatMap((b) => elementIdsOf(b.elements)))],
      ] as const;
      for (const [name, ids] of checks) {
        const duplicate = firstDuplicate(ids);
        if (duplicate !== undefined) {
          ctx.addIssue({ code: "custom", path: ["formats", formatId], message: `${name} ${duplicate} appears twice in this format.` });
        }
      }
    }
  });
export type CaseStudyDocument = z.infer<typeof caseStudyDocumentSchema>;

// ---------------------------------------------------------------------------
// Version 1: one shared narrative part plus a per-format layout part, kept so
// stored v1 documents still read. Upgraded to v2 with the template's default
// pages (its texts and layouts do not carry over: see `fromV1`).
// ---------------------------------------------------------------------------

/** A v1 case history opens with these three sections, in this order, each exactly once. */
export const NARRATIVE_SECTIONS = ["challenge", "approach", "result"] as const;

/** Section names reserved for client info, which is never stored in a document. */
export const CLIENT_SECTIONS = ["about"] as const;

/** v1 size bounds. */
export const MAX_CLAIMS_PER_BLOCK = 50;
export const MAX_BLOCKS = 50;
export const MAX_SELECTED_MEDIA = 100;
export const MAX_TEXT_HASH_CHARS = 128;

const sectionSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case.")
  .refine((s) => !(CLIENT_SECTIONS as readonly string[]).includes(s), "Client info is never stored in a document.");

export const claimV1Schema = z.strictObject({
  claimId: z.uuid(),
  text: textSchema,
  aspect: z.enum(CLAIM_ASPECTS),
  provenance: z.enum(CLAIM_PROVENANCES),
  sourceRefs: z.array(materialRefSchema).optional(),
});
export type ClaimV1 = z.infer<typeof claimV1Schema>;

/** Who checked a block, when, and the hash of the text they checked (null: never checked). */
export const checkV1Schema = z
  .strictObject({
    by: z.uuid(),
    at: z.iso.datetime({ offset: true }),
    textHash: z.string().min(1).max(MAX_TEXT_HASH_CHARS),
  })
  .nullable();
export type CheckV1 = z.infer<typeof checkV1Schema>;

export const blockV1Schema = z.strictObject({
  blockId: z.uuid(),
  section: sectionSchema,
  text: textSchema,
  claims: z.array(claimV1Schema).max(MAX_CLAIMS_PER_BLOCK),
  check: checkV1Schema,
});
export type BlockV1 = z.infer<typeof blockV1Schema>;

/** One format's v1 layout: variant, slot → asset id (or null), spacing, text scale and font pairing. */
export const formatEntryV1Schema = z.strictObject({
  variant: z.string().min(1),
  slots: z.record(z.string().min(1), z.uuid().nullable()),
  spacing: z.string().min(1),
  textScale: z.number().positive(),
  fontPairing: z.string().min(1),
});
export type FormatEntryV1 = z.infer<typeof formatEntryV1Schema>;

const hasDuplicates = (values: readonly string[]) => new Set(values).size !== values.length;

export const caseStudyDocumentV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    kind: z.enum(DOCUMENT_KINDS),
    template: templateRefSchema,
    blocks: z.array(blockV1Schema).max(MAX_BLOCKS),
    selectedMedia: z.array(z.uuid()).max(MAX_SELECTED_MEDIA),
    formats: z.record(z.string(), formatEntryV1Schema),
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
export type CaseStudyDocumentV1 = z.infer<typeof caseStudyDocumentV1Schema>;

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
  formats: z.record(z.string(), formatEntryV1Schema),
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
// The upgrade seam: what v1 → v2 needs from outside the domain.
// ---------------------------------------------------------------------------

/** The template's default pages of one format (Story 3.4 fills it; `[]` until then). */
export type DefaultPages = (template: string, kind: DocumentKind, formatId: string) => readonly Page[];

export interface UpgradeDeps {
  defaultPages: DefaultPages;
  /** The format registry's ids, in registry order. */
  formatIds: readonly string[];
}

/**
 * v1 → v2. A v1 layout means nothing in the new formats, and v1 texts are not
 * carried over (no v1 revision exists on any environment), so every registry
 * format gets the template's default pages, and v1 format keys outside the
 * registry are dropped.
 */
function fromV1(deps: UpgradeDeps) {
  return (doc: CaseStudyDocumentV1): unknown => ({
    schemaVersion: 2,
    kind: doc.kind,
    template: doc.template,
    formats: Object.fromEntries(
      deps.formatIds.map((formatId) => [
        formatId,
        // TODO(Story 3.4): v1 template refs (`mac-case@1`) may need mapping to the new template id before asking for its default pages.
        { pages: structuredClone(deps.defaultPages(doc.template, doc.kind, formatId)) },
      ]),
    ),
  });
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

interface UpgradeStep {
  schema: z.ZodType;
  up: (doc: never) => unknown;
}

/** Known older versions and the step that takes each one version up. */
const upgradeSteps = (deps: UpgradeDeps): Readonly<Record<number, UpgradeStep>> => ({
  0: { schema: caseStudyDocumentV0Schema, up: fromV0 as (doc: never) => unknown },
  1: { schema: caseStudyDocumentV1Schema, up: fromV1(deps) as (doc: never) => unknown },
});

/**
 * Takes a stored document of any known version to the current one, in memory
 * (the input is never mutated, and nothing is written back). An unknown, missing
 * or newer version is `DOCUMENT_SCHEMA_UNSUPPORTED`; a known version that fails
 * its schema is `DOCUMENT_INVALID` with the zod issues in `details.issues`. The
 * module index binds `deps` (registry ids and the templates' default pages).
 */
export function upgrade(doc: unknown, deps: UpgradeDeps): Result<CaseStudyDocument> {
  const steps = upgradeSteps(deps);
  let version = versionOf(doc);
  let current: unknown = doc;
  while (version !== CURRENT_SCHEMA_VERSION) {
    if (typeof version !== "number" || !Object.hasOwn(steps, version)) return unsupported(version);
    const step = steps[version];
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
 * (`DOCUMENT_INVALID`, issues in `details.issues`), and have one page list for
 * exactly each id of `formatIds`, the format registry (`FORMAT_NOT_IN_REVISION`,
 * naming the missing and extra ids). The module index binds `formatIds` to the
 * registry.
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
      message: "A new revision has one page list for exactly each registry format.",
      details: { missing, extra, extraCount: extraKeys.length },
    });
  }
  return ok(parsed.data);
}
