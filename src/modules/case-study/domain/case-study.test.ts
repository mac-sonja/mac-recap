import { describe, expect, it } from "vitest";
import {
  BUSINESS_LINES,
  CLIENT_BRIEF_MAX,
  CLIENT_DESCRIPTION_MAX,
  CLIENT_INDUSTRIES,
  CLIENT_NAME_MAX,
  FIELD_INVALID,
  FIELD_TOO_LONG,
  isClientComplete,
  saveClientBriefFieldInputSchema,
  LOGO_CONTENT_TYPES,
  LOGO_SVG_TYPE,
  LOGO_MAX_BYTES,
  caseStudySchema,
  charCount,
  clientNameSchema,
  createCaseStudyInputSchema,
  createClientInputSchema,
  isLogoContentType,
  isSvgLogoType,
  logoExtensionFor,
  isLogoLargeEnough,
  isLogoSizeAllowed,
  isLogoWithinMaxSide,
  listScopeSchema,
  isBusinessLine,
  updateCaseStudyDetailsInputSchema,
  updateClientInputSchema,
} from "./case-study";
import { recordEventInputSchema } from "./case-event";
import { parseClientInput, parseInput } from "./validation";

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const valid = { name: "Rebrand", clientId: CLIENT_ID, year: 2026, businessLine: "branding" };

