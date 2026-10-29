import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_IN_WEB, forbiddenImports, reachedSources, sourceFiles } from "./helpers/web-imports";

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

describe("worker-only module entries (Story 3.2)", () => {
  /** A module's worker entry and the adapters only it uses (sharp, ffmpeg; Story 3.6: Anthropic, document text). */
  const WORKER_ONLY = /^src\/modules\/[^/]+\/(worker\.ts$|adapters\/(sharp|ffmpeg|anthropic|documents)\/)/;

  it("no web entry reaches src/modules/*/worker.ts or the sharp/ffmpeg adapters", async () => {
    const reached = await reachedSources(root, webEntries());
    expect(reached).toContain("src/modules/material/index.ts");
    // Story 3.3: the document schema and the format registry are pure and safe for web code.
    expect(reached).toContain("src/modules/generation/index.ts");
    expect(reached).toContain("src/modules/rendering/index.ts");
    expect(reached.filter((file) => WORKER_ONLY.test(file))).toEqual([]);
  });

  it("the worker entry does reach them, with sharp and child_process (positive control)", async () => {
    const entry = [`${root}src/worker/index.ts`];
    const reached = await reachedSources(root, entry);
    expect(reached).toContain("src/modules/material/worker.ts");
    expect(reached).toContain("src/modules/material/adapters/sharp/image-processor.ts");
    expect(reached).toContain("src/modules/material/adapters/ffmpeg/video-processor.ts");
    const paths = (await forbiddenImports(root, entry)).map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["sharp", "node:child_process", "@anthropic-ai/sdk"]));
    // Story 3.6: the narrative generator and the document reader are reached from the worker only.
    expect(reached).toContain("src/modules/generation/worker.ts");
    expect(reached).toContain("src/modules/generation/adapters/anthropic/narrative-generator.ts");
    expect(reached).toContain("src/modules/generation/adapters/documents/document-reader.ts");
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
