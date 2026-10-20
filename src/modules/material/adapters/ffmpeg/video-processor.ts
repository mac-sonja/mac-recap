import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JOB_ABORTED } from "@/modules/jobs";
import {
  RENDITION_FAILED,
  RENDITION_TIMEOUT,
  RENDITION_UNDECODABLE,
  type VideoDisplaySpec,
  type VideoPosterSpec,
} from "@/modules/material/domain/rendition";
import type { ImageProcessor, RenditionFailure, VideoProcessor, VideoSession } from "@/modules/material/ports/media-processing";
import { err, ok, type Result } from "@/shared/result";

/** How a spawned process ended. */
export interface RunResult {
  /** Exit code, or null when killed or never started. */
  code: number | null;
  /** The signal that killed it, if any. */
  signal: NodeJS.Signals | null;
  /** The captured stdout (at most `maxOutputBytes`, its tail). */
  stdout: Buffer;
  /** The tail of stderr, for classifying the failure (never logged with material). */
  stderrTail: string;
  aborted: boolean;
  /** Killed because it ran past `timeoutMs`. */
  timedOut: boolean;
  /** The binary could not be started (e.g. not installed). */
  missing: boolean;
}

export interface RunOptions {
  /** Killed (SIGKILL) after this long. */
  timeoutMs: number;
  /** At most this many bytes of stdout and of stderr are kept (the tail). Default 1 MB. */
  maxOutputBytes?: number;
}

/** The part of `child_process.spawn` the runner uses, injected in tests. */
export type SpawnFn = typeof nodeSpawn;

export const MAX_OUTPUT_BYTES = 1024 * 1024;
/** ffprobe gets this long. */
export const PROBE_TIMEOUT_MS = 30_000;
/** ffmpeg gets max(this, `FFMPEG_TIMEOUT_PER_SECOND` × the video's duration). */
export const FFMPEG_MIN_TIMEOUT_MS = 60_000;
export const FFMPEG_TIMEOUT_PER_SECOND = 6;

export const ffmpegTimeoutMs = (durationSeconds: number) =>
  Math.max(FFMPEG_MIN_TIMEOUT_MS, Math.ceil(FFMPEG_TIMEOUT_PER_SECOND * Math.max(0, durationSeconds) * 1000));

/** Appends `chunk` to `chunks`, dropping the oldest bytes beyond `max`. */
function keepTail(chunks: Buffer[], size: { n: number }, chunk: Buffer, max: number) {
  chunks.push(chunk);
  size.n += chunk.length;
  while (size.n > max && chunks.length > 0) {
    const over = size.n - max;
    const first = chunks[0];
    if (first.length <= over) {
      chunks.shift();
      size.n -= first.length;
    } else {
      chunks[0] = first.subarray(over);
      size.n -= over;
    }
  }
}

/**
 * Runs `bin args` without a shell. An abort of `signal`, or running past
 * `timeoutMs`, kills the process (SIGKILL) at once; the promise still resolves
 * once it has exited. stdout and stderr keep at most `maxOutputBytes` each.
 */
export function run(bin: string, args: readonly string[], signal: AbortSignal, options: RunOptions, spawn: SpawnFn = nodeSpawn): Promise<RunResult> {
  const max = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    const outSize = { n: 0 };
    const errChunks: Buffer[] = [];
    const errSize = { n: 0 };
    let missing = false;
    let timedOut = false;
    let settled = false;
    const timer: { handle?: ReturnType<typeof setTimeout> } = {};
    const finish = (code: number | null, killedBy: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer.handle);
      resolve({
        code,
        signal: killedBy,
        stdout: Buffer.concat(out),
        stderrTail: Buffer.concat(errChunks).toString("utf8"),
        aborted: signal.aborted,
        timedOut,
        missing,
      });
    };
    if (signal.aborted) {
      finish(null, null);
      return;
    }
    const child = spawn(bin, [...args], { stdio: ["ignore", "pipe", "pipe"], signal, killSignal: "SIGKILL" });
    timer.handle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => keepTail(out, outSize, chunk, max));
    child.stderr?.on("data", (chunk: Buffer) => keepTail(errChunks, errSize, chunk, max));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") missing = true;
      // An abort or a spawn failure: 'close' may never come when the process never started.
      if (child.pid === undefined) finish(null, null);
    });
    child.on("close", (code: number | null, killedBy: NodeJS.Signals | null) => finish(code, killedBy));
  });
}

