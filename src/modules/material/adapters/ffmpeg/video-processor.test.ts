import { EventEmitter } from "node:events";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RENDITION_SPECS } from "@/modules/material/domain/rendition";
import type { ImageProcessor } from "@/modules/material/ports/media-processing";
import { ok } from "@/shared/result";
import {
  classifyRun,
  createFfmpegVideoProcessor,
  ffmpegTimeoutMs,
  MAX_OUTPUT_BYTES,
  PROBE_TIMEOUT_MS,
  run,
  type RunResult,
  type SpawnFn,
} from "./video-processor";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const live = () => new AbortController().signal;
const T = { timeoutMs: 10_000 };

/** Never called: these tests stop before a poster frame is encoded. */
const unusedImage: ImageProcessor = {
  render: () => {
    throw new Error("image processor called");
  },
};

/** What one fake process does. `hang` never exits until killed. */
interface Script {
  stdout?: Buffer | string;
  stderr?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  hang?: boolean;
  /** Writes these bytes to the last argument (ffmpeg's output file) before exiting. */
  output?: Buffer;
}

/** A fake `spawn`: each call runs the script `plan(bin, args)` returns, and records the call. */
function fakeSpawn(plan: (bin: string, args: string[]) => Script) {
  const calls: { bin: string; args: string[] }[] = [];
  const spawn = vi.fn((bin: string, args: string[]) => {
    calls.push({ bin, args });
    const script = plan(bin, args);
    const child = Object.assign(new EventEmitter(), {
      pid: 4242,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn((signal: NodeJS.Signals) => {
        queueMicrotask(() => child.emit("close", null, signal));
        return true;
      }),
    });
    if (!script.hang) {
      queueMicrotask(() => {
        if (script.output) writeFileSync(args[args.length - 1], script.output);
        if (script.stdout !== undefined) child.stdout.emit("data", Buffer.from(script.stdout));
        if (script.stderr !== undefined) child.stderr.emit("data", Buffer.from(script.stderr));
        child.emit("close", script.code ?? 0, script.signal ?? null);
      });
    }
    return child;
  });
  return { spawn: spawn as unknown as SpawnFn, calls };
}

const probeJson = (width: number, height: number, duration: number) =>
  JSON.stringify({ streams: [{ width, height }], format: { duration: String(duration) } });

const result = (over: Partial<RunResult>): RunResult => ({
  code: 1,
  signal: null,
  stdout: Buffer.alloc(0),
  stderrTail: "",
  aborted: false,
  timedOut: false,
  missing: false,
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("run (spawned processes)", () => {
  it("returns the exit code and stdout", async () => {
    const r = await run(process.execPath, ["-e", "process.stdout.write('hi'); process.exit(3)"], live(), T);
    expect(r).toMatchObject({ code: 3, aborted: false, missing: false, timedOut: false });
    expect(r.stdout.toString()).toBe("hi");
  });

  it("an abort kills the process at once", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = run(process.execPath, ["-e", "console.log(process.pid); setInterval(() => {}, 1000)"], controller.signal, T);
    await new Promise((resolve) => setTimeout(resolve, 300));
    controller.abort();
    const r = await pending;
    expect(r.aborted).toBe(true);
    expect(r.code).toBeNull();
    expect(Date.now() - started).toBeLessThan(5000);
    const pid = Number(r.stdout.toString().trim());
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    expect(alive(pid)).toBe(false);
  });

  it("a real process past its time limit is killed", async () => {
    const r = await run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], live(), { timeoutMs: 200 });
    expect(r).toMatchObject({ timedOut: true, code: null, signal: "SIGKILL" });
  });

  it("an already aborted signal starts nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await run(process.execPath, ["-e", "1"], controller.signal, T)).toMatchObject({ aborted: true, code: null });
  });

  it("a missing binary is reported, not thrown", async () => {
    expect(await run("mac-recap-no-such-binary", [], live(), T)).toMatchObject({ missing: true, code: null });
  });

  it("keeps only the last MAX_OUTPUT_BYTES of stdout and stderr (fake spawn)", async () => {
    const big = Buffer.concat([Buffer.alloc(2 * MAX_OUTPUT_BYTES, "a"), Buffer.from("END")]);
    const { spawn } = fakeSpawn(() => ({ stdout: big, stderr: `${"x".repeat(2 * MAX_OUTPUT_BYTES)}LAST` }));
    const r = await run("ffmpeg", [], live(), T, spawn);
    expect(r.stdout.length).toBe(MAX_OUTPUT_BYTES);
    expect(r.stdout.subarray(-3).toString()).toBe("END");
    expect(r.stderrTail.length).toBe(MAX_OUTPUT_BYTES);
    expect(r.stderrTail.endsWith("LAST")).toBe(true);
  });

  it("kills a hanging process at the time limit (fake spawn, fake timers)", async () => {
    vi.useFakeTimers();
    const { spawn } = fakeSpawn(() => ({ hang: true }));
    const pending = run("ffmpeg", [], live(), { timeoutMs: 60_000 }, spawn);
    await vi.advanceTimersByTimeAsync(59_999);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ timedOut: true, signal: "SIGKILL" });
  });
});

