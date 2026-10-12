import { z } from "zod";
import { CASE_STATUSES } from "@/shared/case-status";

/** Narrative locales (per case, default `it`). The `case_study.locale` check lists exactly these. */
export const LOCALES = ["it", "en"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = "it";

export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/** A `case_study` row as the case-study module sees it. Timestamps are ISO strings. */
export const caseStudySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  client: z.string(),
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
 * What a person supplies to create a case (wizard step 0). Name and client are
 * trimmed and required; year is an integer in 1900–2100; locale defaults to `it`.
 * Any other key (status, project_order_ref, …) is dropped.
 */
export const createCaseStudyInputSchema = z.object({
  name: requiredText,
  client: requiredText,
  year: z.number().int("Must be a whole number.").min(YEAR_MIN).max(YEAR_MAX),
  locale: localeSchema.default(DEFAULT_LOCALE),
});
export type CreateCaseStudyInput = z.infer<typeof createCaseStudyInputSchema>;
