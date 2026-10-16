// DB-level checks of the `job` migration and its jobs_* functions, plus the
// real jobs adapter, against the local Supabase stack. Run with `npm run test:db`.
// Most tests work inside a transaction that is rolled back. Inside one, now() is
// fixed, so lease and backoff times can be compared exactly, and an expired lease
// is simulated by moving `locked_until` into the past. Test jobs are created
// with an old `created_at`, so jobs_claim (oldest first) reaches them before any
// other row; a claim can still return some other claimable row, so assertions
// look only at the test's own ids. Tests that must commit delete their rows after.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_DB_URL"] as const;
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing ${missing.join(", ")}: run the DB suite with \`npm run test:db\` (start the stack with \`npm run db:start\`).`);
}
const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name] as string])) as Record<
  (typeof REQUIRED)[number],
  string
>;

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";
const OLD = "2000-01-01T00:00:00Z";

interface JobRow {
  id: string;
  kind: string;
  subject_id: string;
  input_hash: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  locked_until: Date | null;
  error: { code: string; message: string } | null;
  finished_at: Date | null;
}

let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 4 });
});

afterAll(async () => {
  await pool.end();
});

/** Runs `fn` on one connection inside a transaction that is always rolled back. */
async function inRolledBackTx<T>(fn: (c: pg.PoolClient) => Promise<T>, role?: string): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (role) await client.query(`set local role ${role}`);
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // Keep the original error; the client is still released below.
    }
    client.release();
  }
}