describe("time limits", () => {
  it("ffmpeg gets max(60 s, 6 × duration); ffprobe 30 s", () => {
    expect(ffmpegTimeoutMs(0)).toBe(60_000);
    expect(ffmpegTimeoutMs(5)).toBe(60_000);
    expect(ffmpegTimeoutMs(10)).toBe(60_000);
    expect(ffmpegTimeoutMs(100)).toBe(600_000);
    expect(PROBE_TIMEOUT_MS).toBe(30_000);
  });
});

describe("classifyRun", () => {
  it("a timeout fails for good with its own code", () => {
    expect(classifyRun("ffmpeg", result({ timedOut: true, code: null, signal: "SIGKILL" }))).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "RENDITION_TIMEOUT", retryable: false }),
    });
  });

  it.each(["Invalid data found when processing input", "moov atom not found", "Error while decoding stream #0:0"])(
    "a non-zero exit with a decode error fails for good: %s",
    (stderrTail) => {
      expect(classifyRun("ffmpeg", result({ code: 1, stderrTail }))).toEqual({
        ok: false,
        error: expect.objectContaining({ code: "RENDITION_UNDECODABLE", retryable: false }),
      });
    },
  );

  it.each([
    ["killed by a signal (OOM)", result({ code: null, signal: "SIGKILL", stderrTail: "Invalid data found" })],
    ["disk full", result({ code: 1, stderrTail: "Error writing trailer: No space left on device" })],
    ["no message", result({ code: 1 })],
  ])("%s is a retryable RENDITION_FAILED", (_label, r) => {
    const outcome = classifyRun("ffmpeg", r);
    expect(outcome).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_FAILED" }) });
    expect(outcome.ok || outcome.error.retryable).not.toBe(false);
  });

  it("an abort and a missing binary keep their codes", () => {
    expect(classifyRun("ffmpeg", result({ aborted: true }))).toMatchObject({ error: { code: "ABORTED" } });
    expect(classifyRun("ffmpeg", result({ missing: true, code: null }))).toMatchObject({ error: { code: "FFMPEG_UNAVAILABLE" } });
  });
});

