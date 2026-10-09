import { z } from "zod";

/** The fixed roles (AD-11). `system` is the worker's built-in actor and is never assignable. */
export const ROLES = ["owner_designer", "account_sales_social", "admin", "system"] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** A `profile` row as the access module sees it. */
export const profileSchema = z.object({
  id: z.uuid(),
  email: z.string().min(1),
  displayName: z.string(),
  role: roleSchema,
  disabledAt: z.string().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

/** Who is performing a request: an enabled profile. */
export const actorSchema = profileSchema.omit({ disabledAt: true });
export type Actor = z.infer<typeof actorSchema>;

/** Seeded by `supabase/migrations/20261009120000_access_profile.sql`; keep in sync. */
export const SYSTEM_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
/** The dev owner/designer that `getActor()` resolves until Epic 6 swaps the resolver. */
export const DEV_ACTOR_ID = "00000000-0000-4000-8000-000000000002";