/** Inserts a job directly (as the table owner), old enough to be claimed first. */
async function insertJob(c: pg.Pool | pg.ClientBase, over: Partial<Record<keyof JobRow | "created_at", unknown>> = {}): Promise<JobRow> {
  const row = {
    kind: "rendition",
    subject_id: randomUUID(),
    input_hash: randomUUID(),
    status: "queued",
    attempts: 0,
    locked_until: null,
    finished_at: null,
    created_at: OLD,
    ...over,
  };
  const { rows } = await c.query<JobRow>(
    `insert into public.job (kind, subject_id, input_hash, status, attempts, locked_until, finished_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
    [row.kind, row.subject_id, row.input_hash, row.status, row.attempts, row.locked_until, row.finished_at, row.created_at],
  );
  return rows[0];
}

const enqueueSql = "select * from public.jobs_enqueue($1, $2::uuid, $3, $4::jsonb)";
const enqueue = (c: pg.ClientBase, kind: string, subject: string, hash: string, payload: unknown = {}) =>
  c.query<JobRow>(enqueueSql, [kind, subject, hash, JSON.stringify(payload)]).then((r) => r.rows);
const claim = (c: pg.ClientBase, kinds: string[]) =>
  c.query<JobRow>("select * from public.jobs_claim($1::text[])", [kinds]).then((r) => r.rows);
const fenced = (c: pg.ClientBase, fn: "jobs_renew" | "jobs_finish" | "jobs_release", id: string, attempts: number) =>
  c.query<{ ok: boolean }>(`select public.${fn}($1::uuid, $2::integer) as ok`, [id, attempts]).then((r) => r.rows[0].ok);
const fail = (c: pg.ClientBase, id: string, attempts: number, retryAfterMs: number, retryable: boolean, error: unknown = { code: "X_FAILED", message: "m" }) =>
  c
    .query<JobRow>("select * from public.jobs_fail($1::uuid, $2::integer, $3::jsonb, $4::integer, $5::boolean)", [
      id,
      attempts,
      JSON.stringify(error),
      retryAfterMs,
      retryable,
    ])
    .then((r) => r.rows);
const jobById = (c: pg.ClientBase, id: string) =>
  c.query<JobRow>("select * from public.job where id = $1", [id]).then((r) => r.rows[0]);
/** True when `locked_until` is exactly now() + `interval` (now() is fixed inside the transaction). */
const lockedFor = (c: pg.ClientBase, id: string, interval: string) =>
  c
    .query<{ exact: boolean }>(`select locked_until = now() + $2::interval as exact from public.job where id = $1`, [id, interval])
    .then((r) => r.rows[0].exact);
const deleteJobs = (ids: string[]) => pool.query("delete from public.job where id = any($1::uuid[])", [ids]);

describe("migration", () => {
  it("creates job with RLS on, the live-input unique index and jobs_claim()", async () => {
    const { rows: table } = await pool.query(
      "select relrowsecurity from pg_class where oid = 'public.job'::regclass",
    );
    expect(table).toEqual([{ relrowsecurity: true }]);

    const { rows: index } = await pool.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname = 'public' and indexname = 'job_live_input_key'",
    );
    expect(index).toHaveLength(1);
    expect(index[0].indexdef).toMatch(/^CREATE UNIQUE INDEX .* \(kind, subject_id, input_hash\) WHERE \(status = ANY \(ARRAY\['queued'::text, 'running'::text\]\)\)$/);

    const { rows: fns } = await pool.query(
      `select p.proname, p.prosecdef as definer, p.proconfig as config,
              has_function_privilege('service_role', p.oid, 'execute') as service_role,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'jobs\\_%'
        order by p.proname`,
    );
    expect(fns.map((f) => f.proname)).toEqual(["jobs_claim", "jobs_enqueue", "jobs_fail", "jobs_finish", "jobs_release", "jobs_renew"]);
    for (const f of fns) {
      expect(f, f.proname).toMatchObject({ definer: true, config: ['search_path=""'], service_role: true, anon: false, authenticated: false });
    }
  });
});

describe("jobs_enqueue", () => {
  it("creates a queued job with 0 of 3 attempts and the payload", async () => {
    await inRolledBackTx(async (c) => {
      const subject = randomUUID();
      const [job] = await enqueue(c, "generate", subject, "h1", { baseHeadVersion: 0 });
      expect(job).toMatchObject({
        kind: "generate",
        subject_id: subject,
        input_hash: "h1",
        payload: { baseHeadVersion: 0 },
        status: "queued",
        attempts: 0,
        max_attempts: 3,
        locked_until: null,
        error: null,
        finished_at: null,
      });
    });
  });

  it("returns the live job for the same triple, queued or running, and keeps one row", async () => {
    await inRolledBackTx(async (c) => {
      const subject = randomUUID();
      const [first] = await enqueue(c, "rendition", subject, "h");
      const [again] = await enqueue(c, "rendition", subject, "h", { other: true });
      expect(again.id).toBe(first.id);
      expect(again.payload).toEqual({});

      await c.query("update public.job set status = 'running', attempts = 1, locked_until = now() + interval '10 minutes' where id = $1", [first.id]);
      const [whileRunning] = await enqueue(c, "rendition", subject, "h");
      expect(whileRunning.id).toBe(first.id);

      // A different kind or hash is a different job.
      expect((await enqueue(c, "export", subject, "h"))[0].id).not.toBe(first.id);
      expect((await enqueue(c, "rendition", subject, "h2"))[0].id).not.toBe(first.id);

      const { rows } = await c.query("select count(*)::int as n from public.job where subject_id = $1 and kind = 'rendition' and input_hash = 'h'", [subject]);
      expect(rows[0].n).toBe(1);
    });
  });

  it.each(["succeeded", "failed"])("creates a new job once the previous one %s", async (status) => {
    await inRolledBackTx(async (c) => {
      const old = await insertJob(c, { status, attempts: 1, finished_at: OLD });
      const [fresh] = await enqueue(c, old.kind, old.subject_id, old.input_hash);
      expect(fresh.id).not.toBe(old.id);
      expect(fresh.status).toBe("queued");
    });
  });

  it("deduplicates two parallel enqueues of the same triple into one row", async () => {
    const subject = randomUUID();
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      const [fromA] = await enqueue(a, "rendition", subject, "same");
      // B's insert waits on A's uncommitted row, then returns it.
      const fromBPending = enqueue(b, "rendition", subject, "same");
      await a.query("commit");
      const [fromB] = await fromBPending;
      await b.query("commit");
      expect(fromB.id).toBe(fromA.id);
      const { rows } = await pool.query("select count(*)::int as n from public.job where subject_id = $1", [subject]);
      expect(rows[0].n).toBe(1);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
      await pool.query("delete from public.job where subject_id = $1", [subject]);
    }
  });

  it.each([
    ["an unknown kind", "email", "h"],
    ["an empty input hash", "rendition", ""],
  ])("rejects %s", async (_label, kind, hash) => {
    await expect(inRolledBackTx((c) => enqueue(c, kind, randomUUID(), hash))).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a payload that is not an object", async () => {
    await expect(inRolledBackTx((c) => enqueue(c, "rendition", randomUUID(), "h", [1]))).rejects.toMatchObject({ code: "23514" });
  });
});

describe("jobs_claim", () => {
  it("claims the job: running, attempts + 1, lease now() + 10 minutes", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      const claimed = await claim(c, ["rendition"]);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ id: job.id, status: "running", attempts: 1 });
      expect(await lockedFor(c, job.id, "10 minutes")).toBe(true);
    });
  });

  it("two workers racing for one job: exactly one gets it (SKIP LOCKED)", async () => {
    const job = await insertJob(pool);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      const fromA = await claim(a, ["rendition"]);
      const fromB = await claim(b, ["rendition"]);
      expect(fromA.map((j) => j.id)).toEqual([job.id]);
      expect(fromB.map((j) => j.id)).not.toContain(job.id);
      expect(fromB.length).toBeLessThanOrEqual(1);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
      await deleteJobs([job.id]);
    }
  });

  it("never claims a kind it was not asked for", async () => {
    await inRolledBackTx(async (c) => {
      const exportJob = await insertJob(c, { kind: "export" });
      expect((await claim(c, ["rendition", "generate"])).map((j) => j.id)).not.toContain(exportJob.id);
      expect((await claim(c, [])).map((j) => j.id)).not.toContain(exportJob.id);
      expect((await jobById(c, exportJob.id)).status).toBe("queued");
      expect((await claim(c, ["export"])).map((j) => j.id)).toEqual([exportJob.id]);
    });
  });

  it("skips a queued job whose retry backoff is still in the future", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      await c.query("update public.job set locked_until = now() + interval '1 second' where id = $1", [job.id]);
      expect((await claim(c, ["rendition"])).map((j) => j.id)).not.toContain(job.id);
      await c.query("update public.job set locked_until = now() where id = $1", [job.id]);
      expect((await claim(c, ["rendition"])).map((j) => j.id)).toEqual([job.id]);
    });
  });

  it("does not reclaim a running job with a live lease", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      await claim(c, ["rendition"]);
      expect((await claim(c, ["rendition"])).map((j) => j.id)).not.toContain(job.id);
      expect((await jobById(c, job.id)).attempts).toBe(1);
    });
  });

  it("reclaims a running job whose lease expired while attempts are left (crash)", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c, { status: "running", attempts: 2, locked_until: OLD });
      const claimed = await claim(c, ["rendition"]);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({ id: job.id, status: "running", attempts: 3 });
      expect(await lockedFor(c, job.id, "10 minutes")).toBe(true);
    });
  });

  it("fails a running job whose lease expired on its last attempt (LEASE_EXPIRED) and returns it once", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c, { status: "running", attempts: 3, locked_until: OLD });
      const claimed = await claim(c, ["rendition"]);
      expect(claimed).toHaveLength(1);
      expect(claimed[0]).toMatchObject({
        id: job.id,
        status: "failed",
        attempts: 3,
        locked_until: null,
        error: { code: "LEASE_EXPIRED", message: expect.any(String) },
      });
      expect(claimed[0].finished_at).not.toBeNull();
      expect((await claim(c, ["rendition"])).map((j) => j.id)).not.toContain(job.id);
    });
  });

  it("leaves an expired last-attempt job of another kind alone", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c, { kind: "generate", status: "running", attempts: 3, locked_until: OLD });
      expect((await claim(c, ["rendition"])).map((j) => j.id)).not.toContain(job.id);
      expect((await jobById(c, job.id)).status).toBe("running");
    });
  });
});

describe("fencing on (id, attempts) and running", () => {
  it("renew and finish act only for the current attempt", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      await claim(c, ["rendition"]);
      await c.query("update public.job set locked_until = now() + interval '1 minute' where id = $1", [job.id]);

      expect(await fenced(c, "jobs_renew", job.id, 0)).toBe(false);
      expect(await fenced(c, "jobs_renew", job.id, 2)).toBe(false);
      expect(await fenced(c, "jobs_renew", UNKNOWN_ID, 1)).toBe(false);
      expect(await lockedFor(c, job.id, "1 minute")).toBe(true);

      expect(await fenced(c, "jobs_renew", job.id, 1)).toBe(true);
      expect(await lockedFor(c, job.id, "10 minutes")).toBe(true);

      expect(await fenced(c, "jobs_finish", job.id, 2)).toBe(false);
      expect(await fenced(c, "jobs_finish", job.id, 1)).toBe(true);
      expect(await jobById(c, job.id)).toMatchObject({ status: "succeeded", locked_until: null, error: null });
      expect((await jobById(c, job.id)).finished_at).not.toBeNull();

      // Not running any more: every fenced call is a no-op.
      expect(await fenced(c, "jobs_finish", job.id, 1)).toBe(false);
      expect(await fenced(c, "jobs_renew", job.id, 1)).toBe(false);
      expect(await fenced(c, "jobs_release", job.id, 1)).toBe(false);
      expect(await fail(c, job.id, 1, 0, true)).toEqual([]);
      expect((await jobById(c, job.id)).status).toBe("succeeded");
    });
  });

  it("a worker whose job was reclaimed after its lease expired can no longer write", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c, { status: "running", attempts: 1, locked_until: OLD });
      await claim(c, ["rendition"]); // the second worker: attempts 2
      expect(await fenced(c, "jobs_finish", job.id, 1)).toBe(false);
      expect(await fail(c, job.id, 1, 0, false)).toEqual([]);
      expect(await jobById(c, job.id)).toMatchObject({ status: "running", attempts: 2 });
    });
  });

  it("release gives the attempt back and makes the job claimable at once", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      await claim(c, ["rendition"]);
      expect(await fenced(c, "jobs_release", job.id, 1)).toBe(true);
      expect(await jobById(c, job.id)).toMatchObject({ status: "queued", attempts: 0, locked_until: null, finished_at: null });
      expect(await fenced(c, "jobs_finish", job.id, 1)).toBe(false);
      expect((await claim(c, ["rendition"]))[0]).toMatchObject({ id: job.id, attempts: 1 });
    });
  });
});

describe("jobs_fail", () => {
  it("queues a retryable failure with its error, claimable only after the delay", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      await claim(c, ["rendition"]);
      const [failed] = await fail(c, job.id, 1, 30_000, true, { code: "RENDITION_FAILED", message: "m" });
      expect(failed).toMatchObject({ id: job.id, status: "queued", attempts: 1, error: { code: "RENDITION_FAILED", message: "m" }, finished_at: null });
      expect(await lockedFor(c, job.id, "30 seconds")).toBe(true);
      expect((await claim(c, ["rendition"])).map((j) => j.id)).not.toContain(job.id);
    });
  });

  it("fails the job on its last attempt even when retryable", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c, { status: "running", attempts: 2, locked_until: OLD });
      await claim(c, ["rendition"]); // attempt 3
      const [failed] = await fail(c, job.id, 3, 120_000, true);
      expect(failed).toMatchObject({ status: "failed", attempts: 3, locked_until: null, error: { code: "X_FAILED", message: "m" } });
      expect(failed.finished_at).not.toBeNull();
    });
  });

  it("fails a non-retryable error at once", async () => {
    await inRolledBackTx(async (c) => {
      const job = await insertJob(c);
      await claim(c, ["rendition"]);
      const [failed] = await fail(c, job.id, 1, 30_000, false);
      expect(failed).toMatchObject({ status: "failed", attempts: 1, locked_until: null });
      // Failed jobs free the triple for a new enqueue.
      expect((await enqueue(c, "rendition", job.subject_id, job.input_hash))[0].id).not.toBe(job.id);
    });
  });

  it.each([
    ["no code", { message: "no code" }],
    ["an empty code", { code: "", message: "m" }],
    ["a code over 64 characters", { code: "C".repeat(65), message: "m" }],
    ["a message over 1000 characters", { code: "X", message: "m".repeat(1001) }],
  ])("rejects an error with %s", async (_label, error) => {
    await expect(
      inRolledBackTx(async (c) => {
        const job = await insertJob(c);
        await claim(c, ["rendition"]);
        return fail(c, job.id, 1, 0, true, error);
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

describe("access", () => {
  const FUNCTIONS = [
    `public.jobs_enqueue('rendition', '${UNKNOWN_ID}'::uuid, 'h', '{}'::jsonb)`,
    "public.jobs_claim(array['rendition'])",
    `public.jobs_renew('${UNKNOWN_ID}'::uuid, 1)`,
    `public.jobs_finish('${UNKNOWN_ID}'::uuid, 1)`,
    `public.jobs_fail('${UNKNOWN_ID}'::uuid, 1, '{"code":"X","message":"m"}'::jsonb, 0, true)`,
    `public.jobs_release('${UNKNOWN_ID}'::uuid, 1)`,
  ];
  const STATEMENTS = {
    select: "select * from public.job",
    insert: `insert into public.job (kind, subject_id, input_hash) values ('rendition', '${UNKNOWN_ID}', 'h')`,
    update: "update public.job set status = 'succeeded'",
    delete: "delete from public.job",
  };

  it.each((["anon", "authenticated"] as const).flatMap((role) => Object.entries(STATEMENTS).map(([verb, sql]) => [role, verb, sql] as const)))(
    "%s gets permission denied on job %s",
    async (role, _verb, sql) => {
      await expect(inRolledBackTx((c) => c.query(sql), role)).rejects.toMatchObject({ code: "42501" });
    },
  );

  it.each((["anon", "authenticated"] as const).flatMap((role) => FUNCTIONS.map((call) => [role, call] as const)))(
    "%s may not execute %s",
    async (role, call) => {
      await expect(inRolledBackTx((c) => c.query(`select * from ${call}`), role)).rejects.toMatchObject({ code: "42501" });
    },
  );

  it("the service role may read job but write it only through the functions", async () => {
    await inRolledBackTx(async (c) => {
      await c.query("select * from public.job limit 1");
      await c.query("select * from public.jobs_claim(array[]::text[])");
    }, "service_role");
    for (const verb of ["insert", "update", "delete"] as const) {
      await expect(inRolledBackTx((c) => c.query(STATEMENTS[verb]), "service_role"), verb).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("the browser key is refused reading job and calling jobs_claim", async () => {
    const browser = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const read = await browser.from("job").select("*");
    expect(read.data).toBeNull();
    expect(read.error?.code).toBe("42501");
    const rpc = await browser.rpc("jobs_claim", { p_kinds: ["rendition"] });
    expect(rpc.data).toBeNull();
    // Permission denied, or PostgREST hiding a function the role may not execute.
    expect(["42501", "PGRST202"]).toContain(rpc.error?.code);
  });
});

describe("@/modules/jobs against the stack", () => {
  // Imported lazily so getEnv() (cached on first use) sees the exported env.
  const loadJobs = () => import("@/modules/jobs");

  it("enqueue is idempotent and getJobsFor lists the subject's jobs newest first, without payload", async () => {
    const { enqueue: enqueueJob, getJobsFor } = await loadJobs();
    const subject = randomUUID();
    try {
      const first = await enqueueJob({ kind: "rendition", subjectId: subject, inputHash: "a", payload: { assetId: subject } });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value).toMatchObject({ status: "queued", attempts: 0, maxAttempts: 3, payload: { assetId: subject } });
      const again = await enqueueJob({ kind: "rendition", subjectId: subject, inputHash: "a" });
      expect(again.ok && again.value.id).toBe(first.value.id);
      const second = await enqueueJob({ kind: "export", subjectId: subject, inputHash: "b" });
      expect(second.ok).toBe(true);

      const listed = await getJobsFor(subject);
      expect(listed.ok).toBe(true);
      if (!listed.ok || !second.ok) return;
      expect(listed.value.map((j) => j.id)).toEqual([second.value.id, first.value.id]);
      for (const job of listed.value) expect(job).not.toHaveProperty("payload");
    } finally {
      await pool.query("delete from public.job where subject_id = $1", [subject]);
    }
  });

  it("rejects bad input before touching the database", async () => {
    const { enqueue: enqueueJob, getJobsFor } = await loadJobs();
    const bad = await enqueueJob({ kind: "email", subjectId: randomUUID(), inputHash: "a" });
    expect(!bad.ok && bad.error.code).toBe("INVALID_INPUT");
    const badId = await getJobsFor("not-a-uuid");
    expect(!badId.ok && badId.error.code).toBe("INVALID_INPUT");
  });
});
