import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Inter (SIL OFL 1.1, `@fontsource-variable/inter`, pinned) as `@font-face` rules with the
 * woff2 files inline, so an export uses the preview's font: the worker's Chromium has no
 * Inter installed. Variable weight (100–900), normal style; Latin and Latin Extended.
 * The family is `Inter`, as the templates' stylesheet names it.
 */
const FILES = [
  {
    file: "inter-latin-wght-normal.woff2",
    range:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  },
  {
    file: "inter-latin-ext-wght-normal.woff2",
    range:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  },
] as const;

let memo: Promise<string> | undefined;

/**
 * Resolved from the working directory's `node_modules` (the repo in tests, `/app` in the
 * image, where the Dockerfile copies the package): the worker bundle has no module URL.
 */
async function read(file: string): Promise<Buffer> {
  const require = createRequire(join(process.cwd(), "package.json"));
  return readFile(require.resolve(`@fontsource-variable/inter/files/${file}`));
}

/** The `@font-face` CSS, read once per process. A failed read is not cached. */
export function interFontCss(): Promise<string> {
  memo ??= Promise.all(
    FILES.map(
      async ({ file, range }) =>
        `@font-face{font-family:Inter;font-style:normal;font-display:block;font-weight:100 900;src:url(data:font/woff2;base64,${(await read(file)).toString("base64")}) format("woff2");unicode-range:${range}}`,
    ),
  )
    .then((rules) => rules.join("\n"))
    .catch((error: unknown) => {
      memo = undefined;
      throw error;
    });
  return memo;
}
