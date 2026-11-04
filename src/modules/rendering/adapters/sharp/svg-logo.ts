import sharp from "sharp";
import { scanSvgBytes } from "@/shared/svg-safety";
import { err, ok, type Result } from "@/shared/result";

/** The longest side of a rasterised logo: sharp in a 1920 px slide, which shows it far smaller. */
const LOGO_MAX_SIDE_PX = 1200;

/**
 * An SVG client logo as a PNG (Story 5.3), from the stored file's bytes. The bytes pass
 * the SVG safety scan again first. librsvg (through sharp) draws from the buffer with
 * no base URL, so it loads nothing: no network, no files, no DTDs. Errors:
 * `LOGO_UNSAFE` (the scan failed), `LOGO_RASTERISE_FAILED`.
 */
export async function rasteriseSvgLogo(bytes: Uint8Array): Promise<Result<Uint8Array>> {
  if (scanSvgBytes(bytes) !== "ok") return err({ code: "LOGO_UNSAFE", message: "The SVG logo did not pass the safety check." });
  try {
    const png = await sharp(Buffer.from(bytes), { density: 300, limitInputPixels: 64_000_000 })
      .resize({ width: LOGO_MAX_SIDE_PX, height: LOGO_MAX_SIDE_PX, fit: "inside" })
      .png()
      .toBuffer();
    return ok(new Uint8Array(png));
  } catch {
    return err({ code: "LOGO_RASTERISE_FAILED", message: "The SVG logo could not be drawn." });
  }
}
