import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Story 4.8 (AR5, C39): a case becomes `approved` only through a person's call to
// `case-study.approve`, with an overflow-free result for every format and no missing
// material. This scans src/ for any other way in: no bulk or automatic approve in the
// module's API, no `transition(…, "approve")` (the generic transition would skip the
// checks), and `approve` called only by the configurator's server action, which takes
// the actor from the session.

const root = fileURLToPath(new URL("..", import.meta.url));

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && ext.test(e.name))
    .map((e) => relative(root, join(e.parentPath, e.name)).split(sep).join("/"));
}

const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const sources = () => files("src", /\.(ts|tsx)$/).filter((rel) => !/\.test\.tsx?$/.test(rel));

/** The only caller of `caseStudy.approve`: a server action that resolves the actor from the session. */
const APPROVE_CALLER = "src/app/(wizard)/case-studies/[caseId]/configurator/actions.ts";

describe("approval happens only through a person's call to approve (Story 4.8)", () => {
  it("the case-study module exports one approve and no bulk or automatic variant", async () => {
    const api = Object.keys(await import("@/modules/case-study"));
    expect(api.filter((name) => /approv/i.test(name))).toEqual(["approve"]);
  });

  it("no source moves a case to approved through the generic transition", () => {
    const offenders = sources().filter((rel) => /\btransition\s*\([^)]*["'`]approve["'`]/.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it("only the configurator's server action calls approve, with the session's actor and the case's live files", () => {
    const callers = sources().filter((rel) => /\bcaseStudy\.approve\s*\(/.test(read(rel)));
    expect(callers).toEqual([APPROVE_CALLER]);
    const action = read(APPROVE_CALLER);
    expect(action).toMatch(/^"use server";/);
    expect(action).toMatch(/const actor = await getActor\(\);[\s\S]*authorize\(actor\.value, "approve"\)[\s\S]*caseStudy\.approve\(actor\.value, input, material\.liveAssetIds\)/);
  });

  it("the approve use case checks every format's overflow and the material before it writes", () => {
    const useCase = read("src/modules/case-study/application/revisions.ts");
    const body = useCase.slice(useCase.indexOf("export function makeApprove"));
    const overflow = body.indexOf("OVERFLOW_NOT_CLEARED");
    const material = body.indexOf("MATERIAL_MISSING");
    const write = body.indexOf("deps.revisions.approve(");
    expect(overflow).toBeGreaterThan(0);
    expect(material).toBeGreaterThan(overflow);
    expect(write).toBeGreaterThan(material);
  });
});