describe("createCaseStudyInputSchema", () => {
  it("trims text and defaults locale to it", () => {
    expect(parseInput(createCaseStudyInputSchema, { name: "  Rebrand ", clientId: CLIENT_ID, year: 2026, businessLine: "video" })).toEqual({
      ok: true,
      value: { name: "Rebrand", clientId: CLIENT_ID, year: 2026, locale: "it", businessLine: "video" },
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
      expect((result.error.details as { fields: string[] }).fields).toEqual(["name", "clientId", "businessLine"]);
      expect(result.error.message).toContain("name, clientId, businessLine");
    }
  });

  it.each([
    ["a free-text client name", { ...valid, clientId: "Acme" }],
    ["an empty client id", { ...valid, clientId: "" }],
    ["a numeric client id", { ...valid, clientId: 7 }],
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
    ["no business line", { ...valid, businessLine: undefined }, "businessLine"],
    ["a null business line", { ...valid, businessLine: null }, "businessLine"],
    ["an unknown business line", { ...valid, businessLine: "moda" }, "businessLine"],
    ["a business line label", { ...valid, businessLine: "Social media" }, "businessLine"],
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

describe("BUSINESS_LINES", () => {
  it("lists the business lines in display order", () => {
    expect(BUSINESS_LINES).toEqual(["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"]);
  });

  it.each([
    ["social_media", true],
    ["eventi", true],
    ["sviluppo", true],
    ["moda", false],
    ["Branding", false],
    [null, false],
  ])("isBusinessLine(%j) is %s", (value, expected) => {
    expect(isBusinessLine(value)).toBe(expected);
  });
});

describe("updateCaseStudyDetailsInputSchema", () => {
  const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
  const details = { caseId: CASE_ID, name: " Rebrand ", year: 2026, locale: "en", businessLine: "eventi" };

  it("trims the name and drops a client or code", () => {
    expect(parseInput(updateCaseStudyDetailsInputSchema, { ...details, clientId: CLIENT_ID, code: "X-2026-01" })).toEqual({
      ok: true,
      value: { caseId: CASE_ID, name: "Rebrand", year: 2026, locale: "en", businessLine: "eventi" },
    });
  });

  it.each([
    ["no case id", { ...details, caseId: undefined }, ["caseId"]],
    ["no locale", { ...details, locale: undefined }, ["locale"]],
    ["no business line", { ...details, businessLine: undefined }, ["businessLine"]],
    ["an unknown business line", { ...details, businessLine: "moda" }, ["businessLine"]],
  ])("rejects %s", (_label, input, fields) => {
    const result = parseInput(updateCaseStudyDetailsInputSchema, input);
    expect(result.ok ? null : (result.error.details as { fields: string[] }).fields).toEqual(fields);
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
    businessLine: "web_design",
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
    ["an unknown business line", { ...row, businessLine: "moda" }],
  ])("rejects %s", (_label, input) => {
    expect(caseStudySchema.safeParse(input).success).toBe(false);
  });

  it("accepts a legacy case without a business line", () => {
    expect(caseStudySchema.parse({ ...row, businessLine: null }).businessLine).toBeNull();
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

const MESSAGES = { tooLong: FIELD_TOO_LONG, invalid: FIELD_INVALID };
const info = { industries: ["lusso"], description: "Brand di moda." };

describe("CLIENT_INDUSTRIES", () => {
  it("is the fixed list, in display order", () => {
    expect(CLIENT_INDUSTRIES).toEqual(["interior_design", "energia", "risorse_umane", "lusso"]);
  });
});

describe("createClientInputSchema", () => {
  it("trims the name and description, drops any code the caller sends, and keeps the industries in list order without repeats", () => {
    expect(
      parseInput(createClientInputSchema, {
        name: "  Lumen Srl ",
        code: "ZZZ",
        industries: ["lusso", "energia", "lusso"],
        description: " Brand di moda. ",
      }),
    ).toEqual({
      ok: true,
      value: { name: "Lumen Srl", industries: ["energia", "lusso"], description: "Brand di moda." },
    });
  });

  it.each([["   "], ["x".repeat(CLIENT_NAME_MAX + 1)], [undefined]])("names the field for %j", (name) => {
    const result = parseInput(createClientInputSchema, { name, ...info });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ fields: ["name"] });
  });

  it.each([
    ["an unknown industry", { industries: ["moda"] }, ["industries"]],
    ["no industry", { industries: [] }, ["industries"]],
    ["industries that are not a list", { industries: "lusso" }, ["industries"]],
    ["a non-string industry", { industries: [1] }, ["industries"]],
    ["missing industries", { industries: undefined }, ["industries"]],
    ["a blank description", { description: "  \n " }, ["description"]],
    ["a missing description", { description: undefined }, ["description"]],
    ["a null description", { description: null }, ["description"]],
  ])("refuses %s as CLIENT_FIELD_INVALID naming the field", (_label, over, fields) => {
    const result = parseClientInput(createClientInputSchema, { name: "Lumen", ...info, ...over }, MESSAGES);
    expect(result).toEqual({ ok: false, error: { code: "CLIENT_FIELD_INVALID", message: expect.any(String), details: { fields } } });
  });
});

describe("client info limits (code points after trimming)", () => {
  const emoji = "😀";

  it("counts an emoji as one character", () => {
    expect(charCount(emoji.repeat(3))).toBe(3);
    expect(emoji.repeat(3).length).toBe(6);
  });

  it("accepts a description at its limit (emoji = 1) and refuses one over it as CLIENT_FIELD_TOO_LONG", () => {
    const accepted = parseClientInput(
      createClientInputSchema,
      { name: "Lumen", ...info, description: `  ${emoji.repeat(CLIENT_DESCRIPTION_MAX)}  ` },
      MESSAGES,
    );
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.value.description).toBe(emoji.repeat(CLIENT_DESCRIPTION_MAX));

    const over = parseClientInput(createClientInputSchema, { name: "Lumen", ...info, description: "x".repeat(CLIENT_DESCRIPTION_MAX + 1) }, MESSAGES);
    expect(over).toEqual({ ok: false, error: { code: "CLIENT_FIELD_TOO_LONG", message: expect.any(String), details: { fields: ["description"] } } });
  });

  it("keeps INVALID_INPUT when another field fails too", () => {
    const result = parseClientInput(createClientInputSchema, { name: " ", ...info, description: "x".repeat(401) }, MESSAGES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["description", "name"] } });
  });
});

describe("updateClientInputSchema", () => {
  const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";

  it("takes a client id, a trimmed name, the info and a logo id", () => {
    expect(
      parseInput(updateClientInputSchema, { clientId: CLIENT_ID, name: " Lumen S.r.l. ", ...info, logoId: LOGO_ID }),
    ).toEqual({
      ok: true,
      value: { clientId: CLIENT_ID, name: "Lumen S.r.l.", industries: ["lusso"], description: "Brand di moda.", logoId: LOGO_ID },
    });
  });

  it("refuses a missing or null logo as CLIENT_FIELD_INVALID: a logo is replaced, never cleared", () => {
    for (const logoId of [null, undefined]) {
      const result = parseClientInput(updateClientInputSchema, { clientId: CLIENT_ID, name: "Lumen", ...info, logoId }, MESSAGES);
      expect(result).toMatchObject({ ok: false, error: { code: "CLIENT_FIELD_INVALID", details: { fields: ["logoId"] } } });
    }
  });

  it("names a malformed client id, a blank name and the missing info", () => {
    const result = parseInput(updateClientInputSchema, { clientId: "LUM", name: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details).toMatchObject({ fields: ["industries", "description", "clientId", "name", "logoId"] });
  });
});

describe("U+0000 in the client info", () => {
  it("refuses a description containing U+0000 as INVALID_INPUT naming the field", () => {
    const result = parseClientInput(createClientInputSchema, { name: "Lumen", ...info, description: "Mo\u0000da" }, MESSAGES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["description"] } });
  });
});

describe("saveClientBriefFieldInputSchema", () => {
  it("keeps the text as given, counts it after trimming, and allows an empty text", () => {
    const at = parseClientInput(
      saveClientBriefFieldInputSchema,
      { clientId: CLIENT_ID, field: "context", text: ` ${"😀".repeat(CLIENT_BRIEF_MAX)} ` },
      MESSAGES,
    );
    expect(at.ok && at.value.text).toBe(` ${"😀".repeat(CLIENT_BRIEF_MAX)} `);
    expect(parseInput(saveClientBriefFieldInputSchema, { clientId: CLIENT_ID, field: "results", text: "" }).ok).toBe(true);
  });

  it("refuses a text over the limit as CLIENT_FIELD_TOO_LONG", () => {
    const over = parseClientInput(
      saveClientBriefFieldInputSchema,
      { clientId: CLIENT_ID, field: "context", text: "x".repeat(CLIENT_BRIEF_MAX + 1) },
      MESSAGES,
    );
    expect(over).toMatchObject({ ok: false, error: { code: "CLIENT_FIELD_TOO_LONG" } });
  });
});

describe("isClientComplete", () => {
  const LOGO_ID = "eeeeeeee-0000-4000-8000-000000000001";
  const client = { name: "Lumen", industries: ["lusso" as const], description: "Brand.", logoId: LOGO_ID };
  const brief = { context: "C", solution: "S", results: "R" };

  it("is true only when every required field is filled", () => {
    expect(isClientComplete(client, brief)).toBe(true);
    expect(isClientComplete({ ...client, industries: [] }, brief)).toBe(false);
    expect(isClientComplete({ ...client, description: null }, brief)).toBe(false);
    expect(isClientComplete({ ...client, description: "  " }, brief)).toBe(false);
    expect(isClientComplete({ ...client, logoId: null }, brief)).toBe(false);
    expect(isClientComplete(client, { ...brief, results: " \n" })).toBe(false);
  });
});

describe("logo limits", () => {
  it("allows PNG, JPEG, WebP and SVG only", () => {
    expect(LOGO_CONTENT_TYPES).toEqual(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
    expect(isLogoContentType("image/svg+xml")).toBe(true);
    for (const type of ["image/gif", "application/pdf", "image/svg", "", undefined]) expect(isLogoContentType(type)).toBe(false);
  });

  it("stores an SVG as .svg and treats only it as the vector type (no pixel rules)", () => {
    expect(logoExtensionFor("image/svg+xml")).toBe("svg");
    expect(LOGO_SVG_TYPE).toBe("image/svg+xml");
    expect(LOGO_CONTENT_TYPES.filter(isSvgLogoType)).toEqual(["image/svg+xml"]);
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
