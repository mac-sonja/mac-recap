import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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

/** The keys of the object schema at `schema.properties[key]`. */
const keysOf = (schema: { properties?: Record<string, { properties?: Record<string, unknown> }> }, key: string) =>
  Object.keys(schema.properties?.[key]?.properties ?? {}).sort();

/** Each text the AI fills: the words, which side they cover, and what they cite (a source's kind and id). */
const TEXT_FIELDS = ["aspect", "sourceRefs", "text"];
const REF_FIELDS = ["id", "kind"];

/** The case narrative's texts per format: exactly what the default pages show. A new field must be added here on purpose. */
const NARRATIVE_TEXTS: Record<string, string[]> = {
  presentazione_16_9: ["title", "subtitle", "challengeHead", "challengeBody", "ideaHead", "ideaBody", "outputHead", "outputBody"],
  carosello_1_1: ["title", "subtitle", "challengeHead", "challengeBody", "ideaHead", "ideaBody"],
  video_9_16: ["title", "subtitle"],
};
/** The client intro's four texts, the same in every format. */
const CLIENT_TEXTS = ["introHead", "introBody", "outroHead", "outroBody"];

describe("NFR1 guardrail: the AI's output is text only, never an asset, layout, template, slot or image", () => {
  it("the case narrative output schema has exactly the allowed fields: per format its texts, each text, aspect and cited sources", () => {
    const json = narrativeOutputSchema.toJSONSchema() as Parameters<typeof keysOf>[0];
    expect(Object.keys(json.properties ?? {}).sort()).toEqual(Object.keys(NARRATIVE_TEXTS).sort());
    for (const [format, texts] of Object.entries(NARRATIVE_TEXTS)) expect(keysOf(json, format), format).toEqual([...texts].sort());
    const allowed = new Set([...Object.keys(NARRATIVE_TEXTS), ...Object.values(NARRATIVE_TEXTS).flat(), ...TEXT_FIELDS, ...REF_FIELDS]);
    expect(new Set(propertyNames(json))).toEqual(allowed);
  });

  it("the client intro output schema has exactly the allowed fields: its four texts, each text, aspect and cited sources", () => {
    const json = clientIntroOutputSchema.toJSONSchema() as Parameters<typeof keysOf>[0];
    expect(Object.keys(json.properties ?? {}).sort()).toEqual([...CLIENT_TEXTS].sort());
    for (const key of CLIENT_TEXTS) expect(keysOf(json, key), key).toEqual(TEXT_FIELDS);
    expect(new Set(propertyNames(json))).toEqual(new Set([...CLIENT_TEXTS, ...TEXT_FIELDS, ...REF_FIELDS]));
  });
});

describe("NFR1 guardrail: only the upload flow writes an original", () => {
  /** Supabase Storage calls that put bytes into a bucket, or let a browser do it. */
  const WRITES = new Set(["upload", "update", "move", "copy", "createSignedUploadUrl", "uploadToSignedUrl"]);

  it("every Storage write in src is one of these five, in the storage adapters", () => {
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
