/**
 * The SVG logo safety scan (spec "Accept SVG client logos", 2026-10-19). Pure and
 * dependency-free, so the browser (at pick) and the server (at confirm) run the very
 * same check. An SVG is accepted as is or refused: it is never sanitised or rewritten.
 *
 * Accepted only when the text is valid UTF-8, the root element is `<svg` (after an
 * optional `<?xml …?>` declaration and comments) and the text ends with `</svg>`, and
 * none of these appear: a `<!DOCTYPE` other than the standard SVG 1.0 / 1.1 one with no
 * internal subset, `<!ENTITY` (or any other `<!` declaration but a comment or CDATA),
 * another processing instruction, `<script`, `<foreignObject`, `<iframe`, `<embed`, `<object`, an attribute whose name starts with `on`,
 * `javascript:`, an `href` / `xlink:href` value not starting with `#` (except an `<image>`
 * href holding a base64 PNG, JPEG or WebP data URI), a `url(` not
 * pointing to `#…`, `@import`, an animation targeting `href`, or a backslash (CSS escapes).
 *
 * Matching is case-insensitive and is run on several views of the text, so whitespace,
 * entity-encoded characters (`&#…;`) and comments placed to dodge the scan don't help:
 * comments removed and comments replaced by a space, entities decoded (repeatedly), and
 * each of those with all whitespace removed. The scan errs on refusing.
 */

/** The decoded text of `bytes` when they are valid UTF-8 (a leading BOM is dropped), else null. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Whether `bytes` are a valid UTF-8 SVG that passes `isSafeSvg`. */
export function isSafeSvgBytes(bytes: Uint8Array): boolean {
  return scanSvgBytes(bytes) === "ok";
}

const PREDEFINED_ENTITIES: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

/** Decodes numeric (`&#106;`, `&#x6a;`, with or without `;`) and the five XML entities, once. */
function decodeEntitiesOnce(text: string): string {
  return text.replace(/&#(x[0-9a-f]+|[0-9]+);?|&(lt|gt|amp|quot|apos);/gi, (match, numeric?: string, named?: string) => {
    if (named !== undefined) return PREDEFINED_ENTITIES[named.toLowerCase()];
    const code = numeric!.toLowerCase().startsWith("x") ? parseInt(numeric!.slice(1), 16) : parseInt(numeric!, 10);
    // An out-of-range code point can't be a real character: keep a marker that fails no check by itself.
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
  });
}

/** Decodes entities until nothing changes (bounded), so double encoding can't hide a keyword. */
function decodeEntities(text: string): string {
  let current = text;
  for (let i = 0; i < 5; i++) {
    const next = decodeEntitiesOnce(current);
    if (next === current) return next;
    current = next;
  }
  return current;
}