/** What ffmpeg/ffprobe print when the input itself cannot be decoded. */
const DECODE_ERROR =
  /Invalid data found when processing input|moov atom not found|could not find codec parameters|Error (while )?decoding|does not contain any stream|Invalid NAL unit|corrupt|Unknown format|End of file|no frame!/i;

/** ffmpeg's note when a seek gave no frame to write. */
const NO_FRAME = /Output file is empty|nothing was encoded/i;

const aborted = (): Result<never, RenditionFailure> => err({ code: JOB_ABORTED, message: "Stopped while rendering the video." });
const undecodable = (): Result<never, RenditionFailure> =>
  err({ code: RENDITION_UNDECODABLE, message: "The video could not be decoded.", retryable: false });
const failed = (): Result<never, RenditionFailure> => err({ code: RENDITION_FAILED, message: "The video could not be rendered." });

/**
 * Classifies a finished ffmpeg/ffprobe run that did not exit 0: an abort, a
 * timeout (not retried), a missing binary, a decode error (exit code with a
 * decode message and no signal: not retried), or anything else (killed by a
 * signal such as the OOM killer, disk full, …): a retryable RENDITION_FAILED.
 */
export function classifyRun(bin: string, result: RunResult): Result<never, RenditionFailure> {
  if (result.aborted) return aborted();
  if (result.timedOut) return err({ code: RENDITION_TIMEOUT, message: `${bin} ran past its time limit.`, retryable: false });
  if (result.missing) return err({ code: "FFMPEG_UNAVAILABLE", message: `${bin} could not be started.` });
  if (result.code !== null && result.signal === null && DECODE_ERROR.test(result.stderrTail)) return undecodable();
  return failed();
}

/** What ffprobe reports about the first video stream. */
interface Probe {
  width: number;
  height: number;
  /** Seconds; 0 when unknown. */
  duration: number;
}

export interface FfmpegOptions {
  /** The image processor that encodes the poster frame (the same downscale as images). */
  image: ImageProcessor;
  ffmpeg?: string;
  ffprobe?: string;
  /** Where the temporary files go (default: the OS temp dir). */
  tempRoot?: string;
  /** Tests inject a fake spawn. */
  spawn?: SpawnFn;
}

const missingFile = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code === "ENOENT";

/**
 * ffmpeg-backed video renditions (worker only). The original is written once
 * to a private temp dir and only read from there. The poster is one frame at
 * `atSeconds` (the first frame when the video is not longer), encoded by the
 * image processor. The display copy is H.264/AAC MP4 with faststart, scaled
 * to fit `maxLongSide` (never enlarged; ffmpeg applies the rotation metadata)
 * and bitrate-capped. ffprobe runs at most 30 s, ffmpeg max(60 s, 6 × duration).
 * Only a real decode failure fails with `retryable: false` (and a timeout);
 * anything else is a retryable `RENDITION_FAILED`.
 */
