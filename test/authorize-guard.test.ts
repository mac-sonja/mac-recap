import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkSource, checkTree } from "./helpers/authorize-guard";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtures = "test/fixtures/authorize-guard";

describe("every server action and route handler authorizes first (AD-11)", () => {
  it("holds for src/app", () => {
    expect(existsSync(`${root}src/app`)).toBe(true);
    const violations = checkTree(root, `${root}src/app`);
    expect(violations, violations.map((v) => `${v.file} › ${v.exportName}: ${v.reason}`).join("\n")).toEqual([]);
  });
});

describe("authorize guard fixtures", () => {
  it("passes compliant actions, route handlers and inline actions", () => {
    expect(checkTree(root, `${root}${fixtures}/pass`)).toEqual([]);
  });

  it("fails each non-compliant export, naming the file and the export", () => {
    const found = checkTree(root, `${root}${fixtures}/fail`).map(({ file, exportName }) => `${file} › ${exportName}`);
    expect(found.sort()).toEqual(
      [
        `${fixtures}/fail/actions.ts › missingAuthorize`,
        `${fixtures}/fail/actions.ts › useCaseFirst`,
        `${fixtures}/fail/actions.ts › nestedAuthorize`,
        `${fixtures}/fail/api/cases/route.ts › GET`,
        `${fixtures}/fail/page.tsx › create`,
      ].sort(),
    );
  });

  it("explains why an export fails", () => {
    const [v] = checkSource(
      "src/app/x/actions.ts",
      `"use server";\nimport { getCase } from "@/modules/case-study";\nimport { authorize } from "@/modules/access";\nexport async function a() { await getCase(); authorize(); }\n`,
    );
    expect(v.reason).toBe("calls getCase( from @/modules/case-study before authorize(");
  });

  it("does not accept an authorize imported from elsewhere", () => {
    const code = `"use server";\nimport { authorize } from "@/modules/case-study";\nexport async function a() { authorize(); }\n`;
    expect(checkSource("src/app/actions.ts", code)).toHaveLength(1);
  });

  it("rejects re-exports and non-literal handlers it cannot verify", () => {
    expect(checkSource("src/app/actions.ts", `"use server";\nexport { a } from "./impl";\n`)).toHaveLength(1);
    expect(
      checkSource("src/app/api/route.ts", `import { wrap } from "./wrap";\nexport const POST = wrap(() => 1);\n`),
    ).toHaveLength(1);
  });

  it("rejects a route re-exporting an HTTP method but not other names", () => {
    expect(checkSource("src/app/api/route.ts", `export { GET } from "./impl";\n`)).toHaveLength(1);
    expect(checkSource("src/app/api/route.ts", `export { config } from "./x";\n`)).toEqual([]);
  });

  it("fails a module call nested in authorize's own arguments", () => {
    const code = `"use server";
import { authorize, getActor } from "@/modules/access";
import { getCase } from "@/modules/case-study";
export async function a(id: string) {
  const actor = await getActor();
  if (!actor.ok) return;
  authorize(actor.value, "delete case", { status: (await getCase(id)).value.status });
}
`;
    const [v, ...rest] = checkSource("src/app/actions.ts", code);
    expect(rest).toEqual([]);
    expect(v.reason).toBe("calls getCase( from @/modules/case-study before authorize(");
  });

  it("skips overload signatures and checks the implementation", () => {
    const code = `"use server";
import { authorize } from "@/modules/access";
export async function a(x: string): Promise<void>;
export async function a(x: number): Promise<void>;
export async function a(x: unknown) { authorize(x); }
`;
    expect(checkSource("src/app/actions.ts", code)).toEqual([]);
  });

  it("ignores route config exports and modules without \"use server\"", () => {
    expect(checkSource("src/app/api/route.ts", `export const dynamic = "force-dynamic";\n`)).toEqual([]);
    expect(checkSource("src/app/lib.ts", `export async function helper() {}\n`)).toEqual([]);
  });
});
