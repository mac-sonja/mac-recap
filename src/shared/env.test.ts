import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseEnv } from "./env";

const valid = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
};

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
});
