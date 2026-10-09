import { z } from "zod";

/**
 * The only place in the codebase that reads `process.env` (enforced by the
 * `no-restricted-syntax` lint rule). Secrets never carry the `NEXT_PUBLIC_`
 * prefix: all Supabase access happens on the server (AD-11).
 */
export const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
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
