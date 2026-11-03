import { describe, expect, it, vi } from "vitest";
import type { ClientLimits } from "@/app/(tool)/clients/_lib/client-limits";
import type { DocumentElement } from "@/modules/generation";
import type { BoundValues } from "@/modules/rendering";
import { fill, it as dict } from "@/shared/i18n/it";
import {
  boundEditorOf,
  isTypedEditor,
  planFieldSave,
  refusalMessage,
  runFieldSave,
  saveErrorMessage,
  shownValues,
  typedChange,
  typedValueOf,
  type EditableFields,
  type FieldActions,
  type FieldChange,
  type FieldPlan,
} from "./bound-fields";

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const LOGO = "eeeeeeee-0000-4000-8000-000000000001";
const NEW_LOGO = "eeeeeeee-0000-4000-8000-000000000002";
const EL = "ffffffff-0000-4000-8000-000000000001";

const LIMITS = {
  nameMax: 120,
  resultLabelMax: 80,
  resultValueMax: 20,
  testimonialQuoteMax: 600,
  testimonialAuthorMax: 120,
} as ClientLimits;
const OPTIONS = { limits: LIMITS, years: { min: 1900, max: 2100 } };

const FIELDS: EditableFields = {
  client: { id: CLIENT_ID, name: "Lumen Srl", industry: "illuminazione", description: "Lampade.", logoId: LOGO },
  case: {
    year: 2026,
    businessLines: ["branding", "video"],
    results: [
      { label: "Vendite", value: "+30%" },
      { label: "Visite", value: "2x" },
    ],
    testimonial: { quote: "Bravi.", author: "Ada" },
  },
};

const plan = (change: FieldChange, fields: EditableFields = FIELDS): FieldPlan => planFieldSave(fields, change, CASE_ID, OPTIONS);
const text = (over: Partial<Extract<DocumentElement, { type: "text" }>>): DocumentElement => ({ elementId: EL, type: "text", style: "text", provenance: "generated", ...over }) as DocumentElement;

describe("boundEditorOf", () => {
  it.each([
    ["the client's name", text({ binding: { record: "client", field: "name" } }), { kind: "name" }],
    ["a result's label", text({ binding: { record: "case", field: "resultLabel", index: 1 } }), { kind: "resultLabel", index: 1 }],
    ["a result's number", text({ binding: { record: "case", field: "resultValue", index: 0 } }), { kind: "resultValue", index: 0 }],
    ["the quote", text({ binding: { record: "case", field: "testimonialQuote" } }), { kind: "testimonialQuote" }],
    ["the author", text({ binding: { record: "case", field: "testimonialAuthor" } }), { kind: "testimonialAuthor" }],
    ["the meta line", text({ bindings: [{ record: "client", field: "sector" }, { record: "case", field: "year" }] }), { kind: "meta" }],
    ["the year alone", text({ binding: { record: "case", field: "year" } }), { kind: "meta" }],
    ["the services", { elementId: EL, type: "services" } as DocumentElement, { kind: "services" }],
    ["the logos", { elementId: EL, type: "logos" } as DocumentElement, { kind: "logos" }],
  ])("%s opens its editor", (_name, el, editor) => {
    expect(boundEditorOf(el)).toEqual(editor);
  });

  it.each([
    ["an own text", text({ text: "Parole" })],
    ["the client's description (4.11)", text({ binding: { record: "client", field: "description" } })],
    ["the client's own result (4.11)", text({ binding: { record: "client", field: "resultValue", index: 0 } })],
    ["the client's own testimonial (4.11)", text({ binding: { record: "client", field: "testimonialQuote" } })],
    ["an image", { elementId: EL, type: "image", assetId: null, fit: "fill" } as DocumentElement],
    ["nothing", undefined],
  ])("%s opens none", (_name, el) => {
    expect(boundEditorOf(el)).toBeNull();
  });

  it("tells typed editors from panel ones", () => {
    expect(isTypedEditor({ kind: "name" })).toBe(true);
    expect(isTypedEditor({ kind: "resultValue", index: 0 })).toBe(true);
    expect(isTypedEditor({ kind: "meta" })).toBe(false);
    expect(isTypedEditor({ kind: "logos" })).toBe(false);
    expect(isTypedEditor(null)).toBe(false);
  });

  it("starts typing from the stored words", () => {
    expect(typedValueOf({ kind: "name" }, FIELDS)).toBe("Lumen Srl");
    expect(typedValueOf({ kind: "resultValue", index: 1 }, FIELDS)).toBe("2x");
    expect(typedValueOf({ kind: "testimonialQuote" }, FIELDS)).toBe("Bravi.");
    expect(typedChange({ kind: "resultLabel", index: 1 }, "x")).toEqual({ field: "resultLabel", index: 1, text: "x" });
    expect(typedChange({ kind: "testimonialAuthor" }, "x")).toEqual({ field: "testimonialAuthor", text: "x" });
  });
});

