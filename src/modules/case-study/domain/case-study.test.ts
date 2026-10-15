import { describe, expect, it } from "vitest";
import {
  CLIENT_NAME_MAX,
  caseStudySchema,
  clientNameSchema,
  createCaseStudyInputSchema,
  createClientInputSchema,
  listScopeSchema,
  renameClientInputSchema,
} from "./case-study";
import { recordEventInputSchema } from "./case-event";
import { parseInput } from "./validation";

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const valid = { name: "Rebrand", clientId: CLIENT_ID, year: 2026 };

describe("createCaseStudyInputSchema", () => {
  it("trims text and defaults locale to it", () => {
    expect(parseInput(createCaseStudyInputSchema, { name: "  Rebrand ", clientId: CLIENT_ID, year: 2026 })).toEqual({
      ok: true,
      value: { name: "Rebrand", clientId: CLIENT_ID, year: 2026, locale: "it" },
    });
  });

  it("keeps an explicit en locale and drops unknown keys", () => {
    const result = parseInput(createCaseStudyInputSchema, {
      ...valid,
      locale: "en",
      status: "approved",
      project_order_ref: "PO-1",
      code: "LUM-2026-01",
      client: "Acme",
    });
    expect(result).toEqual({ ok: true, value: { ...valid, locale: "en" } });
  });

  it("names each missing or blank field", () => {
    const result = parseInput(createCaseStudyInputSchema, { name: "   ", year: 2026 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect((result.error.details as { fields: string[] }).fields).toEqual(["name", "clientId"]);
      expect(result.error.message).toContain("name, clientId");
    }
  });

  it.each([
    ["a free-text client name", { name: "R", clientId: "Acme", year: 2026 }],
    ["an empty client id", { name: "R", clientId: "", year: 2026 }],
    ["a numeric client id", { name: "R", clientId: 7, year: 2026 }],
  ])("rejects %s as clientId", (_label, input) => {
    const result = parseInput(createCaseStudyInputSchema, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result.error.details as { fields: string[] }).fields).toEqual(["clientId"]);
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

describe("clientNameSchema", () => {
  it("trims and accepts 1 to 120 characters", () => {
    expect(clientNameSchema.parse("  Lumen Srl ")).toBe("Lumen Srl");
    expect(clientNameSchema.safeParse("x".repeat(CLIENT_NAME_MAX)).success).toBe(true);
  });

  it.each([
    ["blank", "   "],
    ["empty", ""],
    ["121 characters", "x".repeat(CLIENT_NAME_MAX + 1)],
  ])("rejects a %s name", (_label, name) => {
    expect(clientNameSchema.safeParse(name).success).toBe(false);
  });
});

describe("caseStudySchema", () => {
  const row = {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    code: "LUM-2026-01",
    number: 1,
    name: "Rebrand",
    client: { id: CLIENT_ID, name: "Lumen Srl", code: "LUM" },
    year: 2026,
    locale: "it",
    status: "draft",
    projectOrderRef: null,
    headRevisionId: null,
    approvedRevisionId: null,
    headVersion: 0,
    createdBy: "00000000-0000-4000-8000-000000000002",
    createdAt: "2026-10-15T10:00:00+00:00",
    updatedAt: "2026-10-15T10:00:00+00:00",
    deletedAt: null,
  };

  it("takes the client as a record with its code", () => {
    expect(caseStudySchema.parse(row).client).toEqual({ id: CLIENT_ID, name: "Lumen Srl", code: "LUM" });
  });

  it.each([
    ["a free-text client", { ...row, client: "Lumen Srl" }],
    ["a missing client", { ...row, client: null }],
    ["a missing code", { ...row, code: undefined }],
    ["a zero number", { ...row, number: 0 }],
  ])("rejects %s", (_label, input) => {
    expect(caseStudySchema.safeParse(input).success).toBe(false);
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

describe("createClientInputSchema", () => {
  it("trims the name and drops any code the caller sends", () => {
    expect(parseInput(createClientInputSchema, { name: "  Lumen Srl ", code: "ZZZ" })).toEqual({
      ok: true,
      value: { name: "Lumen Srl" },
    });
  });

  it.each([["   "], ["x".repeat(CLIENT_NAME_MAX + 1)], [undefined]])("names the field for %j", (name) => {
    const result = parseInput(createClientInputSchema, { name });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ fields: ["name"] });
  });
});

describe("renameClientInputSchema", () => {
  it("takes a client id and a trimmed name", () => {
    expect(parseInput(renameClientInputSchema, { clientId: CLIENT_ID, name: " Lumen S.r.l. " })).toEqual({
      ok: true,
      value: { clientId: CLIENT_ID, name: "Lumen S.r.l." },
    });
  });

  it("names a malformed client id and a blank name", () => {
    const result = parseInput(renameClientInputSchema, { clientId: "LUM", name: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ fields: ["clientId", "name"] });
  });
});

describe("listScopeSchema", () => {
  it("accepts an optional status and client id", () => {
    expect(listScopeSchema.safeParse({}).success).toBe(true);
    expect(listScopeSchema.safeParse({ status: "approved", clientId: CLIENT_ID }).success).toBe(true);
  });

  it("rejects a malformed client id and unknown keys", () => {
    expect(listScopeSchema.safeParse({ clientId: "LUM" }).success).toBe(false);
    expect(listScopeSchema.safeParse({ client: "Lumen" }).success).toBe(false);
  });
});
