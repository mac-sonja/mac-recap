import type { Actor, Profile } from "@/modules/access/domain/actor";
import { err, ok, type Result } from "@/shared/result";
import type { AuthGateway, ProfileRepository } from "./ports";

/** A profile that may act through the UI: present, not disabled, not the worker's `system`. */
export function isUsable(profile: Profile | null): profile is Profile {
  return profile !== null && profile.disabledAt === null && profile.role !== "system";
}

/**
 * Builds the actor resolver (Story 6.1): the Supabase Auth session's email,
 * matched case-insensitively to a `profile`. The role is read from the profile on
 * every call, never from a token claim or a cache, so a role change or a disable
 * applies at the next request (AD-11).
 */
export function makeGetActor(auth: AuthGateway, profiles: ProfileRepository) {
  return async function getActor(): Promise<Result<Actor>> {
    const user = await auth.currentUser();
    if (user === null) return err({ code: "UNAUTHENTICATED", message: "No session for this request." });

    const found = await profiles.findByEmail(user.email);
    if (!found.ok) return found;

    const profile = found.value;
    if (!isUsable(profile)) {
      return err({ code: "UNAUTHENTICATED", message: "No enabled profile for this session." });
    }

    const { id, email, displayName, role } = profile;
    return ok({ id, email, displayName, role });
  };
}
