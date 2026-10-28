import type { Profile } from "@/modules/access/domain/actor";
import { landingFor } from "@/modules/access/domain/landing";
import {
  isSignUpDomain,
  passwordSchema,
  profileFromSignUp,
  signUpInputSchema,
  signUpMetadata,
  signUpMetadataSchema,
} from "@/modules/access/domain/sign-up";
import { err, ok, type Result } from "@/shared/result";
import { isUsable } from "./get-actor";
import type { AuthGateway, EmailLink, ProfileRepository, SessionUser } from "./ports";

/** Where an invited or recovering person sets their password. */
export const SET_PASSWORD_PATH = "/set-password";
/** Where an email link lands; Supabase's email templates point here. */
export const EMAIL_LINK_PATH = "/auth/confirm";

/** The session as the sign-in screens see it. */
export type SessionState =
  | { kind: "none" }
  /** A session whose person has no enabled profile: denied (Story 6.1). */
  | { kind: "inactive" }
  | { kind: "active"; landing: string };

interface Deps {
  auth: AuthGateway;
  profiles: ProfileRepository;
  now?: () => Date;
}

const inactive = () =>
  err({ code: "ACCOUNT_INACTIVE" as const, message: "No enabled profile for this account." });

/**
 * Sign-in, sign-up and email-link use cases. None of them needs an actor: they
 * run before there is one. None of them reads or grants a role from the session.
 */
export function makeSession({ auth, profiles, now = () => new Date() }: Deps) {
  /**
   * The person's profile. A confirmed self-sign-up on the company domain gets
   * one the first time it is needed (from the sign-up metadata, always as
   * account/sales/social); anyone else must have been added by an admin.
   */
  async function ensureProfile(user: SessionUser): Promise<Result<Profile | null>> {
    const found = await profiles.findByEmail(user.email);
    if (!found.ok || found.value !== null) return found;
    if (!isSignUpDomain(user.email)) return ok(null);
    const metadata = signUpMetadataSchema.safeParse(user.metadata);
    if (!metadata.success) return ok(null);
    const created = await profiles.create(profileFromSignUp(user.email, metadata.data, now()));
    if (created.ok) return created;
    // A parallel request created it first.
    return created.error.code === "PROFILE_EXISTS" ? profiles.findByEmail(user.email) : created;
  }

  /** Landing for a session user, or `ACCOUNT_INACTIVE` (and the session ends). */
  async function landingForUser(user: SessionUser): Promise<Result<string>> {
    const profile = await ensureProfile(user);
    if (!profile.ok) return profile;
    const landing = isUsable(profile.value) ? landingFor(profile.value.role) : null;
    if (landing === null) {
      await auth.signOut();
      return inactive();
    }
    return ok(landing);
  }

  return {
    async sessionState(): Promise<SessionState> {
      const user = await auth.currentUser();
      if (user === null) return { kind: "none" };
      const found = await profiles.findByEmail(user.email);
      if (!found.ok || !isUsable(found.value)) return { kind: "inactive" };
      const landing = landingFor(found.value.role);
      return landing === null ? { kind: "inactive" } : { kind: "active", landing };
    },

    async signIn(email: string, password: string): Promise<Result<string>> {
      const signedIn = await auth.signInWithPassword(email.trim(), password);
      if (!signedIn.ok) return signedIn;
      return landingForUser(signedIn.value);
    },

    /** `origin` is the app's own origin; the confirmation link returns to it. */
    async signUp(raw: unknown, origin: string): Promise<Result<void>> {
      const parsed = signUpInputSchema.safeParse(raw);
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
        const domain = parsed.error.issues.some((i) => i.message === "DOMAIN");
        return err({ code: domain ? "EMAIL_DOMAIN_NOT_ALLOWED" : "INVALID_INPUT", message: "Sign-up input is invalid.", details: { fields } });
      }
      const input = parsed.data;
      return auth.signUp(input.email, input.password, signUpMetadata(input), `${origin}${EMAIL_LINK_PATH}`);
    },

    /** Returns where to go next: the role's landing, or the set-password page for invites and resets. */
    async confirmEmailLink(link: EmailLink): Promise<Result<string>> {
      const verified = await auth.verifyEmailLink(link);
      if (!verified.ok) return verified;
      const landing = await landingForUser(verified.value);
      if (!landing.ok) return landing;
      const setsPassword = "type" in link && (link.type === "invite" || link.type === "recovery");
      return ok(setsPassword ? SET_PASSWORD_PATH : landing.value);
    },

    /** Always succeeds for a well-formed email, so the screen never tells who has an account. */
    async requestPasswordReset(email: string, origin: string): Promise<Result<void>> {
      const trimmed = email.trim();
      if (trimmed === "" || !trimmed.includes("@")) {
        return err({ code: "INVALID_INPUT", message: "Email is missing.", details: { fields: ["email"] } });
      }
      const sent = await auth.requestPasswordReset(trimmed, `${origin}${EMAIL_LINK_PATH}`);
      return !sent.ok && sent.error.code === "RATE_LIMITED" ? sent : ok(undefined);
    },

    /** Sets the signed-in person's password; returns their landing. */
    async setPassword(password: string): Promise<Result<string>> {
      const user = await auth.currentUser();
      if (user === null) return err({ code: "UNAUTHENTICATED", message: "No session to set a password for." });
      if (!passwordSchema.safeParse(password).success) {
        return err({ code: "INVALID_INPUT", message: "Password too short.", details: { fields: ["password"] } });
      }
      const updated = await auth.updatePassword(password);
      if (!updated.ok) return updated;
      return landingForUser(user);
    },

    signOut(): Promise<void> {
      return auth.signOut();
    },
  };
}
