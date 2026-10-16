import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  JOB_ERROR_CODE_MAX,
  JOB_ERROR_MESSAGE_MAX,
  JOB_KINDS,
  JOB_LEASE_MS,
  JOB_MAX_ATTEMPTS,
  JOB_STATUSES,
} from "@/modules/jobs/domain/job";

const migration = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20261016120000_jobs_job.sql", import.meta.url)),
  "utf8",
);

describe("job migration matches jobs/domain/job.ts", () => {
  it("lists exactly JOB_KINDS and JOB_STATUSES", () => {
    const kinds = migration.match(/kind text not null check \(kind in \(([^)]*)\)\)/)?.[1];
    const statuses = migration.match(/status text not null default 'queued' check \(status in \(([^)]*)\)\)/)?.[1];
    expect([...(kinds ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...JOB_KINDS]);
    expect([...(statuses ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...JOB_STATUSES]);
  });

  it("uses the same lease, attempt limit and error limits", () => {
    expect(JOB_LEASE_MS % 60_000).toBe(0);
    const lease = `interval '${JOB_LEASE_MS / 60_000} minutes'`;
    // jobs_claim and jobs_renew set the lease, and nothing else uses an interval in minutes.
    expect(migration.split(lease)).toHaveLength(3);
    expect(migration.match(/interval '\d+ minutes?'/g)).toEqual([lease, lease]);
    expect(migration).toContain(`max_attempts integer not null default ${JOB_MAX_ATTEMPTS}`);
    expect(migration).toContain(`char_length(error ->> 'code') between 1 and ${JOB_ERROR_CODE_MAX}`);
    expect(migration).toContain(`char_length(error ->> 'message') <= ${JOB_ERROR_MESSAGE_MAX}`);
  });
});
