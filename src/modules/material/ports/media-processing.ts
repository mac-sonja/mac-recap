import type { ImageRenditionSpec, RenditionSpec } from "@/modules/material/domain/rendition";
import type { AppError, Result } from "@/shared/result";

/** A failed rendering step. `retryable: false` for a file that can never be decoded. */
export type RenditionFailure = AppError & { retryable?: boolean };

/** One made copy, before it is stored. */
export interface RenditionOutput {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * Makes image renditions (worker only; `adapters/sharp/`). Only downscales the
 * whole image (aspect kept, never enlarged) after applying the EXIF
 * orientation, then encodes; never crops, recolours or filters.
 */
export interface ImageProcessor {
  render(input: Uint8Array, spec: ImageRenditionSpec, signal: AbortSignal): Promise<Result<RenditionOutput, RenditionFailure>>;
}

/** One opened video: the original written once, rendered spec by spec, then closed. */
export interface VideoSession {
  render(spec: Extract<RenditionSpec, { source: "video" }>): Promise<Result<RenditionOutput, RenditionFailure>>;
  /** Removes every temporary file; safe to call twice. */
  close(): Promise<void>;
}

/** Makes video renditions (worker only; `adapters/ffmpeg/`). An abort kills ffmpeg. */
export interface VideoProcessor {
  open(input: Uint8Array, signal: AbortSignal): Promise<Result<VideoSession, RenditionFailure>>;
}
