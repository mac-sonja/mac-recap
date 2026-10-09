import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/db.types";
import { getEnv } from "@/shared/env";

/**
 * Service-role (secret key) client for server-side data access (AD-11).
 * It bypasses RLS, so it never reaches the browser. Create one per call;
 * it keeps no session.
 */
export function createSupabaseAdminClient() {
  const env = getEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