describe("planFieldSave: the I/O matrix", () => {
  it("rename the client: updateClient with the client's other fields unchanged", () => {
    expect(plan({ field: "name", text: "  Lumen Group \n" })).toEqual({
      ok: true,
      save: { action: "updateClient", input: { clientId: CLIENT_ID, name: "Lumen Group", industry: "illuminazione", description: "Lampade.", logoId: LOGO } },
      next: { ...FIELDS, client: { ...FIELDS.client, name: "Lumen Group" } },
    });
  });

  it("client without a logo: the rename is refused", () => {
    expect(plan({ field: "name", text: "Nuovo" }, { ...FIELDS, client: { ...FIELDS.client, logoId: null } })).toEqual({ ok: false, reason: "needLogo" });
    expect(refusalMessage({ reason: "needLogo" })).toBe("Aggiungi prima il logo del cliente.");
  });

  it("a client without a sector or description is refused (updateClient needs them)", () => {
    expect(plan({ field: "name", text: "Nuovo" }, { ...FIELDS, client: { ...FIELDS.client, industry: null } })).toMatchObject({ reason: "needClientInfo" });
    expect(plan({ field: "name", text: "Nuovo" }, { ...FIELDS, client: { ...FIELDS.client, description: " " } })).toMatchObject({ reason: "needClientInfo" });
  });

  it("an empty or too long name is refused", () => {
    expect(plan({ field: "name", text: "  " })).toEqual({ ok: false, reason: "required" });
    expect(plan({ field: "name", text: "x".repeat(121) })).toEqual({ ok: false, reason: "tooLong", max: 120 });
  });

  it("the sector and the logo also go through updateClient, with the other fields", () => {
    expect(plan({ field: "sector", key: "moda" })).toMatchObject({ ok: true, save: { action: "updateClient", input: { name: "Lumen Srl", industry: "moda", logoId: LOGO } } });
    expect(plan({ field: "logo", logoId: NEW_LOGO, previewUrl: null })).toMatchObject({
      ok: true,
      save: { action: "updateClient", input: { name: "Lumen Srl", industry: "illuminazione", logoId: NEW_LOGO } },
    });
    // Replacing a missing logo is how a client without one gets it.
    expect(plan({ field: "logo", logoId: NEW_LOGO, previewUrl: null }, { ...FIELDS, client: { ...FIELDS.client, logoId: null } })).toMatchObject({ ok: true });
  });

  it("change the year: updateCaseFields with the services as stored", () => {
    expect(plan({ field: "year", text: " 2025 " })).toEqual({
      ok: true,
      save: { action: "updateCaseFields", input: { caseId: CASE_ID, year: 2025, businessLines: ["branding", "video"] } },
      next: { ...FIELDS, case: { ...FIELDS.case, year: 2025 } },
    });
  });

  it.each(["1899", "2101", "duemila", "2025.5", ""])("the year %j is refused", (typed) => {
    expect(plan({ field: "year", text: typed })).toEqual({ ok: false, reason: "yearRange", min: 1900, max: 2100 });
  });

  it("toggle a service: updateCaseFields with the new list and the year as stored", () => {
    expect(plan({ field: "service", line: "eventi" })).toMatchObject({
      ok: true,
      save: { action: "updateCaseFields", input: { caseId: CASE_ID, year: 2026, businessLines: ["branding", "video", "eventi"] } },
    });
    expect(plan({ field: "service", line: "video" })).toMatchObject({ ok: true, save: { input: { businessLines: ["branding"] } } });
  });

  it("the last service turned off is refused: Serve almeno un servizio.", () => {
    const one = { ...FIELDS, case: { ...FIELDS.case, businessLines: ["video" as const] } };
    expect(plan({ field: "service", line: "video" }, one)).toEqual({ ok: false, reason: "needService" });
    expect(refusalMessage({ reason: "needService" })).toBe("Serve almeno un servizio.");
  });

  it("a result row: saveCaseResults with the stored rows, only that row's value changed", () => {
    expect(plan({ field: "resultValue", index: 1, text: "3x" })).toEqual({
      ok: true,
      save: {
        action: "saveCaseResults",
        input: {
          caseId: CASE_ID,
          results: [
            { label: "Vendite", value: "+30%" },
            { label: "Visite", value: "3x" },
          ],
        },
      },
      next: { ...FIELDS, case: { ...FIELDS.case, results: [FIELDS.case.results[0], { label: "Visite", value: "3x" }] } },
    });
  });

  it("a number over 20 or a label over 80 characters is refused; an emoji counts as one", () => {
    expect(plan({ field: "resultValue", index: 0, text: "1".repeat(21) })).toEqual({ ok: false, reason: "tooLong", max: 20 });
    expect(plan({ field: "resultLabel", index: 0, text: "x".repeat(81) })).toEqual({ ok: false, reason: "tooLong", max: 80 });
    expect(plan({ field: "resultValue", index: 0, text: "🚀".repeat(20) })).toMatchObject({ ok: true });
    expect(refusalMessage({ reason: "tooLong", max: 20 })).toBe("Al massimo 20 caratteri.");
  });

  it("an emptied row half or a row the case doesn't have is refused", () => {
    expect(plan({ field: "resultLabel", index: 0, text: " " })).toEqual({ ok: false, reason: "required" });
    expect(plan({ field: "resultValue", index: 2, text: "5" })).toEqual({ ok: false, reason: "noRow" });
  });

  it("the testimonial: saveCaseTestimonial with the stored quote and the new author", () => {
    expect(plan({ field: "testimonialAuthor", text: "Ada L." })).toEqual({
      ok: true,
      save: { action: "saveCaseTestimonial", input: { caseId: CASE_ID, quote: "Bravi.", author: "Ada L." } },
      next: { ...FIELDS, case: { ...FIELDS.case, testimonial: { quote: "Bravi.", author: "Ada L." } } },
    });
  });

  it("an author without a quote is refused; emptying both clears the testimonial", () => {
    const noQuote = { ...FIELDS, case: { ...FIELDS.case, testimonial: { quote: "", author: "" } } };
    expect(plan({ field: "testimonialAuthor", text: "Ada" }, noQuote)).toEqual({ ok: false, reason: "authorWithoutQuote" });
    expect(plan({ field: "testimonialQuote", text: "" })).toEqual({ ok: false, reason: "authorWithoutQuote" });
    const quoteOnly = { ...FIELDS, case: { ...FIELDS.case, testimonial: { quote: "Bravi.", author: "" } } };
    expect(plan({ field: "testimonialQuote", text: "" }, quoteOnly)).toMatchObject({ ok: true, save: { input: { quote: "", author: "" } } });
  });

  it.each([
    { field: "name", text: " Lumen Srl " },
    { field: "sector", key: "illuminazione" },
    { field: "logo", logoId: LOGO, previewUrl: null },
    { field: "year", text: "2026" },
    { field: "resultValue", index: 0, text: "+30%" },
    { field: "testimonialAuthor", text: "Ada\n" },
  ] as FieldChange[])("the same value again saves nothing: %o", (change) => {
    expect(plan(change)).toEqual({ ok: false, reason: "unchanged" });
  });
});

