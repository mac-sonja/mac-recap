import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/shared/env";

/** True when the request carries a Supabase Auth cookie (`sb-…`). */
export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => name.startsWith("sb-"));
}

/**
 * Refreshes an expiring Supabase Auth session in Proxy, the one place that can
 * write cookies before a Server Component renders (Supabase SSR pattern). It
 * only renews the token: who may do what is decided per request by `getActor()`.
 * Requests with no auth cookie pass through untouched.
 */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!hasSessionCookie(request)) return response;

  const env = getEnv();
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}
