import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/db.types";
import { getEnv } from "@/shared/env";

/**
 * Service-role (secret key) client for the rendering module's data access (AD-11):
 * the `export` table and the `rendering` bucket. It bypasses RLS, so it never reaches
 * the browser. Each module owns its own client.
 */
export function createSupabaseAdminClient() {
  const env = getEnv();
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
