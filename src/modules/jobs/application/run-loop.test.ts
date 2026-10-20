import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import {
  JOB_LEASE_SAFE_MS,
  JOB_POLL_IDLE_MS,
  JOB_RENEW_TIMEOUT_MS,
  JOB_SETTLE_GRACE_MS,
  JOB_RENEW_EVERY_MS,
  JOB_SHUTDOWN_GRACE_MS,
  type Job,
  type JobHandler,
  type JobHandlers,
  type JobOutcome,
} from "@/modules/jobs/domain/job";
import type { JobRepository } from "@/modules/jobs/ports/job-repository";
import { err, ok, type Result } from "@/shared/result";
import { makeStartJobLoop, type JobLoopDeps } from "./run-loop";

const system: Actor = { id: "00000000-0000-4000-8000-0000000000aa", email: "s@x.invalid", displayName: "System", role: "system" };
const CASE_ID = "cccccccc-0000-4000-8000-000000000001";

let seq = 0;
function job(over: Partial<Job> = {}): Job {
  seq += 1;
  return {
    id: `aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    kind: "rendition",
    subjectId: "bbbbbbbb-0000-4000-8000-000000000001",
    inputHash: "h",
    payload: {},
    status: "running",
    attempts: 1,
    maxAttempts: 3,
    lockedUntil: "2026-10-16T10:10:00Z",
    error: null,
    createdAt: "2026-10-16T10:00:00Z",
    updatedAt: "2026-10-16T10:00:00Z",
    finishedAt: null,
    ...over,
  };
}

/** A repository whose claim hands out `queue` in order, then nothing. */
function fakeRepo(queue: Array<Result<Job | null>> = []) {
  const claims = [...queue];
  const handedOut = new Map(queue.flatMap((r) => (r.ok && r.value ? [[r.value.id, r.value] as const] : [])));
  const repo = {
    enqueue: vi.fn<JobRepository["enqueue"]>(),
    claim: vi.fn<JobRepository["claim"]>(async () => claims.shift() ?? ok(null)),
    renew: vi.fn<JobRepository["renew"]>(async () => ok(true)),
    finish: vi.fn<JobRepository["finish"]>(async () => ok(true)),
    fail: vi.fn<JobRepository["fail"]>(async (lease, { retryable, error }) =>
      ok({
        ...(handedOut.get(lease.id) ?? job({ id: lease.id })),
        attempts: lease.attempts,
        status: retryable && lease.attempts < 3 ? "queued" : "failed",
        error,
      }),
    ),
    release: vi.fn<JobRepository["release"]>(async () => ok(true)),
    listBySubject: vi.fn<JobRepository["listBySubject"]>(),
    liveSubjects: vi.fn<JobRepository["liveSubjects"]>(),
  };
  return repo;
}

/** A handler whose run resolves when the test calls `resolve`, recording the abort signal. */
function deferredHandler(over: Partial<JobHandler> = {}) {
  let resolve: (outcome: JobOutcome) => void = () => undefined;
  let signal: AbortSignal | undefined;
  const run = vi.fn(
    (_job: Job, s: AbortSignal) =>
      new Promise<JobOutcome>((r) => {
        signal = s;
        resolve = r;
      }),
  );
  return {
    handler: { run, ...over } as JobHandler,
    run,
    resolve: (outcome: JobOutcome) => resolve(outcome),
    signal: () => signal,
  };
}

function setup(repo: ReturnType<typeof fakeRepo>, handlers: JobHandlers, over: Partial<JobLoopDeps> = {}) {
  const deps: JobLoopDeps = {
    jobs: repo,
    authorize: vi.fn(() => ok(undefined)),
    recordEvent: vi.fn(async () => ok({})),
    ...over,
  };
  const loop = makeStartJobLoop(deps)({ actor: system, handlers });
  return { deps, loop };
}

/** Lets pending promises settle without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

const logged = () =>
  vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => JSON.parse(String(chunk)) as Record<string, unknown>);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ok_ = (): JobOutcome => ok(undefined);

describe("polling", () => {
  it("claims only kinds with a handler", async () => {
    const repo = fakeRepo();
    const { loop } = setup(repo, { export: { run: async () => ok_() } });
    await flush();
    expect(repo.claim).toHaveBeenCalledWith(["export"]);
    await loop.stop();
  });

  it("with no handlers asks for no kinds, so nothing is ever claimed", async () => {
    const repo = fakeRepo();
    const { loop } = setup(repo, {});
    await flush();
    expect(repo.claim).toHaveBeenCalledWith([]);
    await loop.stop();
  });

  it("sleeps 2 s when the queue is empty, then polls again", async () => {
    const repo = fakeRepo();
    const { loop } = setup(repo, { rendition: { run: async () => ok_() } });
    await flush();
    expect(repo.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(JOB_POLL_IDLE_MS - 1);
    expect(repo.claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(repo.claim).toHaveBeenCalledTimes(2);
    await loop.stop();
  });

  it("logs a claim error and keeps polling", async () => {
    const repo = fakeRepo([err({ code: "JOB_LOOKUP_FAILED", message: "down" })]);
    repo.claim.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    const { loop } = setup(repo, { rendition: { run: async () => ok_() } });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_POLL_IDLE_MS * 2);
    expect(repo.claim.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(logged().filter((l) => l.level === "error").map((l) => l.msg)).toEqual([
      "job claim failed: JOB_CALL_THREW",
      "job claim failed: JOB_LOOKUP_FAILED",
    ]);
    await loop.stop();
  });
});

describe("running a job", () => {
  it("authorizes job work as the system actor, runs the handler and finishes the job", async () => {
    const j = job({ attempts: 2 });
    const repo = fakeRepo([ok(j)]);
    const run = vi.fn(async () => ok_());
    const { deps, loop } = setup(repo, { rendition: { run } });
    await flush();
    expect(deps.authorize).toHaveBeenCalledWith(system, "job work");
    expect(run).toHaveBeenCalledWith(j, expect.any(AbortSignal));
    expect(repo.finish).toHaveBeenCalledWith({ id: j.id, attempts: 2 });
    expect(repo.fail).not.toHaveBeenCalled();
    expect(deps.recordEvent).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("runs one job at a time", async () => {
    const repo = fakeRepo([ok(job()), ok(job())]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    expect(h.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(JOB_POLL_IDLE_MS * 5);
    expect(repo.claim).toHaveBeenCalledTimes(1);
    h.resolve(ok_());
    await flush();
    expect(repo.claim).toHaveBeenCalledTimes(2);
    expect(h.run).toHaveBeenCalledTimes(2);
    h.resolve(ok_());
    await flush();
    await loop.stop();
  });

  it("does not run the handler when job work is not authorized, and fails the job for good (FORBIDDEN)", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const run = vi.fn(async () => ok_());
    const { loop } = setup(repo, { rendition: { run } }, { authorize: () => err({ code: "FORBIDDEN", message: "no" }) });
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(repo.release).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      { id: j.id, attempts: 1 },
      { error: { code: "FORBIDDEN", message: "The worker may not do job work." }, retryAfterMs: 30_000, retryable: false },
    );
    await loop.stop();
  });

  it.each([
    ["undefined", undefined],
    ["a non-Result", { done: true }],
    ["an error without a code", { ok: false }],
  ])("treats a handler resolving to %s as HANDLER_BAD_OUTCOME", async (_label, value) => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const { loop } = setup(repo, { rendition: { run: async () => value as unknown as JobOutcome } });
    await flush();
    expect(repo.fail).toHaveBeenCalledWith(
      { id: j.id, attempts: 1 },
      expect.objectContaining({ error: { code: "HANDLER_BAD_OUTCOME", message: expect.any(String) }, retryable: true }),
    );
    expect(repo.finish).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("fits a handler's error into the stored limits before jobs_fail", async () => {
    const repo = fakeRepo([ok(job()), ok(job())]);
    const outcomes = [err({ code: "X".repeat(80) as Uppercase<string>, message: "m".repeat(2000) }), err({ code: "" as Uppercase<string>, message: "m" })];
    const { loop } = setup(repo, { rendition: { run: async () => outcomes.shift() as JobOutcome } });
    await flush();
    const errors = repo.fail.mock.calls.map((c) => c[1].error);
    expect(errors[0].code).toHaveLength(64);
    expect(errors[0].message).toHaveLength(1000);
    expect(errors[1].code).toBe("UNKNOWN");
    await loop.stop();
  });
});

describe("failures", () => {
  it.each([
    [1, 30_000],
    [2, 60_000],
  ])("a retryable error on attempt %i queues a retry after %i ms", async (attempts, delay) => {
    const j = job({ attempts });
    const repo = fakeRepo([ok(j)]);
    const { deps, loop } = setup(repo, {
      rendition: { run: async () => err({ code: "RENDITION_FAILED", message: "bad image" }), caseIdOf: () => CASE_ID },
    });
    await flush();
    expect(repo.fail).toHaveBeenCalledWith(
      { id: j.id, attempts },
      { error: { code: "RENDITION_FAILED", message: "bad image" }, retryAfterMs: delay, retryable: true },
    );
    expect(deps.recordEvent).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("a throwing handler is a retryable HANDLER_THREW, and the thrown message is not stored", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const { loop } = setup(repo, {
      rendition: {
        run: async () => {
          throw new Error("secret material text");
        },
      },
    });
    await flush();
    expect(repo.fail).toHaveBeenCalledWith(
      { id: j.id, attempts: 1 },
      { error: { code: "HANDLER_THREW", message: "The job handler threw." }, retryAfterMs: 30_000, retryable: true },
    );
    expect(JSON.stringify(logged())).not.toContain("secret material");
    await loop.stop();
  });

  it("retryable: false fails the job and writes job_failed on the handler's case", async () => {
    const j = job({ kind: "generate" });
    const repo = fakeRepo([ok(j)]);
    const { deps, loop } = setup(repo, {
      generate: {
        run: async () => err({ code: "NO_MATERIAL", message: "No material.", retryable: false }),
        caseIdOf: (x) => (x.id === j.id ? CASE_ID : null),
      },
    });
    await flush();
    expect(repo.fail).toHaveBeenCalledWith(
      { id: j.id, attempts: 1 },
      { error: { code: "NO_MATERIAL", message: "No material." }, retryAfterMs: 30_000, retryable: false },
    );
    expect(deps.recordEvent).toHaveBeenCalledWith(system, {
      caseId: CASE_ID,
      type: "job_failed",
      data: { jobId: j.id, kind: "generate", code: "NO_MATERIAL" },
    });
    await loop.stop();
  });

  it("the last attempt's error fails the job and writes job_failed", async () => {
    const j = job({ attempts: 3 });
    const repo = fakeRepo([ok(j)]);
    const { deps, loop } = setup(repo, {
      rendition: { run: async () => err({ code: "RENDITION_FAILED", message: "m" }), caseIdOf: () => CASE_ID },
    });
    await flush();
    expect(repo.fail.mock.calls[0][1]).toMatchObject({ retryable: true, retryAfterMs: 120_000 });
    expect(deps.recordEvent).toHaveBeenCalledWith(system, {
      caseId: CASE_ID,
      type: "job_failed",
      data: { jobId: j.id, kind: "rendition", code: "RENDITION_FAILED" },
    });
    await loop.stop();
  });

  it("without a case for the job, a permanent failure is only logged, with ids only", async () => {
    const j = job({ attempts: 3 });
    const repo = fakeRepo([ok(j)]);
    const { deps, loop } = setup(repo, { rendition: { run: async () => err({ code: "X_FAILED", message: "private detail" }) } });
    await flush();
    expect(deps.recordEvent).not.toHaveBeenCalled();
    const failed = logged().find((l) => l.msg === "job failed: X_FAILED");
    expect(failed).toMatchObject({ jobId: j.id, actorId: system.id });
    expect(JSON.stringify(logged())).not.toContain("private detail");
    await loop.stop();
  });

  it("a job jobs_claim failed after its last lease expired is reported as job_failed (LEASE_EXPIRED), not run", async () => {
    const j = job({ status: "failed", attempts: 3, error: { code: "LEASE_EXPIRED", message: "m" } });
    const repo = fakeRepo([ok(j)]);
    const h = deferredHandler({ caseIdOf: () => CASE_ID });
    const { deps, loop } = setup(repo, { rendition: h.handler });
    await flush();
    expect(h.run).not.toHaveBeenCalled();
    expect(deps.authorize).toHaveBeenCalledWith(system, "job work");
    expect(deps.recordEvent).toHaveBeenCalledWith(system, {
      caseId: CASE_ID,
      type: "job_failed",
      data: { jobId: j.id, kind: "rendition", code: "LEASE_EXPIRED" },
    });
    expect(repo.fail).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("does not write job_failed when job work is not authorized", async () => {
    const j = job({ status: "failed", attempts: 3, error: { code: "LEASE_EXPIRED", message: "m" } });
    const repo = fakeRepo([ok(j)]);
    const { deps, loop } = setup(
      repo,
      { rendition: { run: async () => ok_(), caseIdOf: () => CASE_ID } },
      { authorize: () => err({ code: "FORBIDDEN", message: "no" }) },
    );
    await flush();
    expect(deps.recordEvent).not.toHaveBeenCalled();
    expect(logged().find((l) => l.msg === "job_failed not authorized: FORBIDDEN")).toMatchObject({
      level: "error",
      jobId: j.id,
      caseId: CASE_ID,
    });
    await loop.stop();
  });

  it("logs a job_failed write failure and keeps polling", async () => {
    const repo = fakeRepo([ok(job({ attempts: 3 }))]);
    const { loop } = setup(
      repo,
      { rendition: { run: async () => err({ code: "X", message: "m" }), caseIdOf: () => CASE_ID } },
      { recordEvent: async () => err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" }) },
    );
    await flush();
    expect(logged().some((l) => l.msg === "job_failed event not recorded: CASE_EVENT_WRITE_FAILED")).toBe(true);
    await vi.advanceTimersByTimeAsync(JOB_POLL_IDLE_MS);
    expect(repo.claim.mock.calls.length).toBeGreaterThanOrEqual(2);
    await loop.stop();
  });
});

describe("leases", () => {
  it("renews every 60 s while a long job runs, past the 10-minute lease, then finishes it", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS - 1);
    expect(repo.renew).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(repo.renew).toHaveBeenCalledWith({ id: j.id, attempts: 1 });
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS * 14);
    expect(repo.renew).toHaveBeenCalledTimes(15);
    expect(h.signal()?.aborted).toBe(false);
    h.resolve(ok_());
    await flush();
    expect(repo.finish).toHaveBeenCalledWith({ id: j.id, attempts: 1 });
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS * 3);
    expect(repo.renew).toHaveBeenCalledTimes(15);
    await loop.stop();
  });

  it("keeps the job when a renewal errors (logged), and tries again next minute", async () => {
    const repo = fakeRepo([ok(job())]);
    repo.renew.mockResolvedValueOnce(err({ code: "JOB_WRITE_FAILED", message: "down" }));
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS * 2);
    expect(repo.renew).toHaveBeenCalledTimes(2);
    expect(h.signal()?.aborted).toBe(false);
    h.resolve(ok_());
    await flush();
    expect(repo.finish).toHaveBeenCalled();
    await loop.stop();
  });

  it("aborts the handler when the lease is lost and writes nothing afterwards", async () => {
    const repo = fakeRepo([ok(job())]);
    repo.renew.mockResolvedValue(ok(false));
    const h = deferredHandler();
    const { deps, loop } = setup(repo, { rendition: { ...h.handler, caseIdOf: () => CASE_ID } });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS);
    expect(h.signal()?.aborted).toBe(true);
    h.resolve(err({ code: "ABORTED", message: "aborted" }));
    await flush();
    expect(repo.fail).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
    expect(repo.release).not.toHaveBeenCalled();
    expect(deps.recordEvent).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("aborts the handler when renewals keep failing until the lease is nearly out, and writes nothing", async () => {
    const repo = fakeRepo([ok(job())]);
    repo.renew.mockResolvedValue(err({ code: "JOB_WRITE_FAILED", message: "down" }));
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_LEASE_SAFE_MS - 1);
    expect(h.signal()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS);
    expect(h.signal()?.aborted).toBe(true);
    h.resolve(err({ code: "ABORTED", message: "aborted" }));
    await flush();
    expect(repo.fail).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
    expect(repo.release).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("times out a hanging renewal and gives up the lease before it runs out", async () => {
    const repo = fakeRepo([ok(job())]);
    repo.renew.mockImplementation(() => new Promise(() => undefined));
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS + JOB_RENEW_TIMEOUT_MS);
    expect(logged().some((l) => l.msg === "job lease renewal failed: JOB_RENEW_TIMEOUT")).toBe(true);
    // A timed-out renewal does not block the next one.
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS);
    expect(repo.renew).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(JOB_LEASE_SAFE_MS);
    expect(h.signal()?.aborted).toBe(true);
    h.resolve(err({ code: "ABORTED", message: "aborted" }));
    await flush();
    expect(repo.fail).not.toHaveBeenCalled();
    await loop.stop();
  });

  it("successful renewals keep the lease alive", async () => {
    const repo = fakeRepo([ok(job())]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    await vi.advanceTimersByTimeAsync(JOB_LEASE_SAFE_MS * 3);
    expect(h.signal()?.aborted).toBe(false);
    h.resolve(ok_());
    await flush();
    await loop.stop();
  });

  it("logs a fenced finish that finds the lease gone", async () => {
    const repo = fakeRepo([ok(job())]);
    repo.finish.mockResolvedValue(ok(false));
    const { loop } = setup(repo, { rendition: { run: async () => ok_() } });
    await flush();
    expect(logged().some((l) => l.msg === "job lease lost before finish")).toBe(true);
    await loop.stop();
  });
});

describe("shutdown", () => {
  it("stops claiming while idle and resolves at once", async () => {
    const repo = fakeRepo();
    const { loop } = setup(repo, { rendition: { run: async () => ok_() } });
    await flush();
    await loop.stop();
    await vi.advanceTimersByTimeAsync(JOB_POLL_IDLE_MS * 5);
    expect(repo.claim).toHaveBeenCalledTimes(1);
  });

  it("aborts the running handler and releases its job when it stops", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    const stopping = loop.stop();
    expect(h.signal()?.aborted).toBe(true);
    h.resolve(err({ code: "ABORTED", message: "aborted" }));
    await stopping;
    expect(repo.release).toHaveBeenCalledWith({ id: j.id, attempts: 1 });
    expect(repo.fail).not.toHaveBeenCalled();
    expect(repo.claim).toHaveBeenCalledTimes(1);
  });

  it("finishes a job whose handler still completes after the abort", async () => {
    const repo = fakeRepo([ok(job())]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    const stopping = loop.stop();
    h.resolve(ok_());
    await stopping;
    expect(repo.finish).toHaveBeenCalled();
    expect(repo.release).not.toHaveBeenCalled();
  });

  it("waits at most 10 s for a handler that ignores the abort, releases the job, and ignores its late outcome", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    let done = false;
    const stopping = loop.stop().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(JOB_SHUTDOWN_GRACE_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await stopping;
    expect(repo.release).toHaveBeenCalledTimes(1);
    expect(repo.release).toHaveBeenCalledWith({ id: j.id, attempts: 1 });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(JOB_RENEW_EVERY_MS * 2);
    expect(repo.renew).not.toHaveBeenCalled();
    h.resolve(ok_());
    await flush();
    expect(repo.finish).not.toHaveBeenCalled();
    expect(repo.release).toHaveBeenCalledTimes(1);
  });

  it("records a real failure that arrives while stopping, instead of giving the attempt back", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const h = deferredHandler({ caseIdOf: () => CASE_ID });
    const { deps, loop } = setup(repo, { rendition: h.handler });
    await flush();
    const stopping = loop.stop();
    h.resolve(err({ code: "NO_MATERIAL", message: "m", retryable: false }));
    await stopping;
    expect(repo.release).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith({ id: j.id, attempts: 1 }, expect.objectContaining({ retryable: false }));
    expect(deps.recordEvent).toHaveBeenCalled();
  });

  it("gives the attempt back when the handler throws after the shutdown abort", async () => {
    const j = job();
    const repo = fakeRepo([ok(j)]);
    const { loop } = setup(repo, {
      rendition: {
        run: (_job, signal) =>
          new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
      },
    });
    await flush();
    await loop.stop();
    expect(repo.release).toHaveBeenCalledWith({ id: j.id, attempts: 1 });
    expect(repo.fail).not.toHaveBeenCalled();
  });

  it("waits, bounded, for an outcome still being recorded after the grace period", async () => {
    const repo = fakeRepo([ok(job())]);
    let answer: (r: Result<boolean>) => void = () => undefined;
    repo.finish.mockImplementation(() => new Promise((r) => (answer = r)));
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    let done = false;
    const stopping = loop.stop().then(() => (done = true));
    h.resolve(ok_());
    await vi.advanceTimersByTimeAsync(JOB_SHUTDOWN_GRACE_MS + 1);
    expect(done).toBe(false);
    answer(ok(true));
    await stopping;
    expect(repo.release).not.toHaveBeenCalled();

    // A recording that never answers holds shutdown up only JOB_SETTLE_GRACE_MS more.
    const repo2 = fakeRepo([ok(job())]);
    repo2.finish.mockImplementation(() => new Promise(() => undefined));
    const h2 = deferredHandler();
    const second = setup(repo2, { rendition: h2.handler });
    await flush();
    let done2 = false;
    const stopping2 = second.loop.stop().then(() => (done2 = true));
    h2.resolve(ok_());
    await vi.advanceTimersByTimeAsync(JOB_SHUTDOWN_GRACE_MS + JOB_SETTLE_GRACE_MS - 1);
    expect(done2).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await stopping2;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns the same promise when stopped twice", async () => {
    const repo = fakeRepo([ok(job())]);
    const h = deferredHandler();
    const { loop } = setup(repo, { rendition: h.handler });
    await flush();
    const first = loop.stop();
    expect(loop.stop()).toBe(first);
    h.resolve(err({ code: "ABORTED", message: "a" }));
    await first;
    expect(repo.release).toHaveBeenCalledTimes(1);
  });

  it("releases a job claimed while stopping instead of running it", async () => {
    let answer: (r: Result<Job | null>) => void = () => undefined;
    const repo = fakeRepo();
    repo.claim.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const run = vi.fn(async () => ok_());
    const { loop } = setup(repo, { rendition: { run } });
    await flush();
    const stopping = loop.stop();
    const j = job();
    answer(ok(j));
    await stopping;
    expect(run).not.toHaveBeenCalled();
    expect(repo.release).toHaveBeenCalledWith({ id: j.id, attempts: 1 });
  });
});
