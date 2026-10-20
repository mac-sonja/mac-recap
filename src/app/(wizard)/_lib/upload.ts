/**
 * Browser-side helpers for the Material step's direct uploads to Supabase Storage
 * (Stories 2.7, 2.11). Client code: it imports nothing from `@/modules/*`; the
 * allowlist comes in as data.
 */

/** Thrown by `uploadFile` when the request fails, is aborted, or storage answers non-2xx. */
export class UploadError extends Error {
  constructor(
    message: string,
    /** The HTTP status, or `0` for a network error or an abort. */
    readonly status: number,
    readonly aborted = false,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Builds the XHR; injectable so tests can pass a stub. */
export type XhrFactory = () => XMLHttpRequest;

/** Where and how to send one file: the signed upload issued by `presignAssetUpload`. */
export interface SignedUpload {
  url: string;
  method: "PUT";
  headers: Readonly<Record<string, string>>;
}

/**
 * Sends `file` as the raw request body to a signed upload: `target.method` to
 * `target.url` with every entry of `target.headers` (they fix the content type
 * and forbid overwriting). `onProgress` gets 0–100 as bytes go out. Resolves on
 * any 2xx; rejects with `UploadError` otherwise (storage refuses a file over the
 * bucket's size limit or of a type outside its list with a 4xx).
 */
export function uploadFile(
  target: SignedUpload,
  file: Blob,
  onProgress: (percent: number) => void,
  { signal, createXhr = () => new XMLHttpRequest() }: { signal?: AbortSignal; createXhr?: XhrFactory } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError("Upload aborted.", 0, true));
      return;
    }

    const xhr = createXhr();
    const onAbort = () => xhr.abort();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new UploadError(`Storage answered ${xhr.status}.`, xhr.status));
      }
    };
    xhr.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new UploadError("Network error.", 0));
    };
    xhr.onabort = () => {
      signal?.removeEventListener("abort", onAbort);
      reject(new UploadError("Upload aborted.", 0, true));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(file);
  });
}

/** File extension → canonical content type, for files the browser types as `""` or an alias. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  mov: "video/quicktime",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * The content type to declare for `file`, or `null` when it isn't in `allowed`.
 * When the file's extension names an allowed type, that type wins: browsers report
 * `""`, `text/x-markdown` or `text/plain` for `.md`, and `image/jpg` for `.jpg`.
 * Otherwise the browser's type is used if it is allowed as is.
 */
export function normalizeContentType(file: Pick<File, "name" | "type">, allowed: readonly string[]): string | null {
  const byExtension = TYPE_BY_EXTENSION[extensionOf(file.name)];
  if (byExtension !== undefined && allowed.includes(byExtension)) return byExtension;
  const reported = file.type.toLowerCase().split(";")[0].trim();
  return allowed.includes(reported) ? reported : null;
}

/** The `accept` value for the file input: the allowed types plus their extensions. */
export function acceptFor(allowed: readonly string[]): string {
  const extensions = Object.entries(TYPE_BY_EXTENSION)
    .filter(([, type]) => allowed.includes(type))
    .map(([ext]) => `.${ext}`);
  return [...allowed, ...extensions].join(",");
}
