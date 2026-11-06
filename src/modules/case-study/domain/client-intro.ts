import { z } from "zod";
import { revisionMetaSchema } from "@/modules/case-study/domain/revision";
import { CASE_STATUSES } from "@/shared/case-status";

/**
 * Story 3.11: a client's intro-and-outro document (AD-23), one per client, with the case
 * lifecycle (AD-3: draft → generating → in_review → approved, a failure back to draft),
 * the same head and approved revision pointers and the same `headVersion`
 * compare-and-set. Its status changes only through `transitionIntro`, with the case
 * transition table; every change appends a `client_event` row.
 */
export const clientIntroSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  status: z.enum(CASE_STATUSES),
  headRevisionId: z.uuid().nullable(),
  approvedRevisionId: z.uuid().nullable(),
  headVersion: z.number().int().nonnegative(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ClientIntro = z.infer<typeof clientIntroSchema>;

/** The client event written when a client's intro is created, in the same transaction; `data` is `{ clientId }`. */
export const CLIENT_INTRO_CREATED = "client_intro_created";

/**
 * Statuses in which saving the client starts a draft (the start rule, owner 2026-11-06): a
 * client with no intro, or whose intro is in Bozza (which also retries a failed draft).
 */
export const INTRO_STARTABLE_STATUSES = ["draft"] as const;

/** `startClientIntro`'s input. */
export const startClientIntroInputSchema = z.strictObject({
  clientId: z.uuid().transform((id) => id.toLowerCase()),
});

/** What `startClientIntro` did: `started` with the job, or `unchanged` when the intro was not in Bozza. */
export type ClientIntroStart =
  | { outcome: "started"; introId: string; jobId: string }
  | { outcome: "unchanged"; introId: string; status: ClientIntro["status"] };

/**
 * What a writer supplies to create a working revision of a client intro (Story 3.11). `doc`
 * is validated separately (`generation.validateNewDocument`, and its kind must be
 * `client_intro`); `expectedHeadVersion` is the intro's `headVersion` the writer read.
 */
export const createIntroWorkingRevisionInputSchema = z.strictObject({
  clientIntroId: z.uuid().transform((id) => id.toLowerCase()),
  doc: z.unknown(),
  manifest: z.record(z.string(), z.json()).default({}),
  meta: revisionMetaSchema.default({ model: null, fellBack: false, promptVersion: null }),
  expectedHeadVersion: z.number().int().nonnegative().max(2_147_483_647),
});
export type CreateIntroWorkingRevisionInput = z.infer<typeof createIntroWorkingRevisionInputSchema>;
