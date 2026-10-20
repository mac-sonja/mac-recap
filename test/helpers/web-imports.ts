import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";

/**
 * Static check for AD-10: web code never loads the worker-only packages (the
 * LLM SDK, Chromium via Playwright or Puppeteer, sharp) or spawns processes
 * or threads. esbuild bundles the given
 * entries with every package left external, so the metafile lists each
 * package and builtin our own code reaches, directly or through other source
 * files, statically or by dynamic import.
 */
export const FORBIDDEN_IN_WEB =
  /^(@anthropic-ai\/sdk(\/|$)|@playwright\/|playwright(-[a-z]+)?(\/|$)|puppeteer(-[a-z]+)?(\/|$)|sharp(\/|$)|(node:)?(child_process|worker_threads)(\/|$)|execa(\/|$)|cross-spawn(\/|$))/;

export interface ForbiddenImport {
  /** The source file (relative to the root) that imports it. */
  importer: string;
  /** The import as written. */
  path: string;
}

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const TEST = /\.test\.(ts|tsx|mts|cts|js|jsx)$/;

/** Every non-test source file under `dir`. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && SOURCE.test(entry.name) && !TEST.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

/** Our own source files reachable from `entryPoints` (relative to the root), sorted. */
export async function reachedSources(root: string, entryPoints: string[]): Promise<string[]> {
  const result = await bundle(root, entryPoints);
  return Object.keys(result.metafile.inputs)
    .map((file) => relative(root, join(root, file)))
    .sort();
}

function bundle(root: string, entryPoints: string[]) {
  return build({
    absWorkingDir: root,
    entryPoints,
    bundle: true,
    write: false,
    metafile: true,
    outdir: "out",
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
    // Stylesheets and assets carry no code.
    loader: { ".css": "empty", ".svg": "empty", ".png": "empty", ".ico": "empty" },
  });
}

/** The forbidden imports reachable from `entryPoints`, sorted by importer. */
export async function forbiddenImports(root: string, entryPoints: string[]): Promise<ForbiddenImport[]> {
  const result = await bundle(root, entryPoints);
  const found: ForbiddenImport[] = [];
  for (const [file, input] of Object.entries(result.metafile.inputs)) {
    for (const imp of input.imports) {
      if (imp.external && FORBIDDEN_IN_WEB.test(imp.original ?? imp.path)) {
        found.push({ importer: relative(root, join(root, file)), path: imp.original ?? imp.path });
      }
    }
  }
  return found.sort((a, b) => a.importer.localeCompare(b.importer) || a.path.localeCompare(b.path));
}
