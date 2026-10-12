import { describe, expect, it as test } from "vitest";
import { it, t } from "./it";

describe("Italian dictionary", () => {
  test("resolves dot-path keys", () => {
    expect(t("shell.nav.caseStudies")).toBe("Case study");
    expect(t("status.in_review")).toBe("Da approvare");
  });

  test("throws on a path that is not a string", () => {
    // @ts-expect-error -- not a leaf key
    expect(() => t("shell.nav")).toThrow(/Missing dictionary entry/);
  });

  test("uses no exclamation marks", () => {
    expect(JSON.stringify(it)).not.toContain("!");
  });
});
