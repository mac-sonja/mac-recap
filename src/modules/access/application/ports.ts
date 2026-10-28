import type { Profile } from "@/modules/access/domain/actor";
import type { NewProfile } from "@/modules/access/domain/sign-up";
import type { AssignableRole, ListedUser } from "@/modules/access/domain/users";
import type { Result } from "@/shared/result";

/** Reads and writes `profile` rows. Implemented by `adapters/supabase/profile-repository.ts`. */
export interface ProfileRepository {
  /** `ok(null)` when no row has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<Profile | null>>;
  /** Case-insensitive match on email; `ok(null)` when no row has it. */
  findByEmail(email: string): Promise<Result<Profile | null>>;
  /** Inserts a profile; `PROFILE_EXISTS` when the email is taken (in any letter case). */
  create(profile: NewProfile): Promise<Result<Profile>>;
  /** Enabled, non-system profiles, oldest first (the Users screen). */
  listUsers(): Promise<Result<ListedUser[]>>;
  countEnabledAdmins(): Promise<Result<number>>;
  /** Sets the role and clears a pending designer request. `LAST_ADMIN` from the database backstop. */
  setRole(id: string, role: AssignableRole): Promise<Result<Profile>>;
  /** Sets the free-text job title (**Ruolo**); `null` clears it. */
  setJobTitle(id: string, jobTitle: string | null): Promise<Result<Profile>>;
  /** Sets `disabled_at` (Remove user); records keep pointing at the profile. */
  disable(id: string): Promise<Result<void>>;
  /** Re-enables a removed profile with a new name, role and job title (Add user on a removed address). */
  enable(id: string, displayName: string, role: AssignableRole, jobTitle: string | null): Promise<Result<Profile>>;
}

/** Admin-side Supabase Auth (service role). Implemented by `adapters/supabase/auth-admin.ts`. */
export interface AuthAdmin {
  /**
   * Sends the invite email whose link lets the person set a password. `ok(false)`
   * when the address already has an auth user (they sign in, or reset the password).
   */
  invite(email: string, redirectTo: string): Promise<Result<boolean>>;
}

/** The signed-in person as Supabase Auth knows them: a verified email and the sign-up metadata. */
export interface SessionUser {
  email: string;
  metadata: unknown;
}

/** The kinds of email link the app accepts at `/auth/confirm`. */
export type EmailLinkType = "signup" | "email" | "invite" | "recovery";

export type EmailLink = { code: string } | { tokenHash: string; type: EmailLinkType };

/**
 * Supabase Auth for the current request's cookies. Implemented by
 * `adapters/supabase/auth-gateway.ts`. Error codes: `INVALID_CREDENTIALS`,
 * `EMAIL_NOT_CONFIRMED`, `RATE_LIMITED`, `LINK_INVALID`, `AUTH_FAILED`.
 */
export interface AuthGateway {
  /** The session's user, verified; `null` with no (valid) session. */
  currentUser(): Promise<SessionUser | null>;
  signInWithPassword(email: string, password: string): Promise<Result<SessionUser>>;
  /** Creates the auth user and sends the confirmation email, whose link returns to `redirectTo`. */
  signUp(email: string, password: string, metadata: object, redirectTo: string): Promise<Result<void>>;
  /** Exchanges an email link for a session. */
  verifyEmailLink(link: EmailLink): Promise<Result<SessionUser>>;
  requestPasswordReset(email: string, redirectTo: string): Promise<Result<void>>;
  /** Sets the signed-in user's password. */
  updatePassword(password: string): Promise<Result<void>>;
  signOut(): Promise<void>;
}
