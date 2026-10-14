// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { acceptFor, normalizeContentType, uploadToS3, UploadError } from "./upload";

const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** A minimal XHR stub: records the request; the test drives progress and the outcome. */
class FakeXhr {
  method = "";
  url = "";
  body: FormData | null = null;
  status = 0;
  headers: Record<string, string> = {};
  aborted = false;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  finish(status: number) {
    this.status = status;
    this.onload?.();
  }
}

function start(signal?: AbortSignal) {
  const xhr = new FakeXhr();
  const onProgress = vi.fn();
  const file = new File(["hello"], "a.png", { type: "image/png" });
  const done = uploadToS3("https://bucket.s3/", { key: "cases/x", "Content-Type": "image/png", Policy: "p" }, file, onProgress, {
    signal,
    createXhr: () => xhr as unknown as XMLHttpRequest,
  });
  return { xhr, onProgress, file, done };
}

describe("uploadToS3", () => {
  it("POSTs every field first and the file last, without a Content-Type header", async () => {
    const { xhr, file, done } = start();
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("https://bucket.s3/");
    expect(xhr.headers).toEqual({});
    const entries = [...(xhr.body as FormData).entries()];
    expect(entries.map(([name]) => name)).toEqual(["key", "Content-Type", "Policy", "file"]);
    expect(entries[0][1]).toBe("cases/x");
    const sent = entries[3][1] as File;
    expect(sent.name).toBe(file.name);
    expect(sent.size).toBe(file.size);
    xhr.finish(204);
    await expect(done).resolves.toBeUndefined();
  });

  it("reports progress as whole percentages and 100 on success", async () => {
    const { xhr, onProgress, done } = start();
    xhr.progress(25, 100);
    xhr.progress(2, 3);
    xhr.finish(201);
    await done;
    expect(onProgress.mock.calls.map(([p]) => p)).toEqual([25, 67, 100]);
  });

  it("rejects on a non-2xx answer with its status", async () => {
    const { xhr, done } = start();
    xhr.finish(403);
    await expect(done).rejects.toMatchObject({ name: "UploadError", status: 403, aborted: false });
  });

  it("rejects on a network error", async () => {
    const { xhr, done } = start();
    xhr.onerror?.();
    await expect(done).rejects.toBeInstanceOf(UploadError);
  });

  it("aborts the request when the signal fires", async () => {
    const controller = new AbortController();
    const { xhr, done } = start(controller.signal);
    controller.abort();
    expect(xhr.aborted).toBe(true);
    await expect(done).rejects.toMatchObject({ aborted: true });
  });

  it("does not send when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { xhr, done } = start(controller.signal);
    expect(xhr.body).toBeNull();
    await expect(done).rejects.toMatchObject({ aborted: true });
  });
});

describe("normalizeContentType", () => {
  it.each([
    ["notes.md", "", "text/markdown"],
    ["notes.md", "text/x-markdown", "text/markdown"],
    ["notes.md", "text/plain", "text/markdown"],
    ["NOTES.MARKDOWN", "", "text/markdown"],
    ["photo.JPG", "image/jpg", "image/jpeg"],
    ["clip.mov", "", "video/quicktime"],
    ["brief.docx", "", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["key.png", "image/png", "image/png"],
    ["readme", "text/plain", "text/plain"],
    ["readme", "text/plain;charset=utf-8", "text/plain"],
  ])("%s reported as %j → %s", (name, type, expected) => {
    expect(normalizeContentType({ name, type }, ALLOWED)).toBe(expected);
  });

  it.each([
    ["archive.zip", "application/zip"],
    ["archive.zip", ""],
    ["image.gif", "image/gif"],
    ["noext", ""],
  ])("rejects %s (%j)", (name, type) => {
    expect(normalizeContentType({ name, type }, ALLOWED)).toBeNull();
  });

  it("only resolves to types in the allowlist it is given", () => {
    expect(normalizeContentType({ name: "a.md", type: "" }, ["text/plain"])).toBeNull();
  });
});

describe("acceptFor", () => {
  it("lists the allowed types and their extensions", () => {
    const accept = acceptFor(["text/markdown", "image/jpeg"]).split(",");
    expect(accept).toEqual(["text/markdown", "image/jpeg", ".jpg", ".jpeg", ".md", ".markdown"]);
  });
});
