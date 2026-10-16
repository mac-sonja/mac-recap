import { SYSTEM_ACTOR_ID, type Actor } from "@/modules/access/domain/actor";
import { err, ok, type Result } from "@/shared/result";
import type { ProfileRepository } from "./ports";

/**
 * Builds the resolver for the worker's built-in `system` actor (AD-11): the
 * seeded profile, read fresh on every call. `UNAUTHENTICATED` when that
 * profile is missing, disabled or no longer has the `system` role. Its id
 * never leaves the access module.
 */
export function makeGetSystemActor(profiles: ProfileRepository) {
  return async function getSystemActor(): Promise<Result<Actor>> {
    const found = await profiles.findById(SYSTEM_ACTOR_ID);
    if (!found.ok) return found;

    const profile = found.value;
    if (profile === null || profile.disabledAt !== null || profile.role !== "system") {
      return err({ code: "UNAUTHENTICATED", message: "No enabled system profile." });
    }

    const { id, email, displayName, role } = profile;
    return ok({ id, email, displayName, role });
  };
}