/** Whether a code point is whitespace or an invisible/control character a URL or a tag may hide between letters. */
function isSpaceLike(code: number): boolean {
  return (
    code <= 0x20 ||
    (code >= 0x7f && code <= 0xa0) ||
    code === 0xad ||
    (code >= 0x2000 && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x2060 ||
    code === 0x3000 ||
    code === 0xfeff ||
    code === 0x1680
  );
}

/** `text` without any whitespace or invisible/control character. */
function removeSpaces(text: string): string {
  let out = "";
  for (const ch of text) if (!isSpaceLike(ch.codePointAt(0)!)) out += ch;
  return out;
}

const FORBIDDEN_ELEMENT = /<\/?([\w.-]+:)?(script|foreignobject|iframe|embed|object)(?![\w.-])/;
/** An attribute name starting with `on` (optionally prefixed), after a tag name, a quote, a slash or whitespace. */
const EVENT_ATTRIBUTE = /[\s"'/]([\w.-]+:)?on[\w.:-]*\s*=/;
const HREF_ATTRIBUTE = /href\s*=/g;
const URL_FUNCTION = /url\s*\(/g;
const ANIMATED_HREF = /attributename\s*=\s*["']?\s*([\w.-]+:)?href/;
/** CSS functions that can fetch a bare string without `url(` (`-webkit-image-set(` included); checked on the compact view. */
const FETCHING_CSS_FUNCTION = /(image-set|cross-fade|src)\(/;

/** The index of the first character at or after `from` that is not space-like (`view.length` when none). */
function skipSpaces(view: string, from: number): number {
  let at = from;
  while (at < view.length && isSpaceLike(view.charCodeAt(at))) at++;
  return at;
}

/** Whether the value right after `href=` (at `from`) is a quoted value starting with `#` (spaces ignored). */
function hrefIsInternal(view: string, from: number): boolean {
  const open = skipSpaces(view, from);
  const quote = view[open];
  if (quote !== '"' && quote !== "'") return false;
  return view[skipSpaces(view, open + 1)] === "#";
}

/** Whether the argument right after `url(` (at `from`) starts with `#`, optionally quoted (spaces ignored). */
function urlIsInternal(view: string, from: number): boolean {
  let at = skipSpaces(view, from);
  if (view[at] === '"' || view[at] === "'") at = skipSpaces(view, at + 1);
  return view[at] === "#";
}

/** A base64 PNG, JPEG or WebP data URI (spaces already removed; the view is lowercase). */
const RASTER_DATA_URI = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]*={0,2}$/;
const QUOTED_HREF = /href\s*=\s*(["'])([^"']*)\1/g;
const IMAGE_TAG = /^<([\w.-]+:)?image[\s/]/;

/**
 * `view` with each `<image>` href holding a base64 PNG, JPEG or WebP data URI replaced by
 * `#`, so the href rule passes it and its base64 can't trip the other checks. Any other
 * `data:` (svg+xml, text/html …), and a raster data URI on any element but `<image>`, stays.
 */
function maskImageData(view: string): string {
  return view.replace(QUOTED_HREF, (match, quote: string, value: string, index: number) => {
    if (!RASTER_DATA_URI.test(removeSpaces(value))) return match;
    const open = view.lastIndexOf("<", index);
    if (open < 0 || view.slice(open, index).includes(">") || !IMAGE_TAG.test(view.slice(open, open + 64))) return match;
    return `href=${quote}#${quote}`;
  });
}

/** The checks one view of the text must pass (the view is lowercase). */
function viewIsSafe(unmasked: string): boolean {
  const view = maskImageData(unmasked);
  if (FORBIDDEN_ELEMENT.test(view)) return false;
  if (EVENT_ATTRIBUTE.test(view)) return false;
  if (ANIMATED_HREF.test(view)) return false;
  for (const match of view.matchAll(HREF_ATTRIBUTE)) {
    if (!hrefIsInternal(view, match.index + match[0].length)) return false;
  }
  for (const match of view.matchAll(URL_FUNCTION)) {
    if (!urlIsInternal(view, match.index + match[0].length)) return false;
  }
  const compact = removeSpaces(view);
  if (FORBIDDEN_ELEMENT.test(compact)) return false;
  if (compact.includes("javascript:")) return false;
  if (compact.includes("@import")) return false;
  if (FETCHING_CSS_FUNCTION.test(compact)) return false;
  if (compact.includes("<!doctype") || compact.includes("<!entity")) return false;
  return true;
}

/** Removes every `<!-- … -->` (replaced by `by`); null when a comment is never closed. */
function stripComments(text: string, by: string): string | null {
  let out = "";
  let at = 0;
  for (;;) {
    const open = text.indexOf("<!--", at);
    if (open < 0) return out + text.slice(at);
    const close = text.indexOf("-->", open + 4);
    if (close < 0) return null;
    out += text.slice(at, open) + by;
    at = close + 3;
  }
}

/** A real XML declaration: `<?xml` followed by whitespace or `?>` (never `<?xml-stylesheet`). */
const XML_DECLARATION = /^<\?xml(?=[\s?])[\s\S]*?\?>/i;
/** One comment, then whitespace, at the very end of the text. */
const TRAILING_COMMENT = /<!--(?:(?!-->)[\s\S])*-->\s*$/;

/**
 * Whether `text` has an `<svg` root and ends with `</svg>`. Before the root may come an XML
 * declaration, comments, processing instructions and a DOCTYPE (the safety checks then
 * judge those); after `</svg>` only comments and whitespace.
 */
function hasSvgRoot(text: string): boolean {
  let rest = text.replace(/^\ufeff/, "");
  const declaration = XML_DECLARATION.exec(rest);
  if (declaration !== null) rest = rest.slice(declaration[0].length);
  for (;;) {
    rest = rest.replace(/^\s+/, "");
    const close = rest.startsWith("<!--") ? rest.indexOf("-->", 4) + 3 : rest.startsWith("<?") ? rest.indexOf("?>", 2) + 2 : -1;
    if (close === 1 || close === 2) return false;
    if (close > 0) {
      rest = rest.slice(close);
      continue;
    }
    const doctype = /^<!doctype[^[>]*(\[[\s\S]*?\])?\s*>/i.exec(rest);
    if (doctype === null) break;
    rest = rest.slice(doctype[0].length);
  }
  if (!/^<svg[\s>/]/i.test(rest)) return false;
  let end = rest.replace(/\s+$/, "");
  for (let trailing = TRAILING_COMMENT.exec(end); trailing !== null; trailing = TRAILING_COMMENT.exec(end)) {
    end = end.slice(0, trailing.index).replace(/\s+$/, "");
  }
  return /<\/svg\s*>$/i.test(end);
}

/**
 * The standard SVG 1.0 / 1.1 DOCTYPE (Illustrator exports, owner 2026-10-19): public id
 * and a w3.org system id, no internal subset (no `[`), so it can declare no entity.
 */
const STANDARD_DOCTYPE =
  /<!doctype\s+svg\s+public\s+(["'])-\/\/w3c\/\/dtd svg 1\.[01]\/\/en\1\s+(["'])http:\/\/www\.w3\.org\/[^"'<>[\]&]*\2\s*>/i;

/** `text` without one standard DOCTYPE placed before the root `<svg`; any other DOCTYPE stays (and is refused). */
function withoutStandardDoctype(text: string): string {
  const match = STANDARD_DOCTYPE.exec(text);
  if (match === null) return text;
  const root = text.search(/<svg[\s>/]/i);
  if (root >= 0 && match.index > root) return text;
  return text.slice(0, match.index) + text.slice(match.index + match[0].length);
}

/**
 * The scan's verdict: `ok`, `invalid` (not an SVG at all: bad UTF-8, a NUL, no `<svg`
 * root or no closing `</svg>`) or `unsafe` (an SVG that fails a safety check).
 */
export type SvgScan = "ok" | "invalid" | "unsafe";

/** The verdict on `text`, an SVG file decoded as UTF-8. */
export function scanSvg(input: string): SvgScan {
  if (input.includes("\u0000")) return "invalid";
  const text = withoutStandardDoctype(input);
  if (!hasSvgRoot(text)) return "invalid";
  return isSafeSvgText(text) ? "ok" : "unsafe";
}

/** The verdict on `bytes`: `invalid` when they are not valid UTF-8, else `scanSvg`. */
export function scanSvgBytes(bytes: Uint8Array): SvgScan {
  const text = decodeUtf8(bytes);
  return text === null ? "invalid" : scanSvg(text);
}

/** Whether `text` (an SVG file decoded as UTF-8) is safe to accept as a logo, as is. */
export function isSafeSvg(text: string): boolean {
  return scanSvg(text) === "ok";
}

/** The safety checks, on an SVG-rooted text whose standard DOCTYPE (if any) is already removed. */
function isSafeSvgText(text: string): boolean {
  if (text.includes("\\")) return false;

  // Only the leading XML declaration may be a processing instruction (no `<?xml-stylesheet`).
  const withoutDeclaration = text.replace(/^\ufeff?\s*/, "").replace(XML_DECLARATION, "");
  if (withoutDeclaration.includes("<?")) return false;

  const removed = stripComments(text, "");
  const spaced = stripComments(text, " ");
  if (removed === null || spaced === null) return false;

  for (const base of [removed, spaced]) {
    // Any declaration but CDATA (DOCTYPE, ENTITY, ATTLIST, ELEMENT …) is refused.
    if (/<!(?!\[cdata\[)/i.test(base)) return false;
    // A named entity other than the five XML ones can't come from a DOCTYPE-free file: refuse it.
    if (/&(?!(lt|gt|amp|quot|apos);)[a-z][\w.-]*;/i.test(base)) return false;
    const lower = base.toLowerCase();
    if (!viewIsSafe(lower)) return false;
    if (!viewIsSafe(decodeEntities(base).toLowerCase())) return false;
  }
  return true;
}
