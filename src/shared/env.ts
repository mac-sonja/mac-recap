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
  // Basic-auth gate, web process only and opt-in (Story 6.2): staging sets both to
  // stay private, prod sets neither. An empty value counts as unset.
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

/**
 * Web-only rule for the basic-auth gate (Story 6.2: sign-in replaced it as the
 * way in). The gate is on only when both variables are set, in any `NODE_ENV`;
 * a non-production environment such as staging sets both to stay private.
 * Returns `null` when both are unset; setting just one is a misconfiguration and
 * throws an `Error` naming the missing variable (never a value).
 */
export function resolveGateCredentials(env: Env): GateCredentials | null {
  const { BASIC_AUTH_USER: user, BASIC_AUTH_PASSWORD: password } = env;
  if (user && password) return { user, password };
  const missing = GATE_VARS.filter((name) => !env[name]);
  if (missing.length === GATE_VARS.length) return null;
  throw new Error(`Missing ${missing.join(", ")}: set both basic-auth variables or neither.`);
}

/** Gate credentials for the web process (`proxy.ts`, boot check); `null` when the gate is off. */
export function getGateCredentials(): GateCredentials | null {
  return resolveGateCredentials(getEnv());
}
