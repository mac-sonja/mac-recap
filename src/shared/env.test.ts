import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseEnv, resolveGateCredentials } from "./env";

const valid = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
};

const gate = { BASIC_AUTH_USER: "mac", BASIC_AUTH_PASSWORD: "s3cret" };

describe("env", () => {
  it("parses a complete environment", () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it("throws a ZodError naming each missing variable", () => {
    const missing = { ...valid, SUPABASE_SECRET_KEY: undefined };
    expect(() => parseEnv(missing)).toThrow(ZodError);
    expect(() => parseEnv(missing)).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("lists every missing variable when several are absent", () => {
    const missing = { SUPABASE_URL: valid.SUPABASE_URL };
    expect(() => parseEnv(missing)).toThrow(/SUPABASE_PUBLISHABLE_KEY[\s\S]*SUPABASE_SECRET_KEY/);
  });

  it("rejects an invalid URL", () => {
    expect(() => parseEnv({ ...valid, SUPABASE_URL: "not a url" })).toThrow(/SUPABASE_URL/);
  });

  it("parses the gate variables and NODE_ENV when present", () => {
    const source = { ...valid, ...gate, NODE_ENV: "production" };
    expect(parseEnv(source)).toEqual(source);
  });

  it("does not require the gate variables (the worker never needs them)", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production" })).not.toThrow();
  });

  it.each(["BASIC_AUTH_USER", "BASIC_AUTH_PASSWORD"])("treats an empty %s as unset", (name) => {
    expect(parseEnv({ ...valid, ...gate, [name]: "" })[name as keyof typeof gate]).toBeUndefined();
  });
});

describe("resolveGateCredentials", () => {
  const resolve = (source: Record<string, string | undefined>) =>
    resolveGateCredentials(parseEnv({ ...valid, ...source }));

  it.each(["production", "staging", "development", "test", undefined])(
    "returns both credentials when both are set (NODE_ENV=%s)",
    (NODE_ENV) => {
      expect(resolve({ ...gate, NODE_ENV })).toEqual({ user: "mac", password: "s3cret" });
    },
  );

  it.each(["development", "test"])("turns the gate off when both are unset (NODE_ENV=%s)", (NODE_ENV) => {
    expect(resolve({ NODE_ENV })).toBeNull();
    expect(resolve({ NODE_ENV, BASIC_AUTH_USER: "", BASIC_AUTH_PASSWORD: "" })).toBeNull();
  });

  it.each(["production", "staging", "prod", undefined])(
    "requires both when NODE_ENV=%s, naming each missing variable",
    (NODE_ENV) => {
      expect(() => resolve({ NODE_ENV })).toThrow(
        /BASIC_AUTH_USER, BASIC_AUTH_PASSWORD[\s\S]*unless NODE_ENV is development or test/,
      );
    },
  );

  it.each([
    ["BASIC_AUTH_USER", { BASIC_AUTH_PASSWORD: "s3cret" }],
    ["BASIC_AUTH_PASSWORD", { BASIC_AUTH_USER: "mac" }],
    ["BASIC_AUTH_USER", { BASIC_AUTH_USER: "", BASIC_AUTH_PASSWORD: "s3cret" }],
    ["BASIC_AUTH_PASSWORD", { BASIC_AUTH_USER: "mac", BASIC_AUTH_PASSWORD: "" }],
  ])("names %s when it is unset or empty in production", (name, source) => {
    expect(() => resolve({ ...source, NODE_ENV: "production" })).toThrow(
      new RegExp(`Missing ${name}:`),
    );
  });

  it.each([
    ["BASIC_AUTH_USER", { BASIC_AUTH_PASSWORD: "s3cret" }],
    ["BASIC_AUTH_PASSWORD", { BASIC_AUTH_USER: "mac" }],
  ])("treats a lone variable in development as misconfigured, naming %s", (name, source) => {
    expect(() => resolve({ ...source, NODE_ENV: "development" })).toThrow(
      new RegExp(`Missing ${name}:`),
    );
  });

  it("never puts a credential value in the error", () => {
    const secret = "user-value-7f3k";
    let message = "";
    try {
      resolve({ BASIC_AUTH_USER: secret, NODE_ENV: "production" });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/BASIC_AUTH_PASSWORD/);
    expect(message).not.toContain(secret);
  });
});
