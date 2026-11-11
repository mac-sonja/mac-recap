import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACTIONS, can } from "@/modules/access/domain/policy";
import { CASE_STATUSES } from "@/shared/case-status";
import { envSchema } from "@/shared/env";
import { listServerActionFiles } from "../helpers/authorize-guard";

// NFR3: no role can view or change the guardrails, admin included, and no setting anywhere
// disables or changes NFR1–NFR7. The matrix (src/modules/access/domain/policy.ts) is code;
// nothing reachable at run time names a guardrail or a permission. `test/permissions.test.ts`
// runs every server action through the real actor resolver ("NFR3 guardrail" there too).

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const filesUnder = (dir: string, ext: RegExp) =>
  readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && ext.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"))
    .sort();

/** A name that would offer a guardrail or permission setting (English and the UI's Italian). */
const SETTING = /permission|permess|guardrail|policy|policies|matrix|matrice|nfr\d/i;

describe("NFR3 guardrail: no role or setting changes a guardrail or a permission", () => {
  it("the matrix denies 'change permissions or guardrails' to every role and to system, on any resource", () => {
    expect(ACTIONS).toContain("change permissions or guardrails");
    for (const role of ["owner_designer", "admin", "account_sales_social", "system"] as const) {
      expect(can(role, "change permissions or guardrails")).toBe(false);
      for (const status of CASE_STATUSES) expect(can(role, "change permissions or guardrails", { status, link: { id: "x" } })).toBe(false);
    }
  });

  it("the matrix has no other action about permissions or guardrails", () => {
    expect(ACTIONS.filter((action) => SETTING.test(action))).toEqual(["change permissions or guardrails"]);
  });

  it("no server action offers a guardrail or permission setting", async () => {
    const files = listServerActionFiles(root, `${root}src/app`);
    expect(files.length).toBeGreaterThan(0);
    const names = files.flatMap((file) =>
      [...read(file).matchAll(/export\s+(?:async\s+)?(?:function\s+|const\s+)(\w+)/g)].map((m) => `${file} › ${m[1]}`),
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => SETTING.test(name.split(" › ")[1]))).toEqual([]);
  });

  it("no page or route handler path offers one", () => {
    const routes = filesUnder("src/app", /^(page|route)\.(ts|tsx)$/);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter((rel) => SETTING.test(rel))).toEqual([]);
  });

  it("no environment variable offers one", () => {
    const names = [
      ...Object.keys(envSchema.shape),
      ...[...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
      ...[...read("Dockerfile").matchAll(/\bENV\s+([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]),
    ];
    expect(names).toContain("SUPABASE_URL");
    expect(names.filter((name) => SETTING.test(name))).toEqual([]);
    // src/shared/env.ts is the only reader of process.env (lint rule); nothing else reads a variable by name.
    const readers = filesUnder("src", /\.(ts|tsx)$/)
      .filter((rel) => !/\.test\.tsx?$/.test(rel))
      .flatMap((rel) => [...read(rel).matchAll(/process\.env\.(\w+)|process\.env\[["'`](\w+)/g)].map((m) => m[1] ?? m[2]));
    expect(readers.filter((name) => SETTING.test(name))).toEqual([]);
  });

  it("no table, column or database function offers one", () => {
    const sql = filesUnder("supabase/migrations", /\.sql$/).map(read).join("\n");
    const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)/gi)].map((m) => m[1]);
    const functions = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)/gi)].map((m) => m[1]);
    const columns = [...sql.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)/gi)].map((m) => m[1]);
    expect(tables).toContain("profile");
    expect(functions.length).toBeGreaterThan(0);
    expect([...tables, ...functions, ...columns].filter((name) => SETTING.test(name))).toEqual([]);
    // The generated types are the database as the app sees it: no such table, column, view or function either.
    const typed = [...read("src/shared/db.types.ts").matchAll(/"?(\w+)"?\??:\s/g)].map((m) => m[1]);
    expect(typed).toEqual(expect.arrayContaining(["profile", "role", "case_study"]));
    expect(typed.filter((name) => SETTING.test(name))).toEqual([]);
  });
});
