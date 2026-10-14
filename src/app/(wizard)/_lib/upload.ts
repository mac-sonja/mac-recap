/**
 * Browser-side helpers for the Material step's direct-to-S3 uploads (Story 2.7).
 * Client code: it imports nothing from `@/modules/*`; the allowlist comes in as data.
 */

/** Thrown by `uploadToS3` when the POST fails, is aborted, or S3 answers non-2xx. */
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

/**
 * Posts `file` to a presigned S3 POST: every entry of `fields` first, the file
 * last (S3 ignores fields after `file`). No Content-Type header is set, so the
 * browser writes the multipart boundary. `onProgress` gets 0–100 as bytes go out.
 * Resolves on any 2xx (S3 answers 204); rejects with `UploadError` otherwise.
 */
export function uploadToS3(
  url: string,
  fields: Readonly<Record<string, string>>,
  file: Blob,
  onProgress: (percent: number) => void,
  { signal, createXhr = () => new XMLHttpRequest() }: { signal?: AbortSignal; createXhr?: XhrFactory } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError("Upload aborted.", 0, true));
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append("file", file);

    const xhr = createXhr();
    const onAbort = () => xhr.abort();
    xhr.open("POST", url);
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
        reject(new UploadError(`S3 answered ${xhr.status}.`, xhr.status));
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
    xhr.send(form);
  });
}

/** File extension → canonical content type, for files the browser types as `""` or an alias. */
const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
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
