import { z } from "zod";
import { CASE_STATUSES } from "@/shared/case-status";

/**
 * The `case_event` types the Dashboard's *Attività* shows (owner, 2026-10-21). The
 * material module writes `details_saved`, `asset_uploaded` and `asset_removed`; they
 * are listed here as plain strings so this module does not import that one. Favourite
 * toggles and deletes are left out: they are noise in a feed, and a deleted case is
 * not listed anyway.
 */
export const ACTIVITY_TYPES = [
  "case_created",
  "case_details_updated",
  "details_saved",
  "asset_uploaded",
  "asset_removed",
  "transition",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** One line of *Attività*: what happened, when, who did it, and to which case. */
export const caseActivitySchema = z.object({
  id: z.uuid(),
  type: z.enum(ACTIVITY_TYPES),
  at: z.string(),
  data: z.record(z.string(), z.json()),
  /** The actor's display name; `null` for the system (the generation worker). */
  actorName: z.string().nullable(),
  case: z.object({ id: z.uuid(), name: z.string(), code: z.string(), status: z.enum(CASE_STATUSES) }),
});
export type CaseActivity = z.infer<typeof caseActivitySchema>;

/** How many events *Attività* reads at most. */
export const ACTIVITY_LIMIT = 100;
