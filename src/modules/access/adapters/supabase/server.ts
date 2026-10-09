import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/shared/env";

/**
 * Cookie-aware Supabase client for server code, moved from the starter's
 * `lib/supabase/server.ts`. Create one per request; never cache it globally.
 * Used by the Epic 6 `getActor()` resolver; until then nothing calls it.
 */
export async function createSupabaseServerClient() {
  const env = getEnv();
  const cookieStore = await cookies();

  return createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
        }
      },
    },
  });
}
