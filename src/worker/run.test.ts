import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { JobLoop, JobLoopOptions } from "@/modules/jobs";
import { err, ok } from "@/shared/result";
import { runWorker, workerHandlers, type StopSignal, type WorkerDeps, type WorkerHost } from "./run";

const system: Actor = {
  id: "00000000-0000-4000-8000-0000000000aa",
  email: "system@mac-recap.invalid",
  displayName: "System",
  role: "system",
};

function fakeHost() {
  const signals = new EventEmitter();
  const exit = vi.fn<(code: number) => void>();
  const host: WorkerHost = { on: (signal, listener) => signals.on(signal, listener), exit };
  return { host, exit, send: (signal: StopSignal) => signals.emit(signal) };
}

/** A loop whose stop() resolves when the test says so. */
function fakeLoop() {
  let finish: () => void = () => undefined;
  const stop = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  const loop: JobLoop = { stop };
  const startJobLoop = vi.fn<(options: JobLoopOptions) => JobLoop>(() => loop);
  return { startJobLoop, stop, finishStop: () => finish() };
}

function deps(over: Partial<WorkerDeps> = {}) {
  const loop = fakeLoop();
  const all: WorkerDeps = {
    loadEnv: () => ({}),
    getSystemActor: vi.fn(async () => ok(system)),
    startJobLoop: loop.startJobLoop,
    handlers: () => ({}),
    ...over,
  };
  return { all, loop };
}

const loggedLines = () =>
  vi
    .mocked(process.stdout.write)
    .mock.calls.map(([chunk]) => String(chunk))
    .flatMap((chunk) => chunk.split("\n").filter(Boolean))
    .map((line) => JSON.parse(line) as Record<string, unknown>);

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workerHandlers", () => {
  it("registers exactly the rendition handler (Story 3.2)", () => {
    const handlers = workerHandlers();
    expect(Object.keys(handlers)).toEqual(["rendition"]);
    expect(typeof handlers.rendition?.run).toBe("function");
    expect(typeof handlers.rendition?.caseIdOf).toBe("function");
  });
});

describe("runWorker", () => {
  it("starts the loop with the handlers it is given", async () => {
    const { host } = fakeHost();
    const rendition = { run: vi.fn() };
    const { all, loop } = deps({ handlers: () => ({ rendition }) });
    await runWorker(host, all);
    expect(loop.startJobLoop).toHaveBeenCalledWith({ actor: system, handlers: { rendition } });
  });

  it("resolves the system actor, starts the loop with no handlers and logs one readiness line with the actor id", async () => {
    const { host, exit } = fakeHost();
    const { all, loop } = deps();
    await runWorker(host, all);

    expect(all.getSystemActor).toHaveBeenCalledTimes(1);
    expect(loop.startJobLoop).toHaveBeenCalledWith({ actor: system, handlers: {} });
    const lines = loggedLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "info", msg: "worker ready", actorId: system.id });
    expect(exit).not.toHaveBeenCalled();
  });

  it.each(["SIGTERM", "SIGINT"] as const)("on %s stops the loop, then exits 0", async (signal) => {
    const { host, exit, send } = fakeHost();
    const { all, loop } = deps();
    await runWorker(host, all);

    send(signal);
    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    loop.finishStop();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("stops and exits only once when a second signal follows the first", async () => {
    const { host, exit, send } = fakeHost();
    const { all, loop } = deps();
    await runWorker(host, all);

    send("SIGINT");
    send("SIGTERM");
    loop.finishStop();
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    expect(loop.stop).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 without a readiness line or loop when the environment is invalid", async () => {
    const { host, exit } = fakeHost();
    const { all, loop } = deps({
      loadEnv: () => {
        throw new Error("Missing SUPABASE_URL");
      },
    });
    await runWorker(host, all);

    expect(exit).toHaveBeenCalledWith(1);
    expect(loggedLines()).toEqual([]);
    expect(all.getSystemActor).not.toHaveBeenCalled();
    expect(loop.startJobLoop).not.toHaveBeenCalled();
    expect(String(vi.mocked(console.error).mock.calls[0])).toContain("SUPABASE_URL");
  });

  it.each([
    ["is missing or disabled", async () => err({ code: "UNAUTHENTICATED", message: "No enabled system profile." })],
    ["lookup fails", async () => err({ code: "PROFILE_LOOKUP_FAILED", message: "down" })],
    [
      "lookup throws",
      async () => {
        throw new Error("boom");
      },
    ],
  ] as const)("exits 1 without a readiness line when the system actor %s", async (_label, getSystemActor) => {
    const { host, exit } = fakeHost();
    const { all, loop } = deps({ getSystemActor });
    await runWorker(host, all);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(loop.startJobLoop).not.toHaveBeenCalled();
    const lines = loggedLines();
    expect(lines.filter((l) => l.msg === "worker ready")).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "error" });
  });

  it("exits 1 with a structured log and no readiness line when the job loop fails to start", async () => {
    const { host, exit } = fakeHost();
    const { all } = deps({
      startJobLoop: () => {
        throw new Error("boom");
      },
    });
    await runWorker(host, all);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(loggedLines()).toEqual([expect.objectContaining({ level: "error", msg: "job loop failed to start", actorId: system.id })]);
  });

  it("exits 0 once, without starting the loop, when a signal arrives while the actor resolves", async () => {
    const { host, exit, send } = fakeHost();
    let resolveActor: (value: ReturnType<typeof ok<Actor>>) => void = () => undefined;
    const { all, loop } = deps({ getSystemActor: () => new Promise((resolve) => (resolveActor = resolve)) });
    const running = runWorker(host, all);

    send("SIGTERM");
    resolveActor(ok(system));
    await running;
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(loop.startJobLoop).not.toHaveBeenCalled();
    expect(loggedLines()).toEqual([]);
  });

  it("validates with getEnv() by default", async () => {
    vi.stubEnv("SUPABASE_URL", undefined);
    try {
      const { host, exit } = fakeHost();
      const { all } = deps();
      await runWorker(host, { getSystemActor: all.getSystemActor, startJobLoop: all.startJobLoop });
      expect(exit).toHaveBeenCalledWith(1);
      expect(all.getSystemActor).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
