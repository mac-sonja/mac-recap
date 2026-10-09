import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getGateCredentials, type GateCredentials } from "@/shared/env";

// HTTP basic-auth gate (IR-A2) in front of every request until login ships in
// Epic 6. There is deliberately no `config.matcher`: without one, Proxy runs on
// every path, including `/s/*`, `/_next/*`, `public/` assets and 404s. Proxy
// uses the Node.js runtime by default, so `node:crypto` is available.

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

export function proxy(request: NextRequest): NextResponse {
  return gate(request, getGateCredentials());
}
