import { describe, expect, it } from "vitest";
import { createCaseStudyInputSchema } from "./case-study";
import { recordEventInputSchema } from "./case-event";
import { parseInput } from "./validation";

const valid = { name: "Rebrand", client: "Acme", year: 2026 };

describe("createCaseStudyInputSchema", () => {
  it("trims text and defaults locale to it", () => {
    expect(parseInput(createCaseStudyInputSchema, { name: "  Rebrand ", client: " Acme", year: 2026 })).toEqual({
      ok: true,
      value: { name: "Rebrand", client: "Acme", year: 2026, locale: "it" },
    });
  });

  it("keeps an explicit en locale and drops unknown keys", () => {
    const result = parseInput(createCaseStudyInputSchema, {
      ...valid,
      locale: "en",
      status: "approved",
      project_order_ref: "PO-1",
    });
    expect(result).toEqual({ ok: true, value: { ...valid, locale: "en" } });
  });

  it("names each missing or blank field", () => {
    const result = parseInput(createCaseStudyInputSchema, { name: "   ", year: 2026 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(["name", "client"]);
      expect(result.error.message).toContain("name, client");
    }
  });

  it.each([
    ["a fractional year", { ...valid, year: 2026.5 }, "year"],
    ["a year below 1900", { ...valid, year: 1899 }, "year"],
    ["a year above 2100", { ...valid, year: 2101 }, "year"],
    ["a string year", { ...valid, year: "2026" }, "year"],
    ["NaN", { ...valid, year: Number.NaN }, "year"],
    ["an unknown locale", { ...valid, locale: "fr" }, "locale"],
    ["a null locale", { ...valid, locale: null }, "locale"],
  ])("rejects %s", (_label, input, field) => {
    const result = parseInput(createCaseStudyInputSchema, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual([field]);
  });

  it.each([1900, 2100])("accepts the boundary year %i", (year) => {
    expect(parseInput(createCaseStudyInputSchema, { ...valid, year }).ok).toBe(true);
  });

  it("rejects a non-object input", () => {
    const result = parseInput(createCaseStudyInputSchema, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_INPUT");
  });
});

describe("recordEventInputSchema", () => {
  const caseId = "11111111-1111-4111-8111-111111111111";

  it("defaults revisionId to null and data to {}", () => {
    expect(parseInput(recordEventInputSchema, { caseId, type: "text_added" })).toEqual({
      ok: true,
      value: { caseId, type: "text_added", revisionId: null, data: {} },
    });
  });

  it.each([
    ["a non-uuid case id", { caseId: "nope", type: "x" }, "caseId"],
    ["a non-snake_case type", { caseId, type: "Case Created" }, "type"],
    ["non-JSON data", { caseId, type: "x", data: { at: new Date() } }, "data.at"],
  ])("rejects %s", (_label, input, field) => {
    const result = parseInput(recordEventInputSchema, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual([field]);
  });
});
