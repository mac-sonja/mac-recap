import { describe, expect, it } from "vitest";
import { canHide, isPermutation } from "./edits";

describe("canHide (Story 5.11a)", () => {
  it("keeps at least one page of the part shown", () => {
    expect(canHide(["a", "b"], new Set(), "a")).toBe(true);
    expect(canHide(["a", "b"], new Set(["b"]), "a")).toBe(false);
    expect(canHide(["a"], new Set(), "a")).toBe(false);
    // A key no longer in the document doesn't count as shown.
    expect(canHide(["a"], new Set(["gone"]), "a")).toBe(false);
    // Hiding a page already hidden changes nothing.
    expect(canHide(["a", "b"], new Set(["b"]), "b")).toBe(true);
  });
});

describe("isPermutation (Story 5.11a)", () => {
  it("is every page key once, in any order", () => {
    expect(isPermutation(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(isPermutation(["a", "b"], ["a"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "a"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "x"])).toBe(false);
  });
});