describe("createFfmpegVideoProcessor (fake spawn)", () => {
  const display = RENDITION_SPECS["video.display"];
  const poster = RENDITION_SPECS["video.poster"];
  const image: ImageProcessor = { render: vi.fn(async () => ok({ bytes: new Uint8Array([1]), width: 2048, height: 1152 })) };

  it("caps the display bitrate (4M peak, 8M buffer, 128k audio) and reads the output's size", async () => {
    const { spawn, calls } = fakeSpawn((bin) =>
      bin === "ffprobe" ? { stdout: probeJson(1920, 1080, 20) } : { output: Buffer.from("mp4 bytes") },
    );
    const opened = await createFfmpegVideoProcessor({ image, spawn }).open(new Uint8Array([1]), live());
    if (!opened.ok) throw new Error(opened.error.code);
    const d = await opened.value.render(display);
    await opened.value.close();
    expect(d).toEqual(ok({ bytes: new Uint8Array(Buffer.from("mp4 bytes")), width: 1920, height: 1080 }));
    const args = calls.find((c) => c.bin === "ffmpeg")?.args ?? [];
    const after = (flag: string) => args[args.indexOf(flag) + 1];
    expect(after("-maxrate")).toBe("4000k");
    expect(after("-bufsize")).toBe("8000k");
    expect(after("-b:a")).toBe("128k");
    expect(after("-c:v")).toBe("libx264");
    expect(after("-movflags")).toBe("+faststart");
  });

  it("the poster frame goes to a file, not stdout, then through the image processor", async () => {
    const { spawn, calls } = fakeSpawn((bin) => (bin === "ffprobe" ? { stdout: probeJson(3840, 2160, 20) } : { output: Buffer.from("png") }));
    const opened = await createFfmpegVideoProcessor({ image, spawn }).open(new Uint8Array([1]), live());
    if (!opened.ok) throw new Error(opened.error.code);
    expect(await opened.value.render(poster)).toEqual(ok({ bytes: new Uint8Array([1]), width: 2048, height: 1152 }));
    await opened.value.close();
    const args = calls.find((c) => c.bin === "ffmpeg")?.args ?? [];
    expect(args[args.indexOf("-ss") + 1]).toBe("1");
    expect(args.at(-1)).toMatch(/\.png$/);
    expect(args).not.toContain("pipe:1");
  });

  it("an ffmpeg killed by a signal (OOM) is retryable", async () => {
    const { spawn } = fakeSpawn((bin) => (bin === "ffprobe" ? { stdout: probeJson(640, 360, 2) } : { code: null, signal: "SIGKILL" }));
    const opened = await createFfmpegVideoProcessor({ image, spawn }).open(new Uint8Array([1]), live());
    if (!opened.ok) throw new Error(opened.error.code);
    const d = await opened.value.render(display);
    await opened.value.close();
    expect(d).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_FAILED" }) });
  });

  it("an ffprobe decode error fails for good", async () => {
    const { spawn } = fakeSpawn(() => ({ code: 1, stderr: "x: Invalid data found when processing input" }));
    expect(await createFfmpegVideoProcessor({ image, spawn }).open(new Uint8Array([1]), live())).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "RENDITION_UNDECODABLE", retryable: false }),
    });
  });

  it("an ffprobe that hangs is killed after 30 s and fails for good with RENDITION_TIMEOUT", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { spawn } = fakeSpawn(() => ({ hang: true }));
    const pending = createFfmpegVideoProcessor({ image, spawn }).open(new Uint8Array([1]), live());
    // Let the temp file be written before the clock moves.
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    expect(await pending).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_TIMEOUT", retryable: false }) });
  });

  it("a temp dir that cannot be made (disk full, …) is a retryable RENDITION_FAILED", async () => {
    const { spawn } = fakeSpawn(() => ({}));
    const opened = await createFfmpegVideoProcessor({ image, spawn, tempRoot: "/nonexistent/mac-recap" }).open(new Uint8Array([1]), live());
    expect(opened).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_FAILED" }) });
    expect(opened.ok || opened.error.retryable).not.toBe(false);
  });
});

describe("createFfmpegVideoProcessor without ffmpeg", () => {
  it("a missing ffprobe is a retryable FFMPEG_UNAVAILABLE", async () => {
    const processor = createFfmpegVideoProcessor({ image: unusedImage, ffprobe: "mac-recap-no-such-ffprobe" });
    const opened = await processor.open(new Uint8Array([1, 2, 3]), live());
    expect(opened).toEqual({ ok: false, error: expect.objectContaining({ code: "FFMPEG_UNAVAILABLE" }) });
    expect(opened.ok || opened.error).not.toHaveProperty("retryable", false);
  });

  it("does nothing once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const opened = await createFfmpegVideoProcessor({ image: unusedImage }).open(new Uint8Array([1]), controller.signal);
    expect(opened).toEqual({ ok: false, error: expect.objectContaining({ code: "ABORTED" }) });
  });
});
