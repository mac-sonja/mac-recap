import { describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  extensionFor,
  isAllowedContentType,
  kindFor,
  MAX_ASSETS_PER_CASE,
  MAX_FILE_BYTES,
} from "./files";

describe("upload allowlist", () => {
  it("allows exactly JPEG, PNG, WebP, MP4, MOV, PDF, plain text, Markdown and DOCX", () => {
    expect([...ALLOWED_CONTENT_TYPES].sort()).toEqual(
      [
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].sort(),
    );
  });

  it.each([
    ["image/jpeg", "jpg", "image"],
    ["image/png", "png", "image"],
    ["image/webp", "webp", "image"],
    ["video/mp4", "mp4", "video"],
    ["video/quicktime", "mov", "video"],
    ["application/pdf", "pdf", "document"],
    ["text/plain", "txt", "text"],
    ["text/markdown", "md", "text"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", "document"],
  ] as const)("%s → .%s, %s", (type, ext, kind) => {
    expect(isAllowedContentType(type)).toBe(true);
    expect(extensionFor(type)).toBe(ext);
    expect(kindFor(type)).toBe(kind);
  });

  it.each(["application/zip", "image/gif", "IMAGE/PNG", "", "toString", "__proto__", undefined, 7])(
    "rejects %o",
    (type) => {
      expect(isAllowedContentType(type)).toBe(false);
    },
  );

  it("caps at 20 files of 50 MB", () => {
    expect(MAX_ASSETS_PER_CASE).toBe(20);
    expect(MAX_FILE_BYTES).toBe(52_428_800);
  });
});
