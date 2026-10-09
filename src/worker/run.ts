import { getEnv } from "@/shared/env";
import { log } from "@/shared/log";

export type StopSignal = "SIGTERM" | "SIGINT";

export const STOP_SIGNALS: readonly StopSignal[] = ["SIGTERM", "SIGINT"];

/** The parts of `process` the worker touches, injected so tests never exit for real. */
export interface WorkerHost {
  on(signal: StopSignal, listener: () => void): unknown;
  exit(code: number): void;
}

/** Long interval whose only job is to keep the event loop alive while idle. */
export const IDLE_TICK_MS = 60 * 60 * 1000;

/**
 * Starts the worker: validates the environment (exit 1 when invalid), logs one
 * readiness line and idles until SIGTERM or SIGINT, then exits 0. There is no
 * job loop yet; it arrives with the jobs module.
 */
export function runWorker(host: WorkerHost, loadEnv: () => unknown = getEnv): void {
  try {
    loadEnv();
  } catch (error) {
    console.error("Invalid environment, refusing to start:", error);
    host.exit(1);
    return;
  }

  const keepAlive = setInterval(() => undefined, IDLE_TICK_MS);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(keepAlive);
    host.exit(0);
  };
  for (const signal of STOP_SIGNALS) host.on(signal, stop);

  log.info("worker ready");
}
