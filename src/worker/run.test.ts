import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_TICK_MS, runWorker, type StopSignal, type WorkerHost } from "./run";

function fakeHost() {
  const signals = new EventEmitter();
  const exit = vi.fn<(code: number) => void>();
  const host: WorkerHost = { on: (signal, listener) => signals.on(signal, listener), exit };
  return { host, exit, send: (signal: StopSignal) => signals.emit(signal) };
}

const loggedLines = () =>
  vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .flatMap((chunk) => chunk.split("\n").filter(Boolean));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runWorker", () => {
  it("logs exactly one JSON readiness line and keeps running", () => {
    const { host, exit } = fakeHost();
    runWorker(host, () => ({}));

    const lines = loggedLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "info", msg: "worker ready" });

    // Something keeps the event loop alive, and it never exits on its own.
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(IDLE_TICK_MS * 3);
    expect(vi.getTimerCount()).toBe(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it.each(["SIGTERM", "SIGINT"] as const)("exits 0 on %s and stops idling", (signal) => {
    const { host, exit, send } = fakeHost();
    runWorker(host, () => ({}));

    send(signal);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("exits only once when a second signal follows the first", () => {
    const { host, exit, send } = fakeHost();
    runWorker(host, () => ({}));

    send("SIGINT");
    send("SIGTERM");
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 without a readiness line or keep-alive when the environment is invalid", () => {
    const { host, exit } = fakeHost();
    runWorker(host, () => {
      throw new Error("Missing SUPABASE_URL");
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(loggedLines()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(String(vi.mocked(console.error).mock.calls[0])).toContain("SUPABASE_URL");
  });

  it("validates with getEnv() by default", () => {
    vi.stubEnv("SUPABASE_URL", undefined);
    try {
      const { host, exit } = fakeHost();
      runWorker(host);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
