import { DEV_ACTOR_ID, type Actor } from "@/modules/access/domain/actor";
import { err, ok, type Result } from "@/shared/result";
import type { ProfileRepository } from "./ports";

/**
 * Builds the actor resolver. Until Epic 6 it always resolves the seeded dev
 * owner/designer; Epic 6 swaps only this resolver (session → profile).
 * The profile is read on every call, never cached, so a role change or a
 * disable applies at the next request (AD-11).
 */
export function makeGetActor(profiles: ProfileRepository) {
  return async function getActor(): Promise<Result<Actor>> {
    const found = await profiles.findById(DEV_ACTOR_ID);
    if (!found.ok) return found;

    const profile = found.value;
    if (profile === null || profile.disabledAt !== null) {
      return err({ code: "UNAUTHENTICATED", message: "No enabled profile for this request." });
    }

    const { id, email, displayName, role } = profile;
    return ok({ id, email, displayName, role });
  };
}