describe("messages", () => {
  it("names each refusal and each server code, with a fallback", () => {
    expect(refusalMessage({ reason: "yearRange", min: 1900, max: 2100 })).toBe(fill(dict.configurator.fields.yearRange, { min: 1900, max: 2100 }));
    expect(saveErrorMessage("CLIENT_NAME_TAKEN")).toBe("C’è già un cliente con questo nome.");
    expect(saveErrorMessage("CLIENT_LOGO_INVALID")).toBe(dict.configurator.fields.errors.CLIENT_LOGO_INVALID);
    expect(saveErrorMessage("SOMETHING_ELSE")).toBe(dict.configurator.fields.errors.failed);
    expect(saveErrorMessage(undefined)).toBe(dict.configurator.fields.errors.failed);
    expect(saveErrorMessage("toString")).toBe(dict.configurator.fields.errors.failed);
  });
});

describe("runFieldSave", () => {
  it("calls the save's own action with its input", async () => {
    const ok = { ok: true as const, value: null };
    const actions: FieldActions = {
      updateClient: vi.fn(async () => ok),
      addClientSector: vi.fn(),
      updateCaseFields: vi.fn(async () => ok),
      saveCaseResults: vi.fn(async () => ok),
      saveCaseTestimonial: vi.fn(async () => ok),
    };
    const save = plan({ field: "year", text: "2024" });
    if (!save.ok) throw new Error("setup");
    await runFieldSave(actions, save.save);
    expect(actions.updateCaseFields).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, year: 2024, businessLines: ["branding", "video"] });
    expect(actions.updateClient).not.toHaveBeenCalled();
  });
});

describe("shownValues", () => {
  const VALUES: BoundValues = {
    client: { name: "Lumen Srl", sector: "Illuminazione", description: "Lampade.", logoUrl: "https://cdn.test/old.png", results: [{ label: "client", value: "1" }], testimonial: null },
    case: { year: 2026, services: ["Branding", "Video"], results: [], testimonial: null },
  };
  const ctx = { sectors: [{ key: "moda", label: "Moda" }], serviceLabel: (line: string) => line.toUpperCase() };

  it("shows the change at once, and only what the fields hold", () => {
    const sector = plan({ field: "sector", key: "moda" });
    if (!sector.ok) throw new Error("setup");
    const shown = shownValues(VALUES, sector.next, { field: "sector", key: "moda" }, ctx);
    expect(shown.client).toEqual({ ...VALUES.client, sector: "Moda" });
    expect(shown.case).toEqual({
      year: 2026,
      services: ["BRANDING", "VIDEO"],
      results: FIELDS.case.results,
      testimonial: { quote: "Bravi.", author: "Ada" },
    });
  });

  it("a new logo shows its picked file", () => {
    const change: FieldChange = { field: "logo", logoId: NEW_LOGO, previewUrl: "blob:new" };
    const logo = plan(change);
    if (!logo.ok) throw new Error("setup");
    expect(shownValues(VALUES, logo.next, change, ctx).client.logoUrl).toBe("blob:new");
  });
});
