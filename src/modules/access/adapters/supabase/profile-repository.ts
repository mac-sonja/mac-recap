import type { ProfileRepository } from "@/modules/access/application/ports";
import { profileSchema, type Profile } from "@/modules/access/domain/actor";
import { normalizeEmail } from "@/modules/access/domain/sign-up";
import type { ListedUser } from "@/modules/access/domain/users";
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

/** The database backstop for the last admin (migration 20261028140000) raises this message. */
const isLastAdminError = (error: { message?: string }) => (error.message ?? "").includes("LAST_ADMIN");

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

    async listUsers() {
      const { data, error } = await client()
        .from("profile")
        .select(`${COLUMNS}, created_at`)
        .is("disabled_at", null)
        .neq("role", "system")
        .order("created_at", { ascending: true });
      if (error) {
        log.error(`profile list failed: ${error.code}`);
        return err({ code: "PROFILE_LOOKUP_FAILED", message: "Could not read the profiles." });
      }
      const users: ListedUser[] = [];
      for (const row of data) {
        const profile = toProfile(row);
        if (!profile.ok) return profile;
        users.push({ ...profile.value, createdAt: row.created_at });
      }
      return ok(users);
    },

    async countEnabledAdmins() {
      const { count, error } = await client()
        .from("profile")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .is("disabled_at", null);
      if (error || count === null) {
        log.error(`admin count failed: ${error?.code ?? "no count"}`);
        return err({ code: "PROFILE_LOOKUP_FAILED", message: "Could not count the admins." });
      }
      return ok(count);
    },

    async setRole(id, role) {
      const { data, error } = await client()
        .from("profile")
        .update({ role, designer_requested_at: null })
        .eq("id", id)
        .select(COLUMNS)
        .single();
      if (error) {
        if (isLastAdminError(error)) return err({ code: "LAST_ADMIN", message: "The last admin can't lose the role." });
        log.error(`profile role update failed: ${error.code}`, { actorId: id });
        return err({ code: "PROFILE_WRITE_FAILED", message: "Could not save the profile." });
      }
      return toProfile(data);
    },

    async disable(id) {
      const { error } = await client()
        .from("profile")
        .update({ disabled_at: new Date().toISOString() })
        .eq("id", id)
        .is("disabled_at", null);
      if (error) {
        if (isLastAdminError(error)) return err({ code: "LAST_ADMIN", message: "The last admin can't be removed." });
        log.error(`profile disable failed: ${error.code}`, { actorId: id });
        return err({ code: "PROFILE_WRITE_FAILED", message: "Could not save the profile." });
      }
      return ok(undefined);
    },

    async enable(id, displayName, role) {
      const { data, error } = await client()
        .from("profile")
        .update({ disabled_at: null, display_name: displayName, role, designer_requested_at: null })
        .eq("id", id)
        .neq("role", "system")
        .select(COLUMNS)
        .single();
      if (error) {
        log.error(`profile enable failed: ${error.code}`, { actorId: id });
        return err({ code: "PROFILE_WRITE_FAILED", message: "Could not save the profile." });
      }
      return toProfile(data);
    },
  };
}
