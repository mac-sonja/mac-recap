import { describe, expect, it } from "vitest";
import { caseHref, caseViewHref, configuratorHref, wizardHref } from "./routes";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

describe("caseViewHref", () => {
  it("is the case's detail page, with the id encoded", () => {
    expect(caseViewHref(ID)).toBe(`/case-studies/${ID}`);
    expect(caseViewHref("a/b")).toBe("/case-studies/a%2Fb");
  });
});

describe("caseHref", () => {
  it("reopens a Bozza in the wizard for every role", () => {
    expect(caseHref(ID, "draft", true)).toBe(wizardHref(ID));
    expect(caseHref(ID, "draft", false)).toBe(wizardHref(ID));
  });

  it("opens an Approvato on its detail page for every role", () => {
    expect(caseHref(ID, "approved", true)).toBe(caseViewHref(ID));
    expect(caseHref(ID, "approved", false)).toBe(caseViewHref(ID));
  });

  it("opens a Da approvare in the configurator only with `edit`", () => {
    expect(caseHref(ID, "in_review", true)).toBe(configuratorHref(ID));
    expect(caseHref(ID, "in_review", false)).toBeNull();
  });

  it("opens nothing for In elaborazione", () => {
    expect(caseHref(ID, "generating", true)).toBeNull();
    expect(caseHref(ID, "generating", false)).toBeNull();
  });
});
