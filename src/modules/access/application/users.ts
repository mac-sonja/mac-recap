import type { Actor, Profile } from "@/modules/access/domain/actor";
import {
  addUserInputSchema,
  changeJobTitleInputSchema,
  changeRoleInputSchema,
  removeUserInputSchema,
  wouldRemoveLastAdmin,
  type AssignableRole,
  type ListedUser,
} from "@/modules/access/domain/users";
import { err, ok, type Result } from "@/shared/result";
import type { AuthAdmin, ProfileRepository } from "./ports";
import { EMAIL_LINK_PATH } from "./session";

/** What Add user did: a new profile, or a removed one brought back; `invited` false when the person already had a login. */
export interface AddedUser {
  user: Profile;
  invited: boolean;
}

const invalid = (fields: string[]) =>
  err({ code: "INVALID_INPUT" as const, message: "User input is invalid.", details: { fields } });

const fieldsOf = (issues: { path: PropertyKey[] }[]) => [...new Set(issues.map((i) => String(i.path[0])))];

const lastAdmin = () =>
  err({ code: "LAST_ADMIN" as const, message: "The last admin can't lose the role or be removed." });

/**
 * The admin's Users use cases (Story 6.3). The caller has already authorized
 * `manage users`; `actor` is that admin. Nothing here reads or changes cases,
 * permissions or guardrails: only `profile.role`, `profile.job_title` and `profile.disabled_at`.
 */
export function makeUsers({ profiles, authAdmin }: { profiles: ProfileRepository; authAdmin: AuthAdmin }) {
  /** An enabled, non-system profile to act on, or `NOT_FOUND`. */
  async function target(id: string): Promise<Result<Profile>> {
    const found = await profiles.findById(id);
    if (!found.ok) return found;
    const profile = found.value;
    if (profile === null || profile.disabledAt !== null || profile.role === "system") {
      return err({ code: "NOT_FOUND", message: "No such user." });
    }
    return ok(profile);
  }

  /** `LAST_ADMIN` when this change would leave no enabled admin. */
  async function guardLastAdmin(profile: Profile, nextRole: AssignableRole | null): Promise<Result<void>> {
    if (profile.role !== "admin") return ok(undefined);
    const admins = await profiles.countEnabledAdmins();
    if (!admins.ok) return admins;
    return wouldRemoveLastAdmin(profile, nextRole, admins.value) ? lastAdmin() : ok(undefined);
  }

  return {
    list(): Promise<Result<ListedUser[]>> {
      return profiles.listUsers();
    },

    /** Creates the profile with the chosen role and sends the invite; `origin` is where its link returns. */
    async add(_actor: Actor, raw: unknown, origin: string): Promise<Result<AddedUser>> {
      const parsed = addUserInputSchema.safeParse(raw);
      if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
      const { firstName, lastName, email, role, jobTitle } = parsed.data;
      const displayName = `${firstName} ${lastName}`;

      const existing = await profiles.findByEmail(email);
      if (!existing.ok) return existing;
      let user: Result<Profile>;
      if (existing.value === null) {
        user = await profiles.create({ email, displayName, role, jobTitle, designerRequestedAt: null });
        if (!user.ok && user.error.code === "PROFILE_EXISTS") return err({ code: "USER_EXISTS", message: "This email has an account." });
      } else if (existing.value.disabledAt !== null && existing.value.role !== "system") {
        user = await profiles.enable(existing.value.id, displayName, role, jobTitle);
      } else {
        return err({ code: "USER_EXISTS", message: "This email has an account." });
      }
      if (!user.ok) return user;

      const invited = await authAdmin.invite(email, `${origin}${EMAIL_LINK_PATH}`);
      if (!invited.ok) return invited;
      return ok({ user: user.value, invited: invited.value });
    },

    /** Changes a role (also approves a designer request); applies at that user's next request. */
    async changeRole(_actor: Actor, raw: unknown): Promise<Result<Profile>> {
      const parsed = changeRoleInputSchema.safeParse(raw);
      if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
      const found = await target(parsed.data.profileId);
      if (!found.ok) return found;
      const guard = await guardLastAdmin(found.value, parsed.data.role);
      if (!guard.ok) return guard;
      return profiles.setRole(found.value.id, parsed.data.role);
    },

    /** **Ruolo**: sets the free-text job title; it grants nothing. */
    async changeJobTitle(_actor: Actor, raw: unknown): Promise<Result<Profile>> {
      const parsed = changeJobTitleInputSchema.safeParse(raw);
      if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
      const found = await target(parsed.data.profileId);
      if (!found.ok) return found;
      return profiles.setJobTitle(found.value.id, parsed.data.jobTitle);
    },

    /** Remove user: sets `disabled_at`; their cases, links and events stay. */
    async remove(_actor: Actor, raw: unknown): Promise<Result<void>> {
      const parsed = removeUserInputSchema.safeParse(raw);
      if (!parsed.success) return invalid(fieldsOf(parsed.error.issues));
      const found = await target(parsed.data.profileId);
      if (!found.ok) return found;
      const guard = await guardLastAdmin(found.value, null);
      if (!guard.ok) return guard;
      return profiles.disable(found.value.id);
    },
  };
}
