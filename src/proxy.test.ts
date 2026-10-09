import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gate, isAuthorized, parseBasicAuth, REALM_HEADER, safeEqual } from "./proxy";

const CREDS = { user: "mac", password: "s3cret" };

const basic = (raw: string) => `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;

function request(path: string, authorization?: string): NextRequest {
  const headers = authorization === undefined ? undefined : { authorization };
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

const passesThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

async function expectChallenge(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toBe(REALM_HEADER);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(passesThrough(response)).toBe(false);
  expect(await response.text()).toBe("Authentication required.\n");
}

describe("module shape", () => {
  // Next runs the named `proxy` export on every path only while there is no
  // `config` (matcher) export; either change would silently narrow the gate.
  it("exports a proxy function and no config", async () => {
    const mod: Record<string, unknown> = await import("./proxy");
    expect(typeof mod.proxy).toBe("function");
    expect(mod).not.toHaveProperty("config");
    expect(mod).not.toHaveProperty("default");
  });
});

describe("parseBasicAuth", () => {
  it("decodes user and password", () => {
    expect(parseBasicAuth(basic("mac:s3cret"))).toEqual(CREDS);
  });

  it("accepts the scheme case-insensitively", () => {
    expect(parseBasicAuth(basic("mac:s3cret").replace("Basic", "basic"))).toEqual(CREDS);
  });

  it("splits on the first colon only", () => {
    expect(parseBasicAuth(basic("user:pa:ss"))).toEqual({ user: "user", password: "pa:ss" });
  });

  it("decodes UTF-8", () => {
    expect(parseBasicAuth(basic("mac:perché"))).toEqual({ user: "mac", password: "perché" });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["non-Basic scheme", `Bearer ${Buffer.from("mac:s3cret").toString("base64")}`],
    ["scheme only", "Basic"],
    ["scheme and space", "Basic "],
    ["bad base64", "Basic !!!not-base64!!!"],
    ["truncated base64", "Basic bWFjOnMzY3JldA"],
    ["no colon", basic("macs3cret")],
    ["extra token", `${basic("mac:s3cret")} extra`],
  ])("returns null for a %s header without throwing", (_, header) => {
    expect(() => parseBasicAuth(header)).not.toThrow();
    expect(parseBasicAuth(header)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("matches equal strings", () => {
    expect(safeEqual("s3cret", "s3cret")).toBe(true);
  });

  it("rejects strings of the same length", () => {
    expect(safeEqual("s3cret", "s3creT")).toBe(false);
  });

  it("rejects strings of differing lengths without throwing", () => {
    expect(() => safeEqual("s3cret", "s3cret-but-longer")).not.toThrow();
    expect(safeEqual("s3cret", "s3cret-but-longer")).toBe(false);
    expect(safeEqual("", "s3cret")).toBe(false);
  });
});

describe("isAuthorized", () => {
  it("accepts the right credentials", () => {
    expect(isAuthorized(basic("mac:s3cret"), CREDS)).toBe(true);
  });

  it("rejects a wrong user or password", () => {
    expect(isAuthorized(basic("max:s3cret"), CREDS)).toBe(false);
    expect(isAuthorized(basic("mac:wrong"), CREDS)).toBe(false);
  });

  it("accepts a password containing a colon", () => {
    expect(isAuthorized(basic("user:pa:ss"), { user: "user", password: "pa:ss" })).toBe(true);
  });
});

describe("gate", () => {
  it.each(["/", "/s/abc", "/_next/static/x.js", "/_next/image?url=x", "/no/such/page"])(
    "challenges %s without credentials",
    async (path) => {
      await expectChallenge(gate(request(path), CREDS));
    },
  );

  it.each([
    ["wrong user", basic("max:s3cret")],
    ["wrong password", basic("mac:wrong")],
    ["non-Basic scheme", "Bearer abc"],
    ["malformed header", "Basic"],
    ["bad base64", "Basic %%%"],
    ["no colon", basic("macs3cret")],
  ])("challenges a request with a %s", async (_, authorization) => {
    await expectChallenge(gate(request("/s/abc", authorization), CREDS));
  });

  it.each(["/", "/s/abc", "/_next/static/x.js", "/no/such/page"])(
    "lets %s through with valid credentials",
    (path) => {
      const response = gate(request(path, basic("mac:s3cret")), CREDS);
      expect(response.status).toBe(200);
      expect(passesThrough(response)).toBe(true);
    },
  );

  it("lets a password containing a colon through", () => {
    const creds = { user: "user", password: "pa:ss" };
    expect(passesThrough(gate(request("/", basic("user:pa:ss")), creds))).toBe(true);
  });

  it("lets everything through when the gate is off", () => {
    expect(passesThrough(gate(request("/s/abc"), null))).toBe(true);
  });
});

describe("proxy", () => {
  const SUPABASE = {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    SUPABASE_SECRET_KEY: "sb_secret_x",
  };

  beforeEach(() => {
    vi.resetModules();
    for (const [name, value] of Object.entries(SUPABASE)) vi.stubEnv(name, value);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the gate credentials from the environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BASIC_AUTH_USER", "mac");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "s3cret");
    const { proxy } = await import("./proxy");
    await expectChallenge(proxy(request("/s/abc")));
    expect(passesThrough(proxy(request("/s/abc", basic("mac:s3cret"))))).toBe(true);
  });

  it("does not gate in development when both variables are unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BASIC_AUTH_USER", undefined);
    vi.stubEnv("BASIC_AUTH_PASSWORD", undefined);
    const { proxy } = await import("./proxy");
    expect(passesThrough(proxy(request("/s/abc")))).toBe(true);
  });
});
