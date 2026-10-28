import type { ProfileRepository } from "@/modules/access/application/ports";
import { profileSchema, type Profile } from "@/modules/access/domain/actor";
import { normalizeEmail } from "@/modules/access/domain/sign-up";
import type { Tables } from "@/shared/db.types";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

type ProfileRow = Pick<
  Tables<"profile">,
  "id" | "email" | "display_name" | "role" | "disabled_at" | "job_title" | "designer_requested_at"
>;

const COLUMNS = "id, email, display_name, role, disabled_at, job_title, designer_requested_at";

/** Maps a `profile` row to the domain shape, rejecting unknown roles. */
export function toProfile(row: ProfileRow): Result<Profile> {
  const parsed = profileSchema.safeParse({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    disabledAt: row.disabled_at,
    jobTitle: row.job_title,
    designerRequestedAt: row.designer_requested_at,
  });
  if (!parsed.success) {
    return err({ code: "PROFILE_INVALID", message: "A profile row failed validation.", details: { id: row.id } });
  }
  return ok(parsed.data);
}

/** An `ilike` pattern that matches `value` literally (no wildcards), i.e. a case-insensitive equality. */
export function literalIlike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function createSupabaseProfileRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ProfileRepository {
  return {
    async findById(id) {
      const { data, error } = await client().from("profile").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) {
        log.error(`profile lookup failed: ${error.code}`, { actorId: id });
        return err({ code: "PROFILE_LOOKUP_FAILED", message: "Could not read the profile.", details: { id } });
      }
      return data === null ? ok(null) : toProfile(data);
    },

    async findByEmail(email) {
      const { data, error } = await client()
        .from("profile")
        .select(COLUMNS)
        .ilike("email", literalIlike(normalizeEmail(email)))
        .maybeSingle();
      if (error) {
        log.error(`profile lookup by email failed: ${error.code}`);
        return err({ code: "PROFILE_LOOKUP_FAILED", message: "Could not read the profile." });
      }
      return data === null ? ok(null) : toProfile(data);
    },

    async create(profile) {
      const { data, error } = await client()
        .from("profile")
        .insert({
          email: normalizeEmail(profile.email),
          display_name: profile.displayName,
          role: profile.role,
          job_title: profile.jobTitle,
          designer_requested_at: profile.designerRequestedAt,
        })
        .select(COLUMNS)
        .single();
      if (error) {
        if (error.code === "23505") return err({ code: "PROFILE_EXISTS", message: "A profile has this email." });
        log.error(`profile insert failed: ${error.code}`);
        return err({ code: "PROFILE_WRITE_FAILED", message: "Could not save the profile." });
      }
      return toProfile(data);
    },
  };
}
