import { z } from "zod";
import { CASE_STATUSES } from "@/shared/case-status";

/** Narrative locales (per case, default `it`). The `case_study.locale` check lists exactly these. */
export const LOCALES = ["it", "en"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = "it";

export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/** Accepted client name length after trimming (AD-21 rule 7; the DB only checks non-blank). */
export const CLIENT_NAME_MAX = 120;

/**
 * A client as the case-study module sees it. `code` is automatic and fixed
 * (AD-21): it is computed only in SQL, never here.
 */
export const clientSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
});
export type Client = z.infer<typeof clientSchema>;

/** A client name a person supplies: trimmed, 1–120 characters. */
export const clientNameSchema = z.string().trim().min(1, "Required.").max(CLIENT_NAME_MAX);

/**
 * A `case_study` row with its client, as the case-study module sees it.
 * `code` (e.g. `LUM-2026-01`) is the readable display code, fixed at creation;
 * `id` stays the only key (AD-2). Timestamps are ISO strings.
 */
export const caseStudySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  number: z.number().int().positive(),
  name: z.string(),
  client: clientSchema,
  year: z.number().int(),
  locale: localeSchema,
  status: z.enum(CASE_STATUSES),
  projectOrderRef: z.string().nullable(),
  headRevisionId: z.uuid().nullable(),
  approvedRevisionId: z.uuid().nullable(),
  headVersion: z.number().int().nonnegative(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type CaseStudy = z.infer<typeof caseStudySchema>;

const requiredText = z.string().trim().min(1, "Required.");

/**
 * What a person supplies to create a case (wizard step 0). Name is trimmed and
 * required; `clientId` is a picked client's id; year is an integer in 1900–2100;
 * locale defaults to `it`. Any other key (status, code, project_order_ref, …) is dropped.
 */
export const createCaseStudyInputSchema = z.object({
  name: requiredText,
  clientId: z.uuid("Required."),
  year: z.number().int("Must be a whole number.").min(YEAR_MIN).max(YEAR_MAX),
  locale: localeSchema.default(DEFAULT_LOCALE),
});
export type CreateCaseStudyInput = z.infer<typeof createCaseStudyInputSchema>;

/**
 * The status scope of a list, as authorized by `list cases`: `{}` is every status,
 * `{ status }` only that one. Any other key is rejected.
 */
export const listScopeSchema = z.strictObject({ status: z.enum(CASE_STATUSES).optional() });
export type ListScope = z.infer<typeof listScopeSchema>;
