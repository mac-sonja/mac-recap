import { getSystemActor, type Actor } from "@/modules/access";
import { startJobLoop, type JobHandlers, type JobLoop, type JobLoopOptions } from "@/modules/jobs";
import * as materialWorker from "@/modules/material/worker";
import { getEnv } from "@/shared/env";
import { log } from "@/shared/log";
import type { Result } from "@/shared/result";

export type StopSignal = "SIGTERM" | "SIGINT";

export const STOP_SIGNALS: readonly StopSignal[] = ["SIGTERM", "SIGINT"];

/** The parts of `process` the worker touches, injected so tests never exit for real. */
export interface WorkerHost {
  on(signal: StopSignal, listener: () => void): unknown;
  exit(code: number): void;
}

/** What the worker starts from, injected so tests need no database. */
export interface WorkerDeps {
  loadEnv: () => unknown;
  getSystemActor: () => Promise<Result<Actor>>;
  startJobLoop: (options: JobLoopOptions) => JobLoop;
  /** The job handlers, one per kind; built after the environment is valid. */
  handlers: () => JobHandlers;
}

/** Every handler the worker runs: `rendition` (Story 3.2). Kinds without one are never claimed. */
export const workerHandlers = (): JobHandlers => ({ rendition: materialWorker.renditionHandler() });

const defaultDeps: WorkerDeps = { loadEnv: getEnv, getSystemActor, startJobLoop, handlers: workerHandlers };

/**
 * Starts the worker: validates the environment, resolves the `system` actor
 * (exit 1 without a readiness line when either fails), starts the job loop and
 * logs one readiness line with the actor id (exit 1 without it when the loop
 * fails to start). On SIGTERM or SIGINT it stops the
 * loop (the running job is released after at most 10 s) and exits 0, once.
 * The loop claims only kinds with a handler: `rendition` so far.
 */
export async function runWorker(host: WorkerHost, overrides: Partial<WorkerDeps> = {}): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  let exited = false;
  const exit = (code: number) => {
    if (exited) return;
    exited = true;
    host.exit(code);
  };

  try {
    deps.loadEnv();
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    exit(1);
    return;
  }

  let loop: JobLoop | null = null;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (loop === null) {
      exit(0);
      return;
    }
    void loop.stop().then(
      () => exit(0),
      () => exit(0),
    );
  };
  for (const signal of STOP_SIGNALS) host.on(signal, stop);

  let actor: Result<Actor>;
  try {
    actor = await deps.getSystemActor();
  } catch {
    actor = { ok: false, error: { code: "SYSTEM_ACTOR_LOOKUP_THREW", message: "The system actor lookup threw." } };
  }
  if (stopping) return;
  if (!actor.ok) {
    log.error(`no system actor, refusing to start: ${actor.error.code}`);
    exit(1);
    return;
  }

  try {
    loop = deps.startJobLoop({ actor: actor.value, handlers: deps.handlers() });
  } catch {
    log.error("job loop failed to start", { actorId: actor.value.id });
    exit(1);
    return;
  }
  log.info("worker ready", { actorId: actor.value.id });
}
