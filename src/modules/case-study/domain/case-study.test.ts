import { describe, expect, it } from "vitest";
import {
  CLIENT_DESCRIPTION_MAX,
  CLIENT_NAME_MAX,
  CLIENT_SECTOR_MAX,
  FIELD_TOO_LONG,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  caseStudySchema,
  charCount,
  clientNameSchema,
  createCaseStudyInputSchema,
  createClientInputSchema,
  isLogoContentType,
  isLogoLargeEnough,
  isLogoSizeAllowed,
  isLogoWithinMaxSide,
  listScopeSchema,
  updateClientInputSchema,
} from "./case-study";
import { recordEventInputSchema } from "./case-event";
import { parseClientInput, parseInput } from "./validation";

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
  it("trims the name, drops any code the caller sends, and stores absent or blank info as null", () => {
    expect(parseInput(createClientInputSchema, { name: "  Lumen Srl ", code: "ZZZ" })).toEqual({
      ok: true,
      value: { name: "Lumen Srl", sector: null, description: null },
    });
    expect(parseInput(createClientInputSchema, { name: "Lumen", sector: "   ", description: "\n  " })).toEqual({
      ok: true,
      value: { name: "Lumen", sector: null, description: null },
    });
  });

  it("trims the sector and the description", () => {
    expect(parseInput(createClientInputSchema, { name: "Lumen", sector: " Moda ", description: " Brand di moda. " })).toEqual({
      ok: true,
      value: { name: "Lumen", sector: "Moda", description: "Brand di moda." },
    });
  });

  it.each([["   "], ["x".repeat(CLIENT_NAME_MAX + 1)], [undefined]])("names the field for %j", (name) => {
    const result = parseInput(createClientInputSchema, { name });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ fields: ["name"] });
  });
});

describe("client info limits (code points after trimming)", () => {
  const emoji = "😀";

  it("counts an emoji as one character", () => {
    expect(charCount(emoji.repeat(3))).toBe(3);
    expect(emoji.repeat(3).length).toBe(6);
  });

  it.each([
    ["description", CLIENT_DESCRIPTION_MAX],
    ["sector", CLIENT_SECTOR_MAX],
  ] as const)("accepts a %s at its limit (emoji = 1) and refuses one over it as CLIENT_FIELD_TOO_LONG", (field, max) => {
    const atLimit = { name: "Lumen", [field]: `  ${emoji.repeat(max)}  ` };
    const accepted = parseClientInput(createClientInputSchema, atLimit, FIELD_TOO_LONG);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.value[field]).toBe(emoji.repeat(max));

    const over = parseClientInput(createClientInputSchema, { name: "Lumen", [field]: "x".repeat(max + 1) }, FIELD_TOO_LONG);
    expect(over).toEqual({ ok: false, error: { code: "CLIENT_FIELD_TOO_LONG", message: expect.any(String), details: { fields: [field] } } });
  });

  it("keeps INVALID_INPUT when another field fails too", () => {
    const result = parseClientInput(createClientInputSchema, { name: " ", sector: "x".repeat(61) }, FIELD_TOO_LONG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["sector", "name"] } });
  });
});

describe("updateClientInputSchema", () => {
  const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";

  it("takes a client id, a trimmed name, the info and a logo id or null", () => {
    expect(
      parseInput(updateClientInputSchema, { clientId: CLIENT_ID, name: " Lumen S.r.l. ", sector: "Moda", description: null, logoId: LOGO_ID }),
    ).toEqual({
      ok: true,
      value: { clientId: CLIENT_ID, name: "Lumen S.r.l.", sector: "Moda", description: null, logoId: LOGO_ID },
    });
    expect(parseInput(updateClientInputSchema, { clientId: CLIENT_ID, name: "Lumen", sector: "", description: null, logoId: null }).ok).toBe(true);
  });

  it("names a malformed client id, a blank name and missing sector, description and logo id (a missing key never erases data)", () => {
    const result = parseInput(updateClientInputSchema, { clientId: "LUM", name: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ fields: ["clientId", "name", "sector", "description", "logoId"] });
  });
});

describe("U+0000 in the client info", () => {
  it.each(["sector", "description"] as const)("refuses a %s containing U+0000 as INVALID_INPUT naming the field", (field) => {
    const result = parseClientInput(createClientInputSchema, { name: "Lumen", [field]: "Mo\u0000da" }, FIELD_TOO_LONG);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: [field] } });
  });
});

describe("logo limits", () => {
  it("allows PNG, JPEG and WebP only", () => {
    expect(LOGO_CONTENT_TYPES).toEqual(["image/png", "image/jpeg", "image/webp"]);
    for (const type of ["image/svg+xml", "image/gif", "application/pdf", "", undefined]) expect(isLogoContentType(type)).toBe(false);
  });

  it("allows 1 B–5 MB", () => {
    expect(LOGO_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect([0, 1, LOGO_MAX_BYTES, LOGO_MAX_BYTES + 1, 1.5].map(isLogoSizeAllowed)).toEqual([false, true, true, false, false]);
  });

  it("allows no side over 8000 px", () => {
    expect(isLogoWithinMaxSide(8000, 400)).toBe(true);
    expect(isLogoWithinMaxSide(400, 8001)).toBe(false);
  });

  it("needs at least 400 px on the short side", () => {
    expect(isLogoLargeEnough(400, 1200)).toBe(true);
    expect(isLogoLargeEnough(1200, 399)).toBe(false);
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
