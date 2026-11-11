import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { GUARDRAIL_TAG, GUARDRAILS, TAGGED_FILES } from "./suite";

// Keeps `npm run test:guardrails` whole: every tagged test is in a file it runs, and every
// guardrail has a tagged test (test/guardrails/reporter.ts also fails a guardrail with no test).
// These checks run in `npm test` and, tagged `guardrail suite`, in `test:guardrails`.

const root = fileURLToPath(new URL("../..", import.meta.url));
const testFiles = (dir: string) =>
  readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.test\.tsx?$/.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"));

const TITLED = new Set(["it", "test", "describe"]);

/** The callee's root name: `it` for `it(…)`, `it.each(…)(…)`, `describe.skip(…)` and the like. */
function rootName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return rootName(node.expression);
  if (ts.isCallExpression(node)) return rootName(node.expression);
  return null;
}

/** The guardrails tagged in the titles of `it`, `test` and `describe` calls (comments and other strings don't count). */
function taggedGuardrailsOf(code: string): string[] {
  const sf = ts.createSourceFile("x.test.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && TITLED.has(rootName(node.expression) ?? "")) {
      const title = node.arguments[0];
      if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) {
        const guardrail = GUARDRAIL_TAG.exec(title.text)?.[1];
        if (guardrail !== undefined) found.push(guardrail);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const taggedGuardrails = (rel: string) => taggedGuardrailsOf(readFileSync(join(root, rel), "utf8"));

describe("guardrail suite (Story 5.8)", () => {
  it("runs every file with a tagged test (test/db/** runs with npm run test:db)", () => {
    const files = [...testFiles("src"), ...testFiles("test")].filter((rel) => !rel.startsWith("test/db/") && !rel.startsWith("test/guardrails/"));
    expect(files.filter((rel) => taggedGuardrails(rel).length > 0).sort()).toEqual([...TAGGED_FILES].sort());
  });

  it("tags each guardrail in at least one test title", () => {
    const files = [...TAGGED_FILES, ...testFiles("test/guardrails")];
    expect([...new Set(files.flatMap(taggedGuardrails))].sort()).toEqual([...GUARDRAILS].sort());
  });

  it("finds a tag in a title only, not in a comment", () => {
    expect(GUARDRAIL_TAG.test("NFR6 guardrail: x")).toBe(true);
    const sf = "// NFR1 guardrail in a comment\nit(\"plain\", () => {});\n";
    expect(sf.includes("NFR1 guardrail")).toBe(true);
    expect(taggedGuardrailsOf(sf)).toEqual([]);
    expect(taggedGuardrailsOf('it.each([1])("NFR7 guardrail: %s", () => {});\ndescribe(`NFR2 guardrail: y`, () => {});')).toEqual(["NFR7", "NFR2"]);
  });
});
