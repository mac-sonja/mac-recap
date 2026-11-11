import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// The people the DB suite acts as (Story 6.4: a DB-backed run against signed-in test
// users). `getActor()` resolves them the production way: Supabase Auth session (cookies) →
// profile by email → role. The seeded dev owner/designer is disabled at the sign-in cutover
// and stays disabled.

/** The test owner/designer's `profile.id`. Tests that change its role always restore `owner_designer`. */
export const TEST_ACTOR_ID = "00000000-0000-4000-8000-0000000000d1";
export const TEST_ACTOR_EMAIL = "db-test-owner@menatcode.it";
export const TEST_ACTOR_NAME = "DB test owner/designer";

/** The roles a signed-in test user holds: one user each (B9 part 2). */
export const TEST_ROLES = ["owner_designer", "admin", "account_sales_social"] as const;
export type TestRole = (typeof TEST_ROLES)[number];

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

/**
 * One test user per role. The owner/designer is the one every DB test acts as by default
 * (`TEST_ACTOR_*`); the admin and account/sales/social users serve the signed-in permission
 * run (test/db/permissions.db.test.ts). Local stack only: they exist nowhere else.
 */
export const TEST_USERS: Readonly<Record<TestRole, TestUser>> = {
  owner_designer: { id: TEST_ACTOR_ID, email: TEST_ACTOR_EMAIL, name: TEST_ACTOR_NAME },
  admin: { id: "00000000-0000-4000-8000-0000000000d2", email: "db-test-admin@menatcode.it", name: "DB test admin" },
  account_sales_social: { id: "00000000-0000-4000-8000-0000000000d3", email: "db-test-account@menatcode.it", name: "DB test account/sales/social" },
};

/** Local stack only: the test users exist nowhere else. The owner's is unchanged from before B9 part 2. */
const PASSWORDS: Readonly<Record<TestRole, string>> = {
  owner_designer: "db-test-owner-local-only",
  admin: "db-test-admin-local-only",
  account_sales_social: "db-test-account-local-only",
};

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
 * Makes sure every test user exists, enabled, with its role: an Auth user (confirmed,
 * created through the Auth admin API with the secret key) and its `profile` row.
 * Idempotent, so reruns against the same stack reuse both.
 */
export async function ensureTestUsers(): Promise<void> {
  const env = dbEnv();
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  let listed: { id: string; email?: string }[] | null = null;

  const pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 1 });
  try {
    for (const role of TEST_ROLES) {
      const { id, email, name } = TEST_USERS[role];
      const password = PASSWORDS[role];
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) {
        if (created.error.code !== "email_exists") throw new Error(`test user ${role}: ${created.error.code ?? created.error.message}`);
        // Left by an earlier run: reset the password so sign-in below works.
        if (listed === null) {
          const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
          if (error) throw new Error(`test user lookup: ${error.code ?? error.message}`);
          listed = data.users;
        }
        const user = listed.find((u) => u.email?.toLowerCase() === email);
        if (!user) throw new Error(`test user ${role} exists but was not listed`);
        const updated = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
        if (updated.error) throw new Error(`test user ${role} update: ${updated.error.code ?? updated.error.message}`);
      }

      // Also undoes a role change, a job title or a disable left behind by an interrupted run.
      await pool.query(
        `insert into public.profile (id, email, display_name, role) values ($1, $2, $3, $4)
         on conflict (id) do update set email = excluded.email, display_name = excluded.display_name,
           role = excluded.role, disabled_at = null, designer_requested_at = null`,
        [id, email, name, role],
      );
    }
  } finally {
    await pool.end();
  }
}

/** Signs `role`'s test user in with email and password; returns the session cookies a browser would hold. */
export async function signInTestUser(role: TestRole): Promise<TestCookie[]> {
  const env = dbEnv();
  const store = new TestCookieStore();
  const client = createServerClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: TEST_USERS[role].email, password: PASSWORDS[role] });
  if (error) throw new Error(`test user ${role} sign-in: ${error.code ?? error.message}`);
  const cookies = store.getAll();
  if (cookies.length === 0) throw new Error(`test user ${role} sign-in set no session cookie`);
  return cookies;
}

/**
 * The cookie store `cookies()` of `next/headers` returns in the DB suite (test/db/setup.ts
 * mocks it): the signed-in owner/designer's by default. `switchSession` switches it, e.g. to
 * another role's store, or to an empty one for a request without a session.
 */
let currentStore = new TestCookieStore();

export function currentCookieStore(): TestCookieStore {
  return currentStore;
}

export function switchSession(store: TestCookieStore): void {
  currentStore = store;
}
