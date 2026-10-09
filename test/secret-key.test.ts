import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const KEY_NAME = "SUPABASE_SECRET_KEY";

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
}

/**
 * env.ts and any module's adapters/ may name the secret key (AD-11), plus the
 * env tests that stub it (env.ts itself, the startup check in instrumentation and the proxy gate).
 */
const ENV_TESTS = new Set(["src/shared/env.test.ts", "src/instrumentation.test.ts", "src/proxy.test.ts"]);
const allowed = (rel: string) =>
  rel === "src/shared/env.ts" || ENV_TESTS.has(rel) || /^src\/modules\/[^/]+\/adapters\//.test(rel);

describe("the Supabase secret key stays on the server (AD-11)", () => {
  it(`${KEY_NAME} is referenced only in src/shared/env.ts and module adapters`, () => {
    const offenders = files(`${root}src`)
      .map((abs) => relative(root, abs).split(sep).join("/"))
      .filter((rel) => readFileSync(`${root}${rel}`, "utf8").includes(KEY_NAME))
      .filter((rel) => !allowed(rel));
    expect(offenders).toEqual([]);
  });

  const staticDir = `${root}.next/static`;
  const built = existsSync(staticDir);
  if (!built) console.warn(`[secret-key.test] skipped the client bundle check: no ${staticDir} (run npm run build).`);

  it.skipIf(!built)("no client bundle names the key or queries a table", () => {
    const tableQuery = /\.from\(\s*["'`][a-z_]+["'`]\s*\)\s*\.(select|insert|update|upsert|delete)\(/;
    const offenders = files(staticDir)
      .filter((abs) => /\.(js|mjs|cjs|map|json|html)$/.test(abs))
      .filter((abs) => {
        const text = readFileSync(abs, "utf8");
        return text.includes(KEY_NAME) || tableQuery.test(text);
      })
      .map((abs) => relative(root, abs));
    expect(offenders).toEqual([]);
  });
});
