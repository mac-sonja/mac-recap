import type { AuthError, SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthGateway, SessionUser } from "@/modules/access/application/ports";
import { log } from "@/shared/log";
import { err, ok, type AppError, type Result } from "@/shared/result";
import { createSupabaseServerClient } from "./server";

/** Maps a Supabase Auth error to the gateway's codes; details stay server-side. */
export function toAuthError(error: AuthError): AppError {
  switch (error.code) {
    case "invalid_credentials":
      return { code: "INVALID_CREDENTIALS", message: "Wrong email or password." };
    case "email_not_confirmed":
      return { code: "EMAIL_NOT_CONFIRMED", message: "The email address is not confirmed yet." };
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return { code: "RATE_LIMITED", message: "Too many attempts." };
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return { code: "LINK_INVALID", message: "The email link is expired or already used." };
    case "weak_password":
      return { code: "INVALID_INPUT", message: "Password too weak.", details: { fields: ["password"] } };
    default:
      log.error(`auth call failed: ${error.code ?? error.status ?? "unknown"}`);
      return { code: "AUTH_FAILED", message: "Supabase Auth call failed." };
  }
}

function toSessionUser(user: Pick<User, "email" | "user_metadata"> | null): SessionUser | null {
  return user?.email ? { email: user.email, metadata: user.user_metadata ?? {} } : null;
}

type ServerClient = SupabaseClient;

export function createSupabaseAuthGateway(
  client: () => Promise<ServerClient> = createSupabaseServerClient as () => Promise<ServerClient>,
): AuthGateway {
  const failed = (error: AuthError): Result<never> => err(toAuthError(error));
  return {
    async currentUser() {
      // getClaims verifies the access token's signature; the email and the
      // sign-up metadata are claims of that token. The role is never read here.
      const { data, error } = await (await client()).auth.getClaims();
      if (error || !data) return null;
      const { email, user_metadata } = data.claims as { email?: string; user_metadata?: unknown };
      return email ? { email, metadata: user_metadata ?? {} } : null;
    },

    async signInWithPassword(email, password) {
      const { data, error } = await (await client()).auth.signInWithPassword({ email, password });
      if (error) return failed(error);
      const user = toSessionUser(data.user);
      return user ? ok(user) : err({ code: "AUTH_FAILED", message: "Signed in without an email." });
    },

    async signUp(email, password, metadata, redirectTo) {
      const { error } = await (await client()).auth.signUp({
        email,
        password,
        options: { data: metadata, emailRedirectTo: redirectTo },
      });
      return error ? failed(error) : ok(undefined);
    },

    async verifyEmailLink(link) {
      const auth = (await client()).auth;
      const { data, error } =
        "code" in link
          ? await auth.exchangeCodeForSession(link.code)
          : await auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
      if (error) return failed(error);
      const user = toSessionUser(data.user);
      return user ? ok(user) : err({ code: "LINK_INVALID", message: "The link has no user." });
    },

    async requestPasswordReset(email, redirectTo) {
      const { error } = await (await client()).auth.resetPasswordForEmail(email, { redirectTo });
      return error ? failed(error) : ok(undefined);
    },

    async updatePassword(password) {
      const { error } = await (await client()).auth.updateUser({ password });
      return error ? failed(error) : ok(undefined);
    },

    async signOut() {
      await (await client()).auth.signOut();
    },
  };
}
