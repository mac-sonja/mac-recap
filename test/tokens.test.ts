import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

// Token names fixed by DESIGN.md.
const COLORS = [
  "surface",
  "surface-raised",
  "surface-control",
  "surface-selected",
  "border",
  "border-strong",
  "foreground-strong",
  "foreground",
  "foreground-muted",
  "primary",
  "primary-foreground",
  "accent",
  "info",
  "danger",
  "danger-foreground",
  "focus-ring",
  "status-draft",
  "status-generating",
  "status-review",
  "status-approved",
];
const FONTS = ["display", "heading", "body", "label", "mono"];
const RADII = ["sm", "md", "lg", "full"];

const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

describe("theme tokens", () => {
  it.each([
    ...COLORS.map((n) => `--color-${n}`),
    ...FONTS.map((n) => `--font-${n}`),
    ...RADII.map((n) => `--radius-${n}`),
  ])("%s is defined in @theme", (name) => {
    expect(themeBlock).toMatch(new RegExp(`^\\s*${name}\\s*:\\s*[^;\\s]`, "m"));
  });

  it.each(["--color-*", "--font-*", "--radius-*"])("clears Tailwind's default %s", (ns) => {
    expect(themeBlock).toContain(`${ns}: initial;`);
  });

  it("focus-visible uses the focus-ring token", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*var\(--color-focus-ring\)/);
  });

  it("form fields show focus as white with a grey hairline and a lime halo, not the outline", () => {
    const rule = css.match(/:is\(\s*input:not\(([^)]*)\),\s*textarea,\s*select\s*\):focus-visible\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const [, excluded, body] = rule!;
    // Buttons and choice controls keep the outline ring.
    for (const type of ["checkbox", "radio", "file", "button", "submit"]) expect(excluded).toContain(`[type="${type}"]`);
    expect(body).toMatch(/outline:\s*1px solid transparent;/);
    expect(body).toMatch(/outline-offset:\s*0;/);
    expect(body).toMatch(/border-color:\s*var\(--color-border-strong\);/);
    expect(body).toMatch(/background-color:\s*var\(--color-surface-raised\);/);
    expect(body).toMatch(/box-shadow:\s*0 0 0 4px var\(--color-primary-tint\);/);
    // Unlayered, so field utilities such as `border-transparent` can't hide it.
    expect(css.indexOf(rule![0])).toBeGreaterThan(css.lastIndexOf("@layer base"));
    expect(css.slice(css.indexOf("@layer base"), css.indexOf(rule![0]))).toMatch(/\n\}\n/);
  });

  it("respects prefers-reduced-motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/;
const FONT_STACK = /\b(?:sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-monospace|font-family|fontFamily)\b|font-\[/;

describe("components read tokens only", () => {
  const files = tsxFiles(join(root, "src/app"));

  it("finds the app components", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [relative(root, f), f]))("%s has no raw colours or font stacks", (_, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(RAW_COLOR);
    expect(source).not.toMatch(FONT_STACK);
  });
});

describe("light and dark themes", () => {
  const darkExplicit = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  const darkSystem = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/)?.[1] ?? "";

  it("redefines the surfaces and text for a picked dark theme and for a dark system", () => {
    for (const block of [darkExplicit, darkSystem]) {
      for (const name of ["surface", "surface-raised", "foreground", "foreground-muted", "focus-ring"]) {
        expect(block).toMatch(new RegExp(`--color-${name}\\s*:`));
      }
    }
  });

  it("keeps the two dark blocks identical", () => {
    const norm = (block: string) => block.replace(/\s+/g, " ").trim();
    expect(norm(darkSystem)).toBe(norm(darkExplicit));
  });
});
