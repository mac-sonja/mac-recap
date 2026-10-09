import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VARS = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
};

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
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
});
