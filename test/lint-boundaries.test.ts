import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: root });
});

/** Lints in-memory code as if it lived at `filePath`; returns the rule ids reported. */
async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

describe("module boundaries (I/O matrix)", () => {
  it("app importing module internals fails", async () => {
    expect(await ruleIds("src/app/x.ts", `import "@/modules/material/domain/files";\n`)).toContain(
      "no-restricted-imports",
    );
  });

  it("app reaching module internals by relative path fails", async () => {
    expect(await ruleIds("src/app/x.ts", `import "../modules/material/domain/files";\n`)).toContain(
      "no-restricted-imports",
    );
  });

  it("worker importing module internals fails", async () => {
    expect(await ruleIds("src/worker/x.ts", `import "@/modules/jobs/application/claim";\n`)).toContain(
      "no-restricted-imports",
    );
  });

  it("a module importing another module's internals fails", async () => {
    expect(
      await ruleIds(
        "src/modules/generation/application/a.ts",
        `import "@/modules/material/application/resolve-refs";\n`,
      ),
    ).toContain("no-restricted-imports");
  });

  it("a module importing another module's internals by relative path fails", async () => {
    expect(
      await ruleIds("src/modules/generation/application/a.ts", `import "../../material/application/x";\n`),
    ).toContain("no-restricted-imports");
  });

  it("a module importing its own internals through the alias passes", async () => {
    expect(
      await ruleIds("src/modules/material/application/a.ts", `import "@/modules/material/domain/files";\n`),
    ).toEqual([]);
  });

  it("a module importing another module's index passes", async () => {
    expect(await ruleIds("src/modules/generation/application/a.ts", `import "@/modules/material";\n`)).toEqual([]);
  });

  it.each([
    "@supabase/supabase-js",
    "@supabase/ssr",
    "@aws-sdk/client-s3",
    "@anthropic-ai/sdk",
    "playwright",
    "@playwright/test",
    "sharp",
  ])(
    "vendor SDK %s outside adapters fails",
    async (pkg) => {
      expect(await ruleIds("src/modules/case-study/application/a.ts", `import "${pkg}";\n`)).toContain(
        "no-restricted-imports",
      );
      expect(await ruleIds("src/app/x.ts", `import "${pkg}";\n`)).toContain("no-restricted-imports");
    },
  );

  it("vendor SDK inside adapters passes", async () => {
    expect(
      await ruleIds("src/modules/case-study/adapters/supabase/a.ts", `import "@supabase/supabase-js";\n`),
    ).toEqual([]);
  });

  describe("domain purity", () => {
    it.each([
      ["another module's index", "@/modules/material"],
      ["another module's internals", "@/modules/material/domain/files"],
      ["its own application/", "@/modules/x/application/a"],
      ["a package other than zod", "@supabase/supabase-js"],
      ["a node builtin", "node:fs"],
      ["generated db types", "@/shared/db.types"],
      ["a relative path outside domain/", "../application/a"],
      ["a `./../` path outside domain/", "./../application/a"],
    ])("domain importing %s fails", async (_label, spec) => {
      expect(await ruleIds("src/modules/x/domain/a.ts", `import "${spec}";\n`)).toContain("no-restricted-imports");
    });

    it("a known module's domain importing its own application fails", async () => {
      expect(
        await ruleIds("src/modules/material/domain/a.ts", `import "@/modules/material/application/a";\n`),
      ).toContain("no-restricted-imports");
    });

    it.each([
      ["@/shared/*", "@/shared/result"],
      ["a same-domain file", "./b"],
      ["zod", "zod"],
    ])("domain importing %s passes", async (_label, spec) => {
      expect(await ruleIds("src/modules/x/domain/a.ts", `import "${spec}";\n`)).toEqual([]);
    });

    it("a domain test file importing vitest passes", async () => {
      expect(await ruleIds("src/modules/access/domain/policy.test.ts", `import "vitest";\n`)).toEqual([]);
      expect(await ruleIds("src/modules/x/domain/a.test.ts", `import "vitest";\n`)).toEqual([]);
    });

    it("domain production code importing vitest fails", async () => {
      expect(await ruleIds("src/modules/access/domain/policy.ts", `import "vitest";\n`)).toContain(
        "no-restricted-imports",
      );
    });

    it("a domain test file is still pure apart from vitest", async () => {
      expect(
        await ruleIds("src/modules/access/domain/policy.test.ts", `import "@/modules/access/application/a";\n`),
      ).toContain("no-restricted-imports");
      expect(await ruleIds("src/modules/access/domain/policy.test.ts", `import "node:fs";\n`)).toContain(
        "no-restricted-imports",
      );
    });

    it("a known module's domain importing its own domain through the alias passes", async () => {
      expect(
        await ruleIds("src/modules/material/domain/a.ts", `import "@/modules/material/domain/files";\n`),
      ).toEqual([]);
    });
  });

  it.each([
    ["./../../material/application/x", "src/modules/generation/application/a.ts"],
    ["./../domain/x", "src/modules/material/application/a.ts"],
    ["@/modules/material/domain/../application/x", "src/modules/material/application/a.ts"],
  ])("a `..` segment %s inside src/modules fails", async (spec, file) => {
    expect(await ruleIds(file, `import "${spec}";\n`)).toContain("no-restricted-imports");
  });

  it.each([
    ["src/app/x.ts", "@/shared/../modules/material/domain/x"],
    ["src/app/x.ts", "./../modules/material/domain/x"],
    ["src/worker/x.ts", "@/shared/../app/page"],
    ["src/shared/x.ts", "@/shared/../app/page"],
  ])("alias or relative traversal from %s to %s fails", async (file, spec) => {
    expect(await ruleIds(file, `import "${spec}";\n`)).toContain("no-restricted-imports");
  });

  describe("adapters", () => {
    it("a known module's adapter importing another module's internals fails", async () => {
      expect(
        await ruleIds("src/modules/material/adapters/s3/a.ts", `import "@/modules/case-study/domain/x";\n`),
      ).toContain("no-restricted-imports");
    });

    it("a known module's adapter importing its own internals passes", async () => {
      expect(
        await ruleIds("src/modules/material/adapters/s3/a.ts", `import "@/modules/material/domain/files";\n`),
      ).toEqual([]);
    });
  });

  describe("shared", () => {
    it.each(["@/modules/material", "@/app/page", "@/worker", "../app/page", "../modules/material"])(
      "shared importing %s fails",
      async (spec) => {
        expect(await ruleIds("src/shared/x.ts", `import "${spec}";\n`)).toContain("no-restricted-imports");
      },
    );

    it("shared importing a ./ sibling passes", async () => {
      expect(await ruleIds("src/shared/x.ts", `import "./result";\n`)).toEqual([]);
    });
  });

  it("any other file under src/ gets the outside-module rules", async () => {
    expect(await ruleIds("src/lib/x.ts", `import "@supabase/ssr";\n`)).toContain("no-restricted-imports");
    expect(await ruleIds("src/lib/x.ts", `import "@/modules/material/domain/x";\n`)).toContain(
      "no-restricted-imports",
    );
  });

  describe("dynamic import() and require()", () => {
    it.each([
      ["src/app/x.ts", `export const m = import("@/modules/material/domain/x");`],
      ["src/app/x.ts", `export const m = import("@supabase/ssr");`],
      ["src/app/x.ts", `export const m = require("@supabase/ssr");`],
      ["src/app/x.ts", `export const m = require("@/modules/material/domain/x");`],
      ["src/modules/case-study/application/a.ts", `export const m = import("@aws-sdk/client-s3");`],
      ["src/modules/x/domain/a.ts", `export const m = import("node:fs");`],
      ["src/lib/x.ts", `export const m = import("@supabase/ssr");`],
    ])("%s: %s fails", async (file, code) => {
      expect(await ruleIds(file, `${code}\n`)).toContain("no-restricted-syntax");
    });

    it("a dynamic import of a module index passes", async () => {
      expect(await ruleIds("src/app/x.ts", `export const m = import("@/modules/material");\n`)).toEqual([]);
    });
  });

  it("any file under src/modules/integration fails", async () => {
    expect(await ruleIds("src/modules/integration/index.ts", `export {};\n`)).toContain("no-restricted-syntax");
  });

  it("importing the integration module or an MCP client fails", async () => {
    expect(await ruleIds("src/app/x.ts", `import "@/modules/integration";\n`)).toContain("no-restricted-imports");
    expect(
      await ruleIds("src/modules/access/adapters/a.ts", `import "@modelcontextprotocol/sdk/client/index.js";\n`),
    ).toContain("no-restricted-imports");
  });

  it("app importing a module's index passes", async () => {
    expect(await ruleIds("src/app/x.ts", `import "@/modules/material";\n`)).toEqual([]);
  });

  it.each([
    "export const a = process.env.FOO;",
    'export const a = process["env"].FOO;',
    "const { env } = process; export const a = env.FOO;",
    "export const a = globalThis.process.env.FOO;",
    'export const a = globalThis.process["env"].FOO;',
    "const { env } = globalThis.process; export const a = env.FOO;",
  ])("reading process.env outside src/shared/env.ts fails: %s", async (code) => {
    expect(await ruleIds("src/app/x.ts", `${code}\n`)).toContain("no-restricted-syntax");
    expect(await ruleIds("src/lib/x.ts", `${code}\n`)).toContain("no-restricted-syntax");
  });

  it("reading process.env in src/shared/env.ts passes", async () => {
    expect(await ruleIds("src/shared/env.ts", `export const a = process.env.FOO;\n`)).toEqual([]);
  });
});
