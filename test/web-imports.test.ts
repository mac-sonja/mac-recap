import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_IN_WEB, forbiddenImports, sourceFiles } from "./helpers/web-imports";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtures = "test/fixtures/web-imports";

/** Web entries: everything under src/app, the proxy and the instrumentation hooks. */
const TOP_LEVEL_ENTRIES = ["src/proxy.ts", "src/instrumentation.ts", "src/instrumentation-node.ts"];

function webEntries(): string[] {
  return [...sourceFiles(`${root}src/app`), ...TOP_LEVEL_ENTRIES.map((f) => `${root}${f}`)];
}

describe("web code never imports worker-only packages (AD-10)", () => {
  it("holds for src/app, src/proxy.ts and src/instrumentation*.ts", async () => {
    for (const file of TOP_LEVEL_ENTRIES) expect(existsSync(`${root}${file}`), file).toBe(true);
    const entries = webEntries();
    expect(entries.filter((e) => e.includes("/src/app/")).length).toBeGreaterThan(10);
    const found = await forbiddenImports(root, entries);
    expect(found, found.map((f) => `${f.importer} imports ${f.path}`).join("\n")).toEqual([]);
  });
});

describe("web import check fixtures", () => {
  it("fails a web entry that reaches forbidden packages, statically or dynamically, through other files", async () => {
    const found = await forbiddenImports(root, sourceFiles(`${root}${fixtures}/fail`).filter((f) => f.endsWith("page.tsx")));
    expect(found).toEqual([
      { importer: `${fixtures}/fail/lib/helper.ts`, path: "@anthropic-ai/sdk" },
      { importer: `${fixtures}/fail/lib/helper.ts`, path: "node:child_process" },
      { importer: `${fixtures}/fail/lib/helper.ts`, path: "playwright" },
      { importer: `${fixtures}/fail/lib/helper.ts`, path: "sharp" },
    ]);
  });

  it("passes an entry with only allowed imports", async () => {
    expect(await forbiddenImports(root, sourceFiles(`${root}${fixtures}/pass`))).toEqual([]);
  });

  it.each(["@anthropic-ai/sdk", "playwright", "playwright-core", "playwright/test", "@playwright/test", "sharp", "child_process", "node:child_process", "worker_threads", "node:worker_threads", "execa", "cross-spawn", "puppeteer", "puppeteer-core"])(
    "forbids %s",
    (pkg) => expect(FORBIDDEN_IN_WEB.test(pkg)).toBe(true),
  );

  it.each(["@supabase/supabase-js", "zod", "sharpen", "node:fs", "@anthropic-ai/other", "execa-like"])("allows %s", (pkg) =>
    expect(FORBIDDEN_IN_WEB.test(pkg)).toBe(false),
  );
});
