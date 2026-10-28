import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VARS = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
};

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // Isolate from the developer's shell: the gate is off unless a test sets it.
  vi.stubEnv("BASIC_AUTH_USER", undefined);
  vi.stubEnv("BASIC_AUTH_PASSWORD", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function runRegister() {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  const { register } = await import("./instrumentation");
  await register();
  return exit;
}

describe("instrumentation register", () => {
  it("skips the check outside the Node.js runtime", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("./instrumentation");
    await register();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits with code 1 when a required variable is missing", async () => {
    for (const [name, value] of Object.entries(VARS)) vi.stubEnv(name, value);
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    const exit = await runRegister();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not exit when the environment is valid", async () => {
    for (const [name, value] of Object.entries(VARS)) vi.stubEnv(name, value);
    const exit = await runRegister();
    expect(exit).not.toHaveBeenCalled();
  });

  describe("basic-auth gate", () => {
    const loggedError = () =>
      vi.mocked(console.error).mock.calls.map((args) => args.map(String).join(" ")).join("\n");

    beforeEach(() => {
      for (const [name, value] of Object.entries(VARS)) vi.stubEnv(name, value);
    });

    it.each([
      ["user unset", { BASIC_AUTH_PASSWORD: "s3cret" }, "BASIC_AUTH_USER"],
      ["password unset", { BASIC_AUTH_USER: "mac" }, "BASIC_AUTH_PASSWORD"],
      ["user empty", { BASIC_AUTH_USER: "", BASIC_AUTH_PASSWORD: "s3cret" }, "BASIC_AUTH_USER"],
      ["password empty", { BASIC_AUTH_USER: "mac", BASIC_AUTH_PASSWORD: "" }, "BASIC_AUTH_PASSWORD"],
    ])("exits 1 in production with half a gate (%s), naming the missing variable", async (_, gate, name) => {
      vi.stubEnv("NODE_ENV", "production");
      for (const [key, value] of Object.entries(gate)) vi.stubEnv(key, value);
      const exit = await runRegister();
      expect(exit).toHaveBeenCalledWith(1);
      expect(loggedError()).toMatch(new RegExp(`Missing (\\w+, )?${name}`));
    });

    it("starts in production with both variables set", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("BASIC_AUTH_USER", "mac");
      vi.stubEnv("BASIC_AUTH_PASSWORD", "s3cret");
      const exit = await runRegister();
      expect(exit).not.toHaveBeenCalled();
    });

    it("starts in development with both variables unset (no gate)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      const exit = await runRegister();
      expect(exit).not.toHaveBeenCalled();
    });

    it("starts in development with both variables empty (no gate)", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BASIC_AUTH_USER", "");
      vi.stubEnv("BASIC_AUTH_PASSWORD", "");
      const exit = await runRegister();
      expect(exit).not.toHaveBeenCalled();
    });

    it.each(["production", "staging", undefined])(
      "starts when NODE_ENV=%s and both variables are unset (no gate; Story 6.2)",
      async (NODE_ENV) => {
        vi.stubEnv("NODE_ENV", NODE_ENV);
        const exit = await runRegister();
        expect(exit).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["BASIC_AUTH_PASSWORD", { BASIC_AUTH_USER: "mac" }],
      ["BASIC_AUTH_USER", { BASIC_AUTH_PASSWORD: "s3cret" }],
    ])("exits 1 in development when only one is set, naming %s", async (name, gate) => {
      vi.stubEnv("NODE_ENV", "development");
      for (const [key, value] of Object.entries(gate)) vi.stubEnv(key, value);
      const exit = await runRegister();
      expect(exit).toHaveBeenCalledWith(1);
      expect(loggedError()).toContain(name);
    });
  });
});

// The preflight (`dist/preflight.js`) runs only in front of the standalone
// server.js. Since Story 6.2 the gate is opt-in there too: no variables means no
// gate, half a gate stops the web. Tested here so BASIC_AUTH stays out of other files.
describe("preflight", () => {
  const loggedError = () =>
    vi.mocked(console.error).mock.calls.map((args) => args.map(String).join(" ")).join("\n");

  async function runPreflight() {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await import("./preflight");
    return exit;
  }

  beforeEach(() => {
    for (const [name, value] of Object.entries(VARS)) vi.stubEnv(name, value);
  });

  it.each(["development", "test", "production", undefined])(
    "passes with NODE_ENV=%s and the gate unset (prod runs without basic auth)",
    async (NODE_ENV) => {
      vi.stubEnv("NODE_ENV", NODE_ENV);
      const exit = await runPreflight();
      expect(exit).not.toHaveBeenCalled();
    },
  );

  it("exits 1 in production when only the user is set, naming the password", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BASIC_AUTH_USER", "mac");
    const exit = await runPreflight();
    expect(exit).toHaveBeenCalledWith(1);
    expect(loggedError()).toMatch(/Missing BASIC_AUTH_PASSWORD/);
  });

  it("exits 1 in development when only the password is missing, naming it", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BASIC_AUTH_USER", "mac");
    const exit = await runPreflight();
    expect(exit).toHaveBeenCalledWith(1);
    expect(loggedError()).toMatch(/Missing BASIC_AUTH_PASSWORD/);
  });

  it("passes in development with both gate variables set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BASIC_AUTH_USER", "mac");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "s3cret");
    const exit = await runPreflight();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits 1 when a Supabase variable is missing", async () => {
    vi.stubEnv("BASIC_AUTH_USER", "mac");
    vi.stubEnv("BASIC_AUTH_PASSWORD", "s3cret");
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
    const exit = await runPreflight();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
