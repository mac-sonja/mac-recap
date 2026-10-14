import { z } from "zod";

/** Optional string where an empty value counts as unset. */
const optionalNonEmpty = z
  .string()
  .optional()
  .transform((value) => value || undefined);

/**
 * The only place in the codebase that reads `process.env` (enforced by the
 * `no-restricted-syntax` lint rule). Secrets never carry the `NEXT_PUBLIC_`
 * prefix: all Supabase access happens on the server (AD-11).
 */
export const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  // Basic-auth gate (IR-A2), web process only. Optional here so the worker never
  // needs them; an empty value counts as unset. `resolveGateCredentials` decides
  // when the web process requires them.
  BASIC_AUTH_USER: optionalNonEmpty,
  BASIC_AUTH_PASSWORD: optionalNonEmpty,
  NODE_ENV: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Validates an environment source; throws a `ZodError` naming every missing or invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

let cached: Env | undefined;

/** Validated environment, parsed once. Called at process startup to fail fast. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export type GateCredentials = { user: string; password: string };

const GATE_VARS = ["BASIC_AUTH_USER", "BASIC_AUTH_PASSWORD"] as const;

/** NODE_ENV values under which the gate is optional; any other value (or none) requires it. */
const GATE_OPTIONAL_IN = new Set(["development", "test"]);

/**
 * Web-only rule for the basic-auth gate. Both variables are required unless
 * `NODE_ENV` is `development` or `test`; there the gate is on only when both are
 * set, and setting just one is a misconfiguration. Returns `null` when the gate
 * is off; throws an `Error` naming each missing variable (never their values).
 */
export function resolveGateCredentials(env: Env): GateCredentials | null {
  const { BASIC_AUTH_USER: user, BASIC_AUTH_PASSWORD: password } = env;
  if (user && password) return { user, password };
  const missing = GATE_VARS.filter((name) => !env[name]);
  const optional = env.NODE_ENV !== undefined && GATE_OPTIONAL_IN.has(env.NODE_ENV);
  if (optional && missing.length === GATE_VARS.length) return null;
  const reason = optional
    ? "set both basic-auth variables or neither"
    : "the basic-auth gate is required unless NODE_ENV is development or test";
  throw new Error(`Missing ${missing.join(", ")}: ${reason}.`);
}

/** Gate credentials for the web process (`proxy.ts`, boot check); `null` when the gate is off. */
export function getGateCredentials(): GateCredentials | null {
  return resolveGateCredentials(getEnv());
}
