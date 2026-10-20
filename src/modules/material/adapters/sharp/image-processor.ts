import sharp from "sharp";
import { JOB_ABORTED } from "@/modules/jobs";
import { RENDITION_FAILED, RENDITION_UNDECODABLE, type ImageRenditionSpec } from "@/modules/material/domain/rendition";
import type { ImageProcessor, RenditionFailure } from "@/modules/material/ports/media-processing";
import { err, ok } from "@/shared/result";

/**
 * The whole image pipeline (Story 3.2 guardrail): apply the EXIF orientation,
 * downscale the whole image so its long side fits `maxLongSide` (aspect kept,
 * never enlarged), encode. Nothing else: no crop, extract, recolour, filter,
 * sharpen, composite or watermark. `image-processor.test.ts` checks this
 * function's calls statically, so keep it to exactly these four.
 */
// pipeline:start
export function downscale(input: Uint8Array, spec: ImageRenditionSpec) {
  return sharp(input)
    .rotate()
    .resize({ width: spec.maxLongSide, height: spec.maxLongSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality: spec.quality })
    .toBuffer({ resolveWithObject: true });
}
// pipeline:end

/**
 * sharp's messages for a file it cannot decode: an unknown format, a corrupt or
 * truncated header or body. Anything else (out of memory, pixel limit, I/O) is
 * not the file's fault and is retried.
 */
const DECODE_ERROR =
  /unsupported image format|contains unsupported|corrupt header|premature end|truncated|VipsJpeg:|vipspng:|libpng|libwebp|(jpeg|png|webp|heif)load|Invalid (PNG|JPEG|WebP)/i;

/** Classifies a sharp failure: a real decode failure fails for good; anything else is retryable. */
export function classifySharpError(error: unknown): RenditionFailure {
  const message = error instanceof Error ? error.message : String(error);
  return DECODE_ERROR.test(message)
    ? { code: RENDITION_UNDECODABLE, message: "The image could not be decoded.", retryable: false }
    : { code: RENDITION_FAILED, message: "The image could not be rendered." };
}

/** sharp-backed image renditions (worker only). A file sharp cannot decode fails for good. */
export function createSharpImageProcessor(): ImageProcessor {
  return {
    async render(input, spec, signal) {
      if (signal.aborted) return err({ code: JOB_ABORTED, message: "Stopped before rendering." });
      try {
        const { data, info } = await downscale(input, spec);
        return ok({ bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height });
      } catch (error) {
        return err(classifySharpError(error));
      }
    },
  };
}
