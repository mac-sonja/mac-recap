import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie, refreshSession } from "@/modules/access";
import { getGateCredentials, type GateCredentials } from "@/shared/env";

// Sign-in is the way in (Story 6.2): a page request without a session goes to
// `/sign-in`, except the sign-in screens and `/s/{token}`, the only page open to
// anyone (AR12). The HTTP basic-auth gate stays as an opt-in for non-production
// environments (staging); prod leaves it off. There is deliberately no
// `config.matcher`: without one, Proxy runs on every path, including `/s/*`,
// `/_next/*`, `public/` assets and 404s. Proxy uses the Node.js runtime by
// default, so `node:crypto` is available.

export const REALM_HEADER = 'Basic realm="MAC Recap", charset="UTF-8"';

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Parses an `Authorization: Basic <base64(user:password)>` header. Returns
 * `null` for anything else (missing, other scheme, bad base64, no colon); never
 * throws. The password is everything after the first colon.
 */
export function parseBasicAuth(header: string | null | undefined): GateCredentials | null {
  if (!header) return null;
  const match = /^Basic +(\S+) *$/i.exec(header);
  if (!match || !BASE64.test(match[1])) return null;
  const decoded = Buffer.from(match[1], "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon === -1) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

/**
 * Constant-time string comparison. Both sides are hashed first so inputs of
 * different lengths compare in the same time and never make `timingSafeEqual` throw.
 */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** True when the header carries exactly the expected credentials. Compares both fields every time. */
export function isAuthorized(header: string | null | undefined, expected: GateCredentials): boolean {
  const given = parseBasicAuth(header) ?? { user: "", password: "" };
  const userOk = safeEqual(given.user, expected.user);
  const passwordOk = safeEqual(given.password, expected.password);
  return userOk && passwordOk;
}

/** 401 challenge with no app content. */
export function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.\n", {
    status: 401,
    headers: {
      "WWW-Authenticate": REALM_HEADER,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Gate decision for one request; `credentials === null` means the gate is off (dev only). */
export function gate(request: NextRequest, credentials: GateCredentials | null): NextResponse {
  if (credentials === null) return NextResponse.next();
  return isAuthorized(request.headers.get("authorization"), credentials)
    ? NextResponse.next()
    : unauthorized();
}

/** Where a request without a session is sent (the same path as `SIGN_IN_PATH` in `app/_lib/surface.ts`). */
export const SIGN_IN_PATH = "/sign-in";

/** Pages anyone may open without a session: the sign-in screens, the email link and shared links. */
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/forgot-password", "/set-password", "/auth/", "/s/"];

/** True for a path that never needs a session: public pages, Next's own files and static assets. */
export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next/")) return true;
  // A file in `public/` (favicon.ico, an svg): the last segment has an extension.
  if (/\.[a-z0-9]+$/i.test(pathname.slice(pathname.lastIndexOf("/")))) return true;
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Sends a page request without a session cookie to sign-in. Only GET and HEAD:
 * a server action or form post answers 401 itself through `getActor()`. A cookie
 * that no longer holds a valid session is caught by the page (`resolveShellActor`).
 */
export function requireSession(request: NextRequest): NextResponse | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (isPublicPath(request.nextUrl.pathname) || hasSessionCookie(request)) return null;
  const url = request.nextUrl.clone();
  url.pathname = SIGN_IN_PATH;
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * The opt-in basic-auth gate first (staging only), then sign-in for pages
 * without a session, then the Supabase Auth session refresh (Story 6.1): an
 * expiring token is renewed here, where cookies can still be written. Who may do
 * what is decided per request by `getActor()`.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const gated = gate(request, getGateCredentials());
  if (gated.status === 401) return gated;
  return requireSession(request) ?? refreshSession(request);
}
