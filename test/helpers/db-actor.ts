import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// The person the DB suite acts as (Story 6.4: a DB-backed run against a
// signed-in test user). `getActor()` resolves it the production way: Supabase
// Auth session (cookies) → profile by email → role. The seeded dev
// owner/designer is disabled at the sign-in cutover and stays disabled.

/** The test owner/designer's `profile.id`. Tests that change its role always restore `owner_designer`. */
export const TEST_ACTOR_ID = "00000000-0000-4000-8000-0000000000d1";
export const TEST_ACTOR_EMAIL = "db-test-owner@menatcode.it";
export const TEST_ACTOR_NAME = "DB test owner/designer";
/** Local stack only: the test user exists nowhere else. */
const TEST_ACTOR_PASSWORD = "db-test-owner-local-only";

export interface TestCookie {
  name: string;
  value: string;
}

/**
 * An in-memory stand-in for the `cookies()` store of `next/headers`, holding
 * the test user's session. `createSupabaseServerClient` reads and refreshes it
 * through `getAll` / `set`, as it does a request's cookies.
 */
export class TestCookieStore {
  private readonly jar = new Map<string, string>();

  constructor(cookies: readonly TestCookie[] = []) {
    for (const { name, value } of cookies) this.jar.set(name, value);
  }

  get(name: string): TestCookie | undefined {
    const value = this.jar.get(name);
    return value === undefined ? undefined : { name, value };
  }

  getAll(): TestCookie[] {
    return [...this.jar].map(([name, value]) => ({ name, value }));
  }

  has(name: string): boolean {
    return this.jar.has(name);
  }

  set(nameOrCookie: string | TestCookie, value?: string, options?: { maxAge?: number }): this {
    const cookie = typeof nameOrCookie === "string" ? { name: nameOrCookie, value: value ?? "" } : nameOrCookie;
    // A cookie set to expire (sign-out, chunk cleanup) is removed, as a browser would.
    if (options?.maxAge === 0 || cookie.value === "") this.jar.delete(cookie.name);
    else this.jar.set(cookie.name, cookie.value);
    return this;
  }

  delete(name: string): boolean {
    return this.jar.delete(name);
  }
}

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;

function dbEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
  }
  return Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<(typeof REQUIRED)[number], string>;
}

/**
 * Makes sure the test user exists, enabled, as owner/designer: an Auth user
 * (confirmed, created through the Auth admin API with the secret key) and its
 * `profile` row. Idempotent, so reruns against the same stack reuse both.
 */
export async function ensureTestActor(): Promise<void> {
  const env = dbEnv();
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const created = await admin.auth.admin.createUser({
    email: TEST_ACTOR_EMAIL,
    password: TEST_ACTOR_PASSWORD,
    email_confirm: true,
  });
  if (created.error) {
    if (created.error.code !== "email_exists") throw new Error(`test user: ${created.error.code ?? created.error.message}`);
    // Left by an earlier run: reset the password so sign-in below works.
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`test user lookup: ${error.code ?? error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === TEST_ACTOR_EMAIL);
    if (!user) throw new Error("test user exists but was not listed");
    const updated = await admin.auth.admin.updateUserById(user.id, { password: TEST_ACTOR_PASSWORD, email_confirm: true });
    if (updated.error) throw new Error(`test user update: ${updated.error.code ?? updated.error.message}`);
  }

  const pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 1 });
  try {
    // Also undoes a role change or a disable left behind by an interrupted run.
    await pool.query(
      `insert into public.profile (id, email, display_name, role) values ($1, $2, $3, 'owner_designer')
       on conflict (id) do update set email = excluded.email, display_name = excluded.display_name,
         role = 'owner_designer', disabled_at = null, designer_requested_at = null`,
      [TEST_ACTOR_ID, TEST_ACTOR_EMAIL, TEST_ACTOR_NAME],
    );
  } finally {
    await pool.end();
  }
}

/** Signs the test user in with email and password; returns the session cookies a browser would hold. */
export async function signInTestActor(): Promise<TestCookie[]> {
  const env = dbEnv();
  const store = new TestCookieStore();
  const client = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: TEST_ACTOR_EMAIL, password: TEST_ACTOR_PASSWORD });
  if (error) throw new Error(`test user sign-in: ${error.code ?? error.message}`);
  const cookies = store.getAll();
  if (cookies.length === 0) throw new Error("test user sign-in set no session cookie");
  return cookies;
}
