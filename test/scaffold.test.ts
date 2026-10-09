import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8")) as Record<string, Record<string, string>>;
const MODULES = ["case-study", "material", "generation", "rendering", "sharing", "access", "jobs"];

const isDir = (p: string) => existsSync(`${root}${p}`) && statSync(`${root}${p}`).isDirectory();

describe("package.json", () => {
  const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
  const specs = sections.flatMap((s) => Object.entries(pkg[s] ?? {}).map(([name, spec]) => ({ name, spec })));

  it("pins every dependency to an exact version", () => {
    expect(specs.length).toBeGreaterThan(0);
    const loose = specs.filter(({ spec }) => !/^\d+\.\d+\.\d+$/.test(spec));
    expect(loose).toEqual([]);
  });

  it("requires Node 24", () => {
    expect(pkg.engines.node).toBe(">=24 <25");
  });

  it("has no MCP client dependency", () => {
    expect(specs.filter(({ name }) => name.includes("modelcontextprotocol") || /\bmcp\b/i.test(name))).toEqual([]);
  });
});

describe("source layout", () => {
  it("has app, worker and shared", () => {
    for (const dir of ["src/app", "src/worker", "src/shared"]) expect(isDir(dir), dir).toBe(true);
  });

  it.each(MODULES)("module %s has domain/, application/ and index.ts", (m) => {
    expect(isDir(`src/modules/${m}/domain`)).toBe(true);
    expect(isDir(`src/modules/${m}/application`)).toBe(true);
    expect(existsSync(`${root}src/modules/${m}/index.ts`)).toBe(true);
  });

  it("has no integration module", () => {
    expect(existsSync(`${root}src/modules/integration`)).toBe(false);
  });
});
