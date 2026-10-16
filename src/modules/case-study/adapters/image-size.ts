/**
 * Reads an image's real format and pixel size from its header bytes, for the
 * logo check at confirm. Plain TypeScript on purpose: web code never loads
 * `sharp` (AD-10, `test/web-imports.test.ts`), and confirm runs in a server
 * action. Covers exactly the logo formats: PNG, JPEG and WebP (lossy, lossless
 * and extended). Anything else, a truncated header, or a body that doesn't end
 * the way its format must (PNG `IEND` chunk, JPEG `FFD9`, WebP RIFF size equal to
 * the byte length) is `null`: a header alone can't vouch for the image.
 */
export interface ImageSize {
  format: "png" | "jpeg" | "webp";
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || !PNG_SIGNATURE.every((byte, i) => b[i] === byte) || ascii(b, 12, 4) !== "IHDR") return null;
  // The last chunk is IEND: length 0, type, CRC (12 bytes).
  if (b.length < 24 + 12 || u32be(b, b.length - 12) !== 0 || ascii(b, b.length - 8, 4) !== "IEND") return null;
  return { format: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

/** Start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but don't. */
const isStartOfFrame = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function jpeg(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  // The image ends with the EOI marker.
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // Markers without a length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    // End of image or start of scan before any frame header: no size.
    if (marker === 0xd9 || marker === 0xda) return null;
    if (isStartOfFrame(marker)) {
      if (i + 8 >= b.length) return null;
      return { format: "jpeg", width: u16be(b, i + 7), height: u16be(b, i + 5) };
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): ImageSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  // The RIFF size covers everything after its 8-byte header, so a cut or padded body fails.
  if (u32le(b, 4) + 8 !== b.length) return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Lossy: frame tag (3 bytes) at 20, start code 9d 01 2a at 23, 14-bit sizes at 26 and 28.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { format: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: signature 0x2f at 20, then 14 bits of width - 1 and 14 bits of height - 1.
    if (b[20] !== 0x2f) return null;
    const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
    return {
      format: "webp",
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit canvas width - 1 at 24 and height - 1 at 27.
    return { format: "webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  }
  return null;
}

/** The image's format and size, or null when the bytes are not a PNG, JPEG or WebP this can read. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  return png(bytes) ?? jpeg(bytes) ?? webp(bytes);
}
