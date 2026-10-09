// DB-level checks of the `profile` migration against the local Supabase stack.
// Run with `npm run test:db` (scripts/test-db.sh), which exports SUPABASE_URL,
// SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY and SUPABASE_DB_URL from
// `supabase status`. Excluded from `npm test`.
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEV_ACTOR_ID, ROLES, SYSTEM_ACTOR_ID } from "@/modules/access/domain/actor";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<
  (typeof REQUIRED)[number],
  string
>;

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 2 });
  // Undo a disable left behind by an interrupted run (the seed value is null).
  await pool.query("update public.profile set disabled_at = null where id = $1", [DEV_ACTOR_ID]);
});

afterAll(async () => {
  await pool.end();
});

/** Runs `sql` as `role` inside a transaction that is always rolled back. */
async function asRole(role: string, sql: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    return await client.query(sql);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // Keep the original error; the client is still released below.
    }
    client.release();
  }
}

describe("seed rows", () => {
  it("has exactly the system and dev owner/designer profiles", async () => {
    const { rows } = await pool.query(
      "select id, email, display_name, role, disabled_at from public.profile order by id",
    );
    expect(rows).toEqual([
      {
        id: SYSTEM_ACTOR_ID,
        email: "system@mac-recap.invalid",
        display_name: "System",
        role: "system",
        disabled_at: null,
      },
      {
        id: DEV_ACTOR_ID,
        email: "dev-owner-designer@mac-recap.invalid",
        display_name: "Dev owner/designer",
        role: "owner_designer",
        disabled_at: null,
      },
    ]);
  });
});

describe("schema guards", () => {
  it("enables RLS on profile", async () => {
    const { rows } = await pool.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_catalog.pg_class where oid = 'public.profile'::regclass",
    );
    expect(rows).toEqual([{ relrowsecurity: true }]);
  });

  it("has no policies on profile", async () => {
    const { rows } = await pool.query<{ count: number }>(
      "select count(*)::int as count from pg_catalog.pg_policy where polrelid = 'public.profile'::regclass",
    );
    expect(rows).toEqual([{ count: 0 }]);
  });

  it("checks role against exactly ROLES", async () => {
    const { rows } = await pool.query<{ def: string }>(
      `select pg_catalog.pg_get_constraintdef(oid) as def from pg_catalog.pg_constraint
       where conrelid = 'public.profile'::regclass and contype = 'c'`,
    );
    const roleChecks = rows.map(({ def }) => def).filter((def) => /\brole\b/.test(def));
    expect(roleChecks).toHaveLength(1);
    expect([...roleChecks[0].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...ROLES]);
  });
});

describe("browser key", () => {
  const browser = () =>
    createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

  it("is refused reading profile (permission denied)", async () => {
    const { data, error } = await browser().from("profile").select("*");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("is refused inserting into profile (permission denied)", async () => {
    const { error } = await browser()
      .from("profile")
      .insert({ email: "intruder@mac-recap.invalid", display_name: "Intruder", role: "admin" });
    expect(error?.code).toBe("42501");
  });
});

describe("DB roles", () => {
  const statements = {
    select: "select * from public.profile",
    insert:
      "insert into public.profile (email, display_name, role) values ('intruder@mac-recap.invalid', 'Intruder', 'admin')",
    update: "update public.profile set role = 'admin'",
    delete: "delete from public.profile",
  };
  const cases = ["anon", "authenticated"].flatMap((role) =>
    Object.entries(statements).map(([verb, sql]) => [role, verb, sql] as const),
  );

  it.each(cases)("%s gets permission denied on %s", async (role, _verb, sql) => {
    await expect(asRole(role, sql)).rejects.toMatchObject({ code: "42501" });
  });
});

describe("real adapter", () => {
  // Imported lazily so getEnv() (cached on first use) sees the exported env.
  const loadAccess = () => import("@/modules/access");

  it("getActor() resolves the dev owner/designer", async () => {
    const { getActor } = await loadAccess();
    expect(await getActor()).toEqual({
      ok: true,
      value: {
        id: DEV_ACTOR_ID,
        email: "dev-owner-designer@mac-recap.invalid",
        displayName: "Dev owner/designer",
        role: "owner_designer",
      },
    });
  });

  it("getActor() is UNAUTHENTICATED while the dev profile is disabled", async () => {
    const { getActor } = await loadAccess();
    // getActor() reads through PostgREST on its own connection, so a rolled-back
    // transaction would be invisible to it: disable, then always restore.
    const { rows } = await pool.query<{ disabled_at: Date | null }>(
      "select disabled_at from public.profile where id = $1",
      [DEV_ACTOR_ID],
    );
    expect(rows).toHaveLength(1);
    const original = rows[0].disabled_at;
    try {
      await pool.query("update public.profile set disabled_at = now() where id = $1", [DEV_ACTOR_ID]);
      const result = await getActor();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
    } finally {
      await pool.query("update public.profile set disabled_at = $2 where id = $1", [DEV_ACTOR_ID, original]);
    }
  });
});
