import { describe, expect, it } from "vitest";
import {
  enqueueInputSchema,
  JOB_LEASE_MS,
  JOB_MAX_ATTEMPTS,
  JOB_POLL_IDLE_MS,
  JOB_RENEW_EVERY_MS,
  JOB_SHUTDOWN_GRACE_MS,
  jobSchema,
  retryDelayMs,
  toJobError,
} from "./job";

describe("timing", () => {
  it("leases for 10 minutes, renews every minute, polls every 2 s and waits 10 s on shutdown", () => {
    expect(JOB_LEASE_MS).toBe(600_000);
    expect(JOB_RENEW_EVERY_MS).toBe(60_000);
    expect(JOB_POLL_IDLE_MS).toBe(2_000);
    expect(JOB_SHUTDOWN_GRACE_MS).toBe(10_000);
    expect(JOB_MAX_ATTEMPTS).toBe(3);
  });

  it("retries after 30 s × 2^(attempts−1)", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000]);
    expect(retryDelayMs(0)).toBe(30_000);
  });

  it("caps the retry delay at 1 hour, however many attempts", () => {
    expect(retryDelayMs(8)).toBe(3_600_000);
    expect(retryDelayMs(40)).toBe(3_600_000);
    expect(retryDelayMs(10_000)).toBe(3_600_000);
  });
});

describe("enqueueInputSchema", () => {
  const subjectId = "11111111-1111-4111-8111-111111111111";

  it("defaults the payload to {}", () => {
    expect(enqueueInputSchema.parse({ kind: "rendition", subjectId, inputHash: "h" })).toEqual({
      kind: "rendition",
      subjectId,
      inputHash: "h",
      payload: {},
    });
  });

  it.each([
    { kind: "email", subjectId, inputHash: "h" },
    { kind: "rendition", subjectId: "nope", inputHash: "h" },
    { kind: "rendition", subjectId, inputHash: "" },
    { kind: "rendition", subjectId, inputHash: "x".repeat(257) },
    { kind: "rendition", subjectId, inputHash: "h", payload: [1] },
  ])("rejects %j", (input) => {
    expect(enqueueInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("toJobError", () => {
  it("caps code at 64 and message at 1000 characters, and replaces an empty code", () => {
    expect(toJobError({ code: "C".repeat(70), message: "m".repeat(1200) })).toEqual({ code: "C".repeat(64), message: "m".repeat(1000) });
    expect(toJobError({ code: "", message: undefined })).toEqual({ code: "UNKNOWN", message: "" });
  });
});

describe("jobSchema", () => {
  it("rejects an unknown status", () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      kind: "export",
      subjectId: "11111111-1111-4111-8111-111111111111",
      inputHash: "h",
      payload: {},
      status: "paused",
      attempts: 0,
      maxAttempts: 3,
      lockedUntil: null,
      error: null,
      createdAt: "t",
      updatedAt: "t",
      finishedAt: null,
    };
    expect(jobSchema.safeParse(row).success).toBe(false);
    expect(jobSchema.safeParse({ ...row, status: "queued" }).success).toBe(true);
  });
});
