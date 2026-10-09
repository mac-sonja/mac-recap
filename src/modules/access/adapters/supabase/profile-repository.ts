import type { ProfileRepository } from "@/modules/access/application/ports";
import { profileSchema, type Profile } from "@/modules/access/domain/actor";
import type { Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type ProfileRow = Pick<Tables<"profile">, "id" | "email" | "display_name" | "role" | "disabled_at">;

/** Maps a `profile` row to the domain shape, rejecting unknown roles. */
export function toProfile(row: ProfileRow): Result<Profile> {
  const parsed = profileSchema.safeParse({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    disabledAt: row.disabled_at,
  });
  if (!parsed.success) {
    return err({ code: "PROFILE_INVALID", message: "A profile row failed validation.", details: { id: row.id } });
  }
  return ok(parsed.data);
}

export function createSupabaseProfileRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ProfileRepository {
  return {
    async findById(id) {
      const { data, error } = await client()
        .from("profile")
        .select("id, email, display_name, role, disabled_at")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error(`profile lookup failed: ${error.code}`, { actorId: id });
        return err({ code: "PROFILE_LOOKUP_FAILED", message: "Could not read the profile.", details: { id } });
      }
      return data === null ? ok(null) : toProfile(data);
    },
  };
}
