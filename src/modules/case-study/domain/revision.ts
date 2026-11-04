import { z } from "zod";

/** The `revision.status` set; the `revision_status_check` lists exactly these. */
export const REVISION_STATUSES = ["working", "approved", "superseded"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/** The case event written with every new revision, in the same transaction (`revision_id` set). */
export const REVISION_CREATED = "revision_created";

/** The case event written with every save of an edited `doc` (Story 4.3a), `{ version }` the new version. */
export const REVISION_SAVED = "revision_saved";

/**
 * Story 4.9: the case event written when an approved case's head is forked into a working
 * copy (`{ fromRevisionId, headVersion }`).
 */
export const REVISION_FORKED = "revision_forked";

/** Story 4.9: the case event written when the copy becomes the approved revision (`{ revisionId, version, supersededRevisionId }`). */
export const APPROVED_VERSION_UPDATED = "approved_version_updated";

/** Story 4.9: the case event written when the copy is discarded (`{ discardedRevisionId, headVersion }`). */
export const REVISION_DISCARDED = "revision_discarded";

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

/**
 * `approve` (Story 4.8): the head revision of a case, the versions it was read at, and
 * whether each format of that revision version overflows, as the person's browser
 * measured it with the shared renderer (the server does not measure again).
 */
export const approveInputSchema = z.strictObject({
  caseId: z.uuid().transform((id) => id.toLowerCase()),
  revisionId: z.uuid().transform((id) => id.toLowerCase()),
  expectedRevisionVersion: z.number().int().nonnegative().max(2_147_483_647),
  expectedHeadVersion: z.number().int().nonnegative().max(2_147_483_647),
  overflow: z.record(z.string().max(64), z.boolean()),
});
export type ApproveInput = z.infer<typeof approveInputSchema>;

/**
 * `forkHead` (Story 4.9): the approved case whose first edit needs a working copy, and the
 * `headVersion` the configurator read.
 */
export const forkHeadInputSchema = z.strictObject({
  caseId: z.uuid().transform((id) => id.toLowerCase()),
  expectedHeadVersion: z.number().int().nonnegative().max(2_147_483_647),
});
export type ForkHeadInput = z.infer<typeof forkHeadInputSchema>;

/** `discardHead` (Story 4.9): the working copy to drop, and the `headVersion` it was read at. */
export const discardHeadInputSchema = z.strictObject({
  caseId: z.uuid().transform((id) => id.toLowerCase()),
  revisionId: z.uuid().transform((id) => id.toLowerCase()),
  expectedHeadVersion: z.number().int().nonnegative().max(2_147_483_647),
});
export type DiscardHeadInput = z.infer<typeof discardHeadInputSchema>;

/** What `forkHead` returns: the working copy's id and `version`, and the case's `headVersion` after the fork. */
export interface ForkedHead {
  revisionId: string;
  version: number;
  headVersion: number;
}
