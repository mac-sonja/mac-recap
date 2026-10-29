import type { Actor } from "@/modules/access";
import {
  JOB_ABORTED,
  JOB_FAILED,
  JOB_KINDS,
  JOB_LEASE_SAFE_MS,
  JOB_POLL_IDLE_MS,
  JOB_RENEW_EVERY_MS,
  JOB_RENEW_TIMEOUT_MS,
  JOB_SETTLE_GRACE_MS,
  JOB_SHUTDOWN_GRACE_MS,
  retryDelayMs,
  toJobError,
  type Job,
  type JobFailure,
  type JobHandler,
  type JobHandlers,
  type JobOutcome,
  type Lease,
} from "@/modules/jobs/domain/job";
import type { JobRepository } from "@/modules/jobs/ports/job-repository";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";

/** The timer functions the loop uses, injected so tests control time. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** The global timers, looked up at call time (so fake timers installed later still apply). */
export const globalTimers: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as Parameters<typeof clearInterval>[0]),
};

export interface JobLoopDeps {
  jobs: JobRepository;
  /** `access.authorize`; the loop asks for `job work` before each run and each `job_failed` event. */
  authorize(actor: Actor, action: "job work"): Result<void>;
  /** `case-study.recordEvent`, the only writer of `job_failed`. */
  recordEvent(
    actor: Actor,
    input: { caseId: string; type: string; data: Record<string, string> },
  ): Promise<Result<unknown>>;
  timers?: Timers;
  /** Milliseconds clock for lease bookkeeping; defaults to `Date.now`. */
  now?: () => number;
}

export interface JobLoopOptions {
  /** The `system` actor (`access.getSystemActor()`). */
  actor: Actor;
  /** One handler per kind; only these kinds are ever claimed. */
  handlers: JobHandlers;
}

export interface JobLoop {
  /**
   * Stops claiming, aborts the running handler and waits up to 10 s for it.
   * A job that did not finish is released (queued again, attempt given back).
   * Resolves once the loop has stopped; later calls return the same promise.
   */
  stop(): Promise<void>;
}

/** One claimed job while its handler runs. */
interface Running {
  job: Job;
  lease: Lease;
  abort: AbortController;
  /** The handler has returned (or thrown). */
  done: boolean;
  renewing: boolean;
  /** A renewal found the lease gone: the outcome is discarded. */
  leaseLost: boolean;
  /** Shutdown released the job while the handler still ran: the outcome is discarded. */
  released: boolean;
  /** stop() aborted the handler. */
  shutdownAbort: boolean;
  /** When the current lease was last known good (sent time of the claim or last successful renewal). */
  leaseSince: number;
  /** The renewal interval handle. */
  renewal: unknown;
}

const threw = (what: string) => err({ code: "JOB_CALL_THREW", message: `${what} threw.` });

/** Awaits a Result-returning call, turning a throw into an error result. */
async function safely<T>(what: string, call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call();
  } catch {
    return threw(what);
  }
}

/** A handler's return value as a JobOutcome; anything that is not a Result is `HANDLER_BAD_OUTCOME`. */
function asOutcome(value: unknown): JobOutcome {
  if (typeof value === "object" && value !== null) {
    const v = value as { ok?: unknown; error?: unknown };
    if (v.ok === true) return ok(undefined);
    if (v.ok === false && typeof v.error === "object" && v.error !== null && "code" in v.error) return value as JobOutcome;
  }
  return err({ code: "HANDLER_BAD_OUTCOME", message: "The job handler did not return a result." });
}

/**
 * Builds the worker's job loop (AD-10): one job at a time, as the `system`
 * actor. It claims only kinds with a handler, renews the lease every minute
 * while the handler runs, finishes or fails the job (retrying with backoff)
 * and writes `job_failed` on the job's case when a job fails for good.
 * Database errors are logged and the loop keeps polling. Logs carry ids only.
 */
