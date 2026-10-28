import type { AuthAdmin } from "@/modules/access/application/ports";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** Supabase Auth admin calls (service role, server only). */
export function createSupabaseAuthAdmin(client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient): AuthAdmin {
  return {
    async invite(email, redirectTo) {
      const { error } = await client().auth.admin.inviteUserByEmail(email, { redirectTo });
      if (!error) return ok(true);
      if (error.code === "email_exists" || error.code === "user_already_exists") return ok(false);
      if (error.code === "over_email_send_rate_limit") return err({ code: "RATE_LIMITED", message: "Too many emails." });
      log.error(`invite failed: ${error.code ?? error.status ?? "unknown"}`);
      return err({ code: "INVITE_FAILED", message: "Could not send the invite." });
    },
  };
}