export function createFfmpegVideoProcessor({
  image,
  ffmpeg = "ffmpeg",
  ffprobe = "ffprobe",
  tempRoot = tmpdir(),
  spawn = nodeSpawn,
}: FfmpegOptions): VideoProcessor {
  async function probe(file: string, signal: AbortSignal): Promise<Result<Probe, RenditionFailure>> {
    const result = await run(
      ffprobe,
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file],
      signal,
      { timeoutMs: PROBE_TIMEOUT_MS },
      spawn,
    );
    if (result.code !== 0) return classifyRun(ffprobe, result);
    try {
      const parsed = JSON.parse(result.stdout.toString("utf8")) as {
        streams?: { width?: number; height?: number }[];
        format?: { duration?: string };
      };
      const stream = parsed.streams?.[0];
      if (!stream?.width || !stream?.height) return undecodable();
      const duration = Number(parsed.format?.duration);
      return ok({ width: stream.width, height: stream.height, duration: Number.isFinite(duration) ? duration : 0 });
    } catch {
      return undecodable();
    }
  }

  return {
    async open(input, signal) {
      if (signal.aborted) return aborted();
      let dir: string;
      try {
        dir = await mkdtemp(join(tempRoot, "mac-recap-video-"));
      } catch {
        return failed();
      }
      const close = () => rm(dir, { recursive: true, force: true });
      const source = join(dir, "source");
      try {
        await writeFile(source, input);
      } catch {
        // Typically ENOSPC: not the file's fault.
        await close();
        return failed();
      }
      const probed = await probe(source, signal);
      if (!probed.ok) {
        await close();
        return probed;
      }
      const { duration } = probed.value;
      const timeoutMs = ffmpegTimeoutMs(duration);

      /** The frame at `seconds` as PNG, or null when there is none (seeked past the end). */
      async function frameAt(seconds: number): Promise<Result<Buffer | null, RenditionFailure>> {
        const out = join(dir, `frame-${seconds}.png`);
        const result = await run(
          ffmpeg,
          ["-nostdin", "-v", "error", "-y", "-ss", String(seconds), "-i", source, "-frames:v", "1", "-an", "-update", "1", "-c:v", "png", out],
          signal,
          { timeoutMs },
          spawn,
        );
        if (result.code !== 0 && !NO_FRAME.test(result.stderrTail)) return classifyRun(ffmpeg, result);
        try {
          const frame = await readFile(out);
          return ok(frame.length > 0 ? frame : null);
        } catch (error) {
          return missingFile(error) ? ok(null) : failed();
        }
      }

      async function poster(spec: VideoPosterSpec) {
        const at = duration > spec.atSeconds ? spec.atSeconds : 0;
        let frame = await frameAt(at);
        // Seeking past the last frame gives no output: fall back to the first frame.
        if (frame.ok && frame.value === null && at > 0) frame = await frameAt(0);
        if (!frame.ok) return frame;
        if (frame.value === null) return undecodable();
        return image.render(frame.value, spec, signal);
      }

      async function display(spec: VideoDisplaySpec) {
        const out = join(dir, `display.${spec.ext}`);
        const box = spec.maxLongSide;
        const result = await run(
          ffmpeg,
          [
            "-nostdin", "-v", "error", "-y",
            "-i", source,
            "-map", "0:v:0", "-map", "0:a:0?",
            // Fit inside a box no bigger than the source: aspect kept, never enlarged; even sides for yuv420p.
            "-vf", `scale=w='min(${box},iw)':h='min(${box},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
            "-c:v", "libx264", "-preset", spec.preset, "-crf", String(spec.crf), "-pix_fmt", spec.pixelFormat,
            // Bitrate cap: keeps the copy well under the bucket's 50 MB per object.
            "-maxrate", `${spec.maxrateKbps}k`, "-bufsize", `${spec.bufsizeKbps}k`,
            "-c:a", "aac", "-b:a", `${spec.audioBitrateKbps}k`,
            "-movflags", "+faststart",
            "-f", "mp4", out,
          ],
          signal,
          { timeoutMs },
          spawn,
        );
        if (result.code !== 0) return classifyRun(ffmpeg, result);
        const size = await probe(out, signal);
        if (!size.ok) return size;
        try {
          return ok({ bytes: new Uint8Array(await readFile(out)), width: size.value.width, height: size.value.height });
        } catch {
          return failed();
        }
      }

      const session: VideoSession = {
        render: (spec) => (spec.name === "video.poster" ? poster(spec) : display(spec)),
        close,
      };
      return ok(session);
    },
  };
}
