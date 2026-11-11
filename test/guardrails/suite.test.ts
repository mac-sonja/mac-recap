import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUARDRAIL_TAG, GUARDRAILS, TAGGED_FILES } from "./suite";

// Keeps `npm run test:guardrails` whole: every tagged test is in a file it runs, and every
// guardrail has its own file here (test/guardrails/reporter.ts fails a guardrail with no test).

const root = fileURLToPath(new URL("../..", import.meta.url));
const testFiles = (dir: string) =>
  readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.test\.tsx?$/.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"));
const tagged = (rel: string) => new RegExp(GUARDRAIL_TAG.source, "g").test(readFileSync(join(root, rel), "utf8"));

describe("the guardrail suite (Story 5.8)", () => {
  it("runs every file with a tagged test (test/db/** runs with npm run test:db)", () => {
    const files = [...testFiles("src"), ...testFiles("test")].filter((rel) => !rel.startsWith("test/db/") && !rel.startsWith("test/guardrails/"));
    expect(files.filter(tagged).sort()).toEqual([...TAGGED_FILES].sort());
  });

  it("tags each guardrail in at least one test of its own", () => {
    const files = [...TAGGED_FILES, ...testFiles("test/guardrails")];
    const found = new Set(files.flatMap((rel) => [...readFileSync(join(root, rel), "utf8").matchAll(new RegExp(GUARDRAIL_TAG.source, "g"))].map((m) => m[1])));
    expect([...found].sort()).toEqual([...GUARDRAILS].sort());
  });
});