export function makeStartJobLoop(deps: JobLoopDeps) {
  const { jobs } = deps;
  const timers = deps.timers ?? globalTimers;
  const now = deps.now ?? Date.now;

  return function startJobLoop({ actor, handlers }: JobLoopOptions): JobLoop {
    const actorId = actor.id;
    const kinds = JOB_KINDS.filter((kind) => handlers[kind] !== undefined);
    let stopping = false;
    let wake: (() => void) | null = null;
    let current: Running | null = null;
    let stopped: Promise<void> | null = null;
    /** The outcome being recorded right now, if any. */
    let settling: Promise<void> | null = null;

    /** `promise`, or `onTimeout` once `ms` pass first. */
    function within<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
      let handle: unknown;
      const timeout = new Promise<T>((resolve) => {
        handle = timers.setTimeout(() => resolve(onTimeout), ms);
      });
      return Promise.race([promise, timeout]).finally(() => timers.clearTimeout(handle));
    }

    /** Waits `ms`, or less when stop() wakes it. */
    function sleep(ms: number): Promise<void> {
      if (stopping) return Promise.resolve();
      return new Promise((resolve) => {
        const handle = timers.setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
        wake = () => {
          timers.clearTimeout(handle);
          wake = null;
          resolve();
        };
      });
    }

    async function release(lease: Lease): Promise<void> {
      const released = await safely("jobs_release", () => jobs.release(lease));
      if (!released.ok) log.error(`job release failed: ${released.error.code}`, { jobId: lease.id, actorId });
      else if (!released.value) log.warn("job release found the lease gone", { jobId: lease.id, actorId });
      else log.info("job released", { jobId: lease.id, actorId });
    }

    /** Writes `job_failed` on the job's case when its handler maps it to one; otherwise only logs. Then lets the handler clean up. */
    async function reportFailed(job: Job): Promise<void> {
      await recordJobFailed(job);
      const cleanup = handlers[job.kind]?.onPermanentFailure;
      if (cleanup === undefined) return;
      try {
        await cleanup.call(handlers[job.kind], job);
      } catch {
        log.error("job onPermanentFailure threw", { jobId: job.id, actorId });
      }
    }

    async function recordJobFailed(job: Job): Promise<void> {
      const code = job.error?.code ?? "UNKNOWN";
      let caseId: string | null = null;
      try {
        caseId = handlers[job.kind]?.caseIdOf?.(job) ?? null;
      } catch {
        log.error("job caseIdOf threw", { jobId: job.id, actorId });
      }
      if (caseId === null) {
        log.warn(`job failed: ${code}`, { jobId: job.id, actorId });
        return;
      }
      const allowed = deps.authorize(actor, "job work");
      if (!allowed.ok) {
        log.error(`job_failed not authorized: ${allowed.error.code}`, { jobId: job.id, caseId, actorId });
        return;
      }
      const written = await safely("recordEvent", () =>
        deps.recordEvent(actor, { caseId, type: JOB_FAILED, data: { jobId: job.id, kind: job.kind, code } }),
      );
      if (!written.ok) {
        log.error(`job_failed event not recorded: ${written.error.code}`, { jobId: job.id, caseId, actorId });
        return;
      }
      log.warn(`job failed: ${code}`, { jobId: job.id, caseId, actorId });
    }

    function loseLease(run: Running, why: string): void {
      if (run.leaseLost) return;
      run.leaseLost = true;
      log.warn(`job lease lost (${why}), aborting the handler`, { jobId: run.job.id, actorId });
      run.abort.abort(new Error("lease lost"));
    }

    /** One renewal tick: gives up the job when no renewal succeeded for too long, otherwise renews. */
    async function renew(run: Running): Promise<void> {
      if (run.done || run.leaseLost) return;
      if (now() - run.leaseSince >= JOB_LEASE_SAFE_MS) {
        loseLease(run, "not renewed in time");
        return;
      }
      if (run.renewing) return;
      run.renewing = true;
      const sentAt = now();
      const renewed = await within(
        safely("jobs_renew", () => jobs.renew(run.lease)),
        JOB_RENEW_TIMEOUT_MS,
        err({ code: "JOB_RENEW_TIMEOUT", message: "The lease renewal did not answer in time." }),
      );
      run.renewing = false;
      if (run.done || run.leaseLost) return;
      if (!renewed.ok) {
        // The lease is still valid for a while; try again at the next tick.
        log.error(`job lease renewal failed: ${renewed.error.code}`, { jobId: run.job.id, actorId });
        return;
      }
      if (!renewed.value) {
        loseLease(run, "renewal refused");
        return;
      }
      run.leaseSince = Math.max(run.leaseSince, sentAt);
    }

    /** Records a failed attempt through jobs_fail, and `job_failed` when the job is now failed for good. */
    async function recordFailure(job: Job, lease: Lease, failure: JobFailure): Promise<void> {
      const error = toJobError(failure);
      const failed = await safely("jobs_fail", () =>
        jobs.fail(lease, {
          error,
          retryAfterMs: retryDelayMs(job.attempts),
          retryable: failure.retryable !== false,
        }),
      );
      if (!failed.ok) {
        // The lease expires and the job is claimed again.
        log.error(`job fail failed: ${failed.error.code}`, { jobId: job.id, actorId });
        return;
      }
      if (failed.value === null) {
        log.warn("job lease lost before fail", { jobId: job.id, actorId });
        return;
      }
      if (failed.value.status === "failed") await reportFailed(failed.value);
      else log.warn(`job attempt failed, will retry: ${error.code}`, { jobId: job.id, actorId });
    }

    /** Records the handler's outcome, fenced on the lease. `aborted` means it stopped because of the shutdown abort. */
    async function settle(run: Running, outcome: JobOutcome, aborted: boolean): Promise<void> {
      const { job, lease } = run;
      if (run.leaseLost || run.released) return;
      if (aborted) {
        // Interrupted by shutdown, not a real failure: give the attempt back.
        await release(lease);
        return;
      }
      if (outcome.ok) {
        const finished = await safely("jobs_finish", () => jobs.finish(lease));
        if (!finished.ok) log.error(`job finish failed: ${finished.error.code}`, { jobId: job.id, actorId });
        else if (!finished.value) log.warn("job lease lost before finish", { jobId: job.id, actorId });
        else log.info("job succeeded", { jobId: job.id, actorId });
        return;
      }
      await recordFailure(job, lease, outcome.error);
    }

    async function runOne(job: Job, handler: JobHandler, claimSentAt: number): Promise<void> {
      const lease: Lease = { id: job.id, attempts: job.attempts };
      const allowed = deps.authorize(actor, "job work");
      if (!allowed.ok) {
        // Retrying cannot help: end the job instead of reclaiming it forever.
        log.error(`job work not authorized: ${allowed.error.code}`, { jobId: job.id, actorId });
        await recordFailure(job, lease, {
          code: "FORBIDDEN",
          message: "The worker may not do job work.",
          retryable: false,
        });
        return;
      }

      const run: Running = {
        job,
        lease,
        abort: new AbortController(),
        done: false,
        renewing: false,
        leaseLost: false,
        released: false,
        shutdownAbort: false,
        leaseSince: claimSentAt,
        renewal: null,
      };
      current = run;
      run.renewal = timers.setInterval(() => void renew(run), JOB_RENEW_EVERY_MS);
      log.info(`job started: ${job.kind}`, { jobId: job.id, actorId });
      let outcome: JobOutcome;
      let threwAfterAbort = false;
      try {
        outcome = asOutcome(await handler.run(job, run.abort.signal));
      } catch {
        threwAfterAbort = run.shutdownAbort;
        outcome = err({ code: "HANDLER_THREW", message: "The job handler threw." });
      } finally {
        run.done = true;
        timers.clearInterval(run.renewal);
        current = null;
      }
      const aborted = run.shutdownAbort && (threwAfterAbort || (!outcome.ok && outcome.error.code === JOB_ABORTED));
      const settled = settle(run, outcome, aborted);
      settling = settled;
      try {
        await settled;
      } finally {
        settling = null;
      }
    }

    async function tick(): Promise<void> {
      const claimSentAt = now();
      const claimed = await safely("jobs_claim", () => jobs.claim(kinds));
      if (!claimed.ok) {
        log.error(`job claim failed: ${claimed.error.code}`, { actorId });
        await sleep(JOB_POLL_IDLE_MS);
        return;
      }
      const job = claimed.value;
      if (job === null) {
        await sleep(JOB_POLL_IDLE_MS);
        return;
      }
      // Its lease expired on the last attempt: jobs_claim already failed it.
      if (job.status === "failed") {
        await reportFailed(job);
        return;
      }
      const lease: Lease = { id: job.id, attempts: job.attempts };
      const handler = handlers[job.kind];
      if (job.status !== "running" || handler === undefined) {
        log.error(`job claim returned an unrunnable job (${job.status}, ${job.kind})`, { jobId: job.id, actorId });
        if (job.status === "running") await release(lease);
        await sleep(JOB_POLL_IDLE_MS);
        return;
      }
      if (stopping) {
        await release(lease);
        return;
      }
      await runOne(job, handler, claimSentAt);
    }

    async function loop(): Promise<void> {
      while (!stopping) {
        try {
          await tick();
        } catch {
          log.error("job loop iteration threw", { actorId });
          await sleep(JOB_POLL_IDLE_MS);
        }
      }
    }

    const loopDone = loop();

    return {
      stop() {
        stopped ??= (async () => {
          stopping = true;
          wake?.();
          if (current !== null) {
            current.shutdownAbort = true;
            current.abort.abort(new Error("shutdown"));
          }
          const finished = await within(
            loopDone.then(() => true),
            JOB_SHUTDOWN_GRACE_MS,
            false,
          );
          if (finished) return;
          const run = current as Running | null;
          if (run !== null && !run.leaseLost && !run.released) {
            run.released = true;
            timers.clearInterval(run.renewal);
            await release(run.lease);
          }
          // An outcome already being recorded gets a little more time.
          const inFlight = settling as Promise<void> | null;
          if (inFlight !== null) await within(inFlight, JOB_SETTLE_GRACE_MS, undefined);
        })();
        return stopped;
      },
    };
  };
}
