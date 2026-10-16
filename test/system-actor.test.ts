import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYSTEM_ACTOR_ID } from "@/modules/access/domain/actor";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("the system actor's id stays inside access (AD-11)", () => {
  it("no source file outside src/modules/access names SYSTEM_ACTOR_ID or its value", () => {
    const offenders = readdirSync(`${root}src`, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx|mts|cts|js|mjs)$/.test(e.name))
      .map((e) => relative(root, join(e.parentPath, e.name)))
      .filter((file) => !file.startsWith(join("src", "modules", "access") + sep))
      .filter((file) => {
        const code = readFileSync(`${root}${file}`, "utf8");
        return code.includes("SYSTEM_ACTOR_ID") || code.includes(SYSTEM_ACTOR_ID);
      });
    expect(offenders).toEqual([]);
  });
});
