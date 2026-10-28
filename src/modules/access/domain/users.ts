import { z } from "zod";
import type { Profile, Role } from "./actor";

/** Roles an admin can give (AD-11); `system` never appears in the UI or the actions. */
export const ASSIGNABLE_ROLES = ["owner_designer", "account_sales_social", "admin"] as const satisfies readonly Role[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const assignableRole = z.enum(ASSIGNABLE_ROLES);

/** **Ruolo**: free text for what the person does in the team; empty clears it. It grants nothing. */
export const jobTitleSchema = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((v) => (v ? v : null));

/** **Aggiungi utente**: anyone, any domain; the person sets a password from the invite. */
export const addUserInputSchema = z.object({
  firstName: z.string().trim().min(1).max(40),
  lastName: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: assignableRole,
  jobTitle: jobTitleSchema,
});
export type AddUserInput = z.infer<typeof addUserInputSchema>;

export const changeRoleInputSchema = z.object({ profileId: z.uuid(), role: assignableRole });
export const changeJobTitleInputSchema = z.object({ profileId: z.uuid(), jobTitle: jobTitleSchema });
export const removeUserInputSchema = z.object({ profileId: z.uuid() });

/** A row of the Users screen: an enabled, non-system profile and when it was added. */
export interface ListedUser extends Profile {
  createdAt: string;
}

/**
 * True when changing `target` (to `nextRole`, or removing it when `nextRole` is
 * null) would leave no enabled admin. `enabledAdmins` counts the enabled admins now.
 */
export function wouldRemoveLastAdmin(target: Profile, nextRole: AssignableRole | null, enabledAdmins: number): boolean {
  const isEnabledAdmin = target.role === "admin" && target.disabledAt === null;
  return isEnabledAdmin && nextRole !== "admin" && enabledAdmins <= 1;
}
