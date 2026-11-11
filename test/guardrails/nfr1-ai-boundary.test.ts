import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { clientIntroOutputSchema } from "@/modules/generation/adapters/anthropic/client-intro-writer";
import { narrativeOutputSchema } from "@/modules/generation/adapters/anthropic/narrative-generator";

// NFR1: the AI never alters graphic assets, the technical substance or the template design.
// What the AI returns is text only (the output schemas below); originals are written only by
// the upload flow (the browser's PUT to a signed upload URL, then the confirm action); and the
// renditions only downscale (tagged "NFR1 guardrail" in the material module's own tests).

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const sources = () =>
  readdirSync(join(root, "src"), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();

/** Every property name anywhere in a JSON schema. */
function propertyNames(schema: unknown): string[] {
  if (Array.isArray(schema)) return schema.flatMap(propertyNames);
  if (schema === null || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const own = record.properties !== null && typeof record.properties === "object" ? Object.keys(record.properties) : [];
  return [...own, ...Object.values(record).flatMap(propertyNames)];
}

/** No field the AI fills may place, pick or shape a file or a page. */
const FORBIDDEN_FIELD = /asset|layout|template|slot|image/i;

describe("NFR1 guardrail: the AI's output is text only, never an asset, layout, template, slot or image", () => {
  it.each([
    ["case narrative", narrativeOutputSchema],
    ["client intro", clientIntroOutputSchema],
  ] as const)("the %s output schema has no asset, layout, template, slot or image field", (_, schema: z.ZodType) => {
    const names = propertyNames(schema.toJSONSchema());
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => FORBIDDEN_FIELD.test(name))).toEqual([]);
    // Each text's own fields: the words, which side they cover, and what they cite.
    for (const leaf of ["text", "aspect", "sourceRefs", "kind", "id"]) expect(names).toContain(leaf);
  });
});

describe("NFR1 guardrail: only the upload flow writes an original", () => {
  /** Supabase Storage calls that put bytes into a bucket, or let a browser do it. */
  const WRITES = new Set(["upload", "update", "move", "copy", "createSignedUploadUrl", "uploadToSignedUrl"]);

  it("every Storage write is one of these four, in the storage adapters", () => {
    const found = sources().flatMap((rel) =>
      [...read(rel).matchAll(/bucket\(\)\s*\.\s*(\w+)\s*\(|storage\s*\.\s*from\([^)]*\)\s*\.\s*(\w+)\s*\(/g)]
        .map((m) => m[1] ?? m[2])
        .filter((method) => WRITES.has(method))
        .map((method) => `${rel} › ${method}`),
    );
    expect([...new Set(found)].sort()).toEqual(
      [
        // A client's logo: the browser's PUT, then confirmClientLogoUpload.
        "src/modules/case-study/adapters/supabase/logo-storage.ts › createSignedUploadUrl",
        // A client's files: the browser's PUT, then confirmClientMaterialUpload.
        "src/modules/case-study/adapters/supabase/client-material-storage.ts › createSignedUploadUrl",
        // A case's files: the browser's PUT, then confirmAssetUpload.
        "src/modules/material/adapters/supabase/object-storage.ts › createSignedUploadUrl",
        // Rendition copies only (refused for any other key, below).
        "src/modules/material/adapters/supabase/object-storage.ts › upload",
        // Exported files, in the rendering bucket: never an original.
        "src/modules/rendering/adapters/supabase/export-storage.ts › upload",
      ].sort(),
    );
  });

  it("no other file opens a Storage bucket", () => {
    const openers = sources().filter((rel) => /\.storage\s*\.\s*from\(/.test(read(rel)));
    expect(openers).toEqual([
      "src/modules/case-study/adapters/supabase/client-material-storage.ts",
      "src/modules/case-study/adapters/supabase/logo-storage.ts",
      "src/modules/material/adapters/supabase/object-storage.ts",
      "src/modules/rendering/adapters/supabase/export-storage.ts",
    ]);
  });

  it("an upload URL is signed only by the three upload requests", () => {
    const callers = sources().filter((rel) => /\bstorage\.presignUpload\s*\(/.test(read(rel)));
    expect(callers).toEqual([
      "src/modules/case-study/application/request-client-logo-upload.ts",
      "src/modules/case-study/application/request-client-material-upload.ts",
      "src/modules/material/application/presign-upload.ts",
    ]);
  });

  it("the server's only material upload refuses every key but a rendition's before it writes", () => {
    const adapter = read("src/modules/material/adapters/supabase/object-storage.ts");
    const body = adapter.slice(adapter.indexOf("async upload("));
    const guard = body.indexOf("if (!RENDITION_KEY.test(key))");
    expect(guard).toBeGreaterThan(0);
    expect(body.indexOf("STORAGE_WRITE_REFUSED")).toBeGreaterThan(guard);
    expect(body.indexOf("bucket().upload(")).toBeGreaterThan(body.indexOf("STORAGE_WRITE_REFUSED"));
    expect(adapter).toMatch(/const RENDITION_KEY =\s*\n?\s*\/\^[^\n]*\\\/renditions\\\//);
  });
});
