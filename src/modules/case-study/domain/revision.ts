import { z } from "zod";

/** The `revision.status` set; the `revision_status_check` lists exactly these. */
export const REVISION_STATUSES = ["working", "approved", "superseded"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** The case event written with every new revision, in the same transaction (`revision_id` set). */
export const REVISION_CREATED = "revision_created";

/** The case event written with every save of an edited `doc` (Story 4.3a), `{ version }` the new version. */
export const REVISION_SAVED = "revision_saved";

/**
 * Whose revision it is: a case study, or a client intro (Story 3.9; until then
 * every read for it is `SUBJECT_NOT_SUPPORTED`).
 */
// Ids are lowercased, as Postgres prints them, so pointer checks compare equal strings.
const subjectIdSchema = z.uuid().transform((id) => id.toLowerCase());

export const revisionSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("case"), id: subjectIdSchema }),
  z.strictObject({ kind: z.literal("client_intro"), id: subjectIdSchema }),
]);
export type RevisionSubject = z.infer<typeof revisionSubjectSchema>;

const jsonObjectSchema = z.record(z.string(), z.json());

/**
 * What the writer recorded about its inputs (e.g. which material it read, Story 3.6).
 * Never a client value.
 */
export type RevisionManifest = z.infer<typeof jsonObjectSchema>;

/**
 * A `revision` row as the case-study module sees it. `Doc` is the document type:
 * `unknown` as stored, `CaseStudyDocument` once passed through `generation.upgrade`
 * (the application layer does that; domain code may not import another module).
 * `schemaVersion` is the stored `doc`'s version, before any upgrade.
 */
export interface Revision<Doc = unknown> {
  id: string;
  caseId: string | null;
  clientIntroId: string | null;
  status: RevisionStatus;
  version: number;
  generatedDoc: Doc;
  doc: Doc;
  manifest: RevisionManifest;
  model: string | null;
  fellBack: boolean;
  promptVersion: string | null;
  schemaVersion: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Validates a stored row (already mapped to camelCase); the documents stay unparsed here. */
export const storedRevisionSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid().nullable(),
  clientIntroId: z.uuid().nullable(),
  status: z.enum(REVISION_STATUSES),
  version: z.number().int().nonnegative(),
  generatedDoc: z.unknown(),
  doc: z.unknown(),
  manifest: jsonObjectSchema,
  model: z.string().nullable(),
  fellBack: z.boolean(),
  promptVersion: z.string().nullable(),
  schemaVersion: z.number().int().nonnegative(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** The generator's metadata recorded on a revision (nulls when no model ran, e.g. the test draft). */
export const revisionMetaSchema = z.strictObject({
  model: z.string().min(1).max(200).nullable().default(null),
  fellBack: z.boolean().default(false),
  promptVersion: z.string().min(1).max(200).nullable().default(null),
});
export type RevisionMeta = z.infer<typeof revisionMetaSchema>;

/**
 * What a writer supplies to create a working revision of a case. `doc` is
 * validated separately (`generation.validateNewDocument`); `expectedHeadVersion`
 * is the `headVersion` the writer read.
 */
export const createWorkingRevisionInputSchema = z.strictObject({
  caseId: z.uuid().transform((id) => id.toLowerCase()),
  doc: z.unknown(),
  manifest: jsonObjectSchema.default({}),
  meta: revisionMetaSchema.default({ model: null, fellBack: false, promptVersion: null }),
  // Postgres integer range.
  expectedHeadVersion: z.number().int().nonnegative().max(2_147_483_647),
});
export type CreateWorkingRevisionInput = z.infer<typeof createWorkingRevisionInputSchema>;

/**
 * What the configurator's autosave sends (Story 4.3a): the whole edited `doc` of the
 * head revision and the `version` it was based on. `doc` is validated separately
 * (`generation.validateNewDocument`).
 */
export const saveRevisionDocInputSchema = z.strictObject({
  caseId: z.uuid().transform((id) => id.toLowerCase()),
  revisionId: z.uuid().transform((id) => id.toLowerCase()),
  doc: z.unknown(),
  // Postgres integer range.
  expectedVersion: z.number().int().nonnegative().max(2_147_483_647),
});
export type SaveRevisionDocInput = z.infer<typeof saveRevisionDocInputSchema>;
