// Story 3.2: video renditions with the real ffmpeg/ffprobe and sharp. Skipped when
// ffmpeg is not installed locally; CI installs it (and fails here if it is missing),
// and the runtime image ships ffmpeg 6.1.1 (scripts/smoke-image.sh).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFfmpegVideoProcessor } from "@/modules/material/adapters/ffmpeg/video-processor";
import { createSharpImageProcessor } from "@/modules/material/adapters/sharp/image-processor";
import { RENDITION_SPECS } from "@/modules/material/domain/rendition";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe("ffmpeg is available in CI", () => {
  it.runIf(process.env.CI === "true")("ffmpeg and ffprobe run", () => {
    expect(hasFfmpeg).toBe(true);
  });
});

describe.skipIf(!hasFfmpeg)("ffmpeg video renditions (real ffmpeg)", () => {
  let dir: string;
  const processor = createFfmpegVideoProcessor({ image: createSharpImageProcessor() });
  const poster = RENDITION_SPECS["video.poster"];
  const display = RENDITION_SPECS["video.display"];

  /** Generates an H.264/AAC MP4 test clip with ffmpeg's own test source. */
  function clip(name: string, size: string, seconds: number, rate = 5): Uint8Array {
    const out = join(dir, name);
    const made = spawnSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}:duration=${seconds}`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
    ]);
    if (made.status !== 0) throw new Error(`fixture failed: ${made.stderr.toString()}`);
    return new Uint8Array(readFileSync(out));
  }

  function probe(bytes: Uint8Array) {
    const file = join(dir, `probe-${Math.random().toString(16).slice(2)}.mp4`);
    writeFileSync(file, bytes);
    const out = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", file]);
    return JSON.parse(out.stdout.toString()) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] };
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "mac-recap-video-test-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("a 3840×2160 MP4 gets a 2048×1152 WebP poster and a 1920×1080 H.264/AAC faststart MP4", async () => {
    const opened = await processor.open(clip("uhd.mp4", "3840x2160", 2), new AbortController().signal);
    if (!opened.ok) throw new Error(opened.error.code);
    try {
      const p = await opened.value.render(poster);
      if (!p.ok) throw new Error(p.error.code);
      expect(p.value).toMatchObject({ width: 2048, height: 1152 });
      expect((await sharp(p.value.bytes).metadata()).format).toBe("webp");

      const d = await opened.value.render(display);
      if (!d.ok) throw new Error(d.error.code);
      expect(d.value).toMatchObject({ width: 1920, height: 1080 });
      const streams = probe(d.value.bytes).streams;
      expect(streams.find((s) => s.codec_type === "video")).toMatchObject({ codec_name: "h264", width: 1920, height: 1080 });
      expect(streams.find((s) => s.codec_type === "audio")).toMatchObject({ codec_name: "aac" });
      // faststart: the moov atom comes before the media data.
      const text = Buffer.from(d.value.bytes).toString("latin1");
      expect(text.indexOf("moov")).toBeGreaterThan(0);
      expect(text.indexOf("moov")).toBeLessThan(text.indexOf("mdat"));
    } finally {
      await opened.value.close();
    }
  }, 120_000);

  it("a 0.5 s clip gets its poster from the first frame, at its own size (never enlarged)", async () => {
    const opened = await processor.open(clip("short.mp4", "640x360", 0.5, 10), new AbortController().signal);
    if (!opened.ok) throw new Error(opened.error.code);
    try {
      const p = await opened.value.render(poster);
      if (!p.ok) throw new Error(p.error.code);
      expect(p.value).toMatchObject({ width: 640, height: 360 });
      const d = await opened.value.render(display);
      if (!d.ok) throw new Error(d.error.code);
      expect(d.value).toMatchObject({ width: 640, height: 360 });
    } finally {
      await opened.value.close();
    }
  }, 60_000);

  it("an undecodable file fails for good", async () => {
    const opened = await processor.open(new TextEncoder().encode("definitely not a video"), new AbortController().signal);
    expect(opened).toEqual({ ok: false, error: expect.objectContaining({ code: "RENDITION_UNDECODABLE", retryable: false }) });
  });

  it("an abort during the transcode kills ffmpeg and reports ABORTED", async () => {
    const controller = new AbortController();
    const opened = await processor.open(clip("abort.mp4", "3840x2160", 6, 10), controller.signal);
    if (!opened.ok) throw new Error(opened.error.code);
    try {
      const started = Date.now();
      const pending = opened.value.render(display);
      setTimeout(() => controller.abort(), 200);
      const d = await pending;
      expect(d).toEqual({ ok: false, error: expect.objectContaining({ code: "ABORTED" }) });
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      await opened.value.close();
    }
  }, 120_000);
});
