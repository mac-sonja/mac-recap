import type { Profile } from "@/modules/access/domain/actor";
import type { NewProfile } from "@/modules/access/domain/sign-up";
import type { Result } from "@/shared/result";

/** Reads and writes `profile` rows. Implemented by `adapters/supabase/profile-repository.ts`. */
export interface ProfileRepository {
  /** `ok(null)` when no row has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<Profile | null>>;
  /** Case-insensitive match on email; `ok(null)` when no row has it. */
  findByEmail(email: string): Promise<Result<Profile | null>>;
  /** Inserts a profile; `PROFILE_EXISTS` when the email is taken (in any letter case). */
  create(profile: NewProfile): Promise<Result<Profile>>;
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
