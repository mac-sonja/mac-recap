/** The largest file an export inlines: a display rendition is far smaller. */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Downloads a signed rendition URL's bytes for an export (Story 5.3), in the worker, so
 * Chromium itself loads nothing. Throws on a non-2xx answer, an oversized body or an abort.
 */
export async function fetchBytes(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok) throw new Error(`rendition download failed: ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) throw new Error("rendition too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("rendition too large");
  return bytes;
}
