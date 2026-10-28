import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { hasSessionCookie, refreshSession } from "./proxy-session";

const request = (cookie?: string) =>
  new NextRequest("http://localhost/home", cookie ? { headers: { cookie } } : undefined);

describe("refreshSession", () => {
  it("detects Supabase Auth cookies only", () => {
    expect(hasSessionCookie(request("sb-abc-auth-token=x"))).toBe(true);
    expect(hasSessionCookie(request("mac-theme=dark"))).toBe(false);
    expect(hasSessionCookie(request())).toBe(false);
  });

  it("passes a request with no session through without calling Supabase", async () => {
    const response = await refreshSession(request("mac-theme=dark"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
