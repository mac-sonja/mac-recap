import type { ActionResult } from "@/app/_lib/action-result";
import type { ClientLimits } from "@/app/(tool)/clients/_lib/client-limits";
import type { BusinessLine, ClientSector } from "@/modules/case-study";
import type { DocumentElement } from "@/modules/generation";
import type { BoundValues } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";

/**
 * Story 4.3d: the client's and the case's fields as the configurator edits them. Pure: which
 * editor a bound element opens, the whole input of each save built from the stored fields
 * plus one change, and what the page shows meanwhile. The document only ever holds the
 * binding; the values live on the client and the case.
 */

/** A case's result row (Story 2.21). */
export interface FieldResult {
  label: string;
  value: string;
}

/**
 * The stored values a field save starts from (`editableFieldsOf`): every field the
 * client's and the case's own update use cases need, so one change never drops another.
 * `industry` is the client's sector key (null when it has none).
 */
export interface EditableFields {
  client: { id: string; name: string; industry: string | null; description: string; logoId: string | null };
  case: { year: number; businessLines: readonly BusinessLine[]; results: readonly FieldResult[]; testimonial: { quote: string; author: string } };
}

/** What the panel and the checks need beside the values (from the server: the module's index is server-only). */
export interface FieldOptions {
  /** The shared sector list (`listClientSectors`), in display order. */
  sectors: readonly ClientSector[];
  /** The client panel's limits (name, results, testimonial, sector, logo). */
  limits: ClientLimits;
  /** `YEAR_MIN`–`YEAR_MAX`. */
  years: { min: number; max: number };
  /** `BUSINESS_LINES`, in display order. */
  businessLines: readonly BusinessLine[];
}

/** Which editor a bound element opens: typed on the page, or set in the left panel. */
export type BoundEditor =
  | { kind: "name" }
  | { kind: "resultLabel"; index: number }
  | { kind: "resultValue"; index: number }
  | { kind: "testimonialQuote" }
  | { kind: "testimonialAuthor" }
  | { kind: "meta" }
  | { kind: "services" }
  | { kind: "logos" };

export type TypedEditor = Extract<BoundEditor, { kind: "name" | "resultLabel" | "resultValue" | "testimonialQuote" | "testimonialAuthor" }>;
export type PanelEditor = Extract<BoundEditor, { kind: "meta" | "services" | "logos" }>;

export const isTypedEditor = (editor: BoundEditor | null): editor is TypedEditor =>
  editor !== null && editor.kind !== "meta" && editor.kind !== "services" && editor.kind !== "logos";

/** The meta line's fields: the client's sector and the case's year. */
const isMetaBinding = (b: { record: string; field: string }) => (b.record === "client" && b.field === "sector") || (b.record === "case" && b.field === "year");

/**
 * The editor of a bound element, or null for anything else: an own text, the client's
 * description and the client's own results and testimonial (4.11), and every other element.
 * The meta line ("sector · year", or either alone) goes to the panel's year field.
 */
export function boundEditorOf(el: DocumentElement | undefined): BoundEditor | null {
  if (el === undefined) return null;
  if (el.type === "services") return { kind: "services" };
  if (el.type === "logos") return { kind: "logos" };
  if (el.type !== "text") return null;
  if (el.bindings !== undefined) return el.bindings.every(isMetaBinding) ? { kind: "meta" } : null;
  const b = el.binding;
  if (b === undefined) return null;
  if (isMetaBinding(b)) return { kind: "meta" };
  if (b.record === "client") return b.field === "name" ? { kind: "name" } : null;
  switch (b.field) {
    case "resultLabel":
    case "resultValue":
      return b.index === undefined ? null : { kind: b.field, index: b.index };
    case "testimonialQuote":
    case "testimonialAuthor":
      return { kind: b.field };
    default:
      return null;
  }
}

/** The stored words a typed editor starts from (the quote without the template's « »). */
export function typedValueOf(editor: TypedEditor, fields: EditableFields): string {
  switch (editor.kind) {
    case "name":
      return fields.client.name;
    case "resultLabel":
      return fields.case.results[editor.index]?.label ?? "";
    case "resultValue":
      return fields.case.results[editor.index]?.value ?? "";
    case "testimonialQuote":
      return fields.case.testimonial.quote;
    case "testimonialAuthor":
      return fields.case.testimonial.author;
  }
}

/** One change to one field. */
export type FieldChange =
  | { field: "name"; text: string }
  | { field: "resultLabel" | "resultValue"; index: number; text: string }
  | { field: "testimonialQuote" | "testimonialAuthor"; text: string }
  | { field: "sector"; key: string }
  | { field: "logo"; logoId: string; previewUrl: string | null }
  | { field: "year"; text: string }
  | { field: "service"; line: BusinessLine };

/** A typed editor's change, from what was typed. */
export function typedChange(editor: TypedEditor, text: string): FieldChange {
  return editor.kind === "resultLabel" || editor.kind === "resultValue" ? { field: editor.kind, index: editor.index, text } : { field: editor.kind, text };
}

/** The save a change makes: which action, with its whole input. */
export type FieldSave =
  | { action: "updateClient"; input: { clientId: string; name: string; industry: string; description: string; logoId: string } }
  | { action: "updateCaseFields"; input: { caseId: string; year: number; businessLines: BusinessLine[] } }
  | { action: "saveCaseResults"; input: { caseId: string; results: FieldResult[] } }
  | { action: "saveCaseTestimonial"; input: { caseId: string; quote: string; author: string } };

/**
 * The saves a field edit goes through (the page passes the server actions): the client's
 * `updateClient` and `addClientSector` (`manage clients`), the case's `updateCaseFields`,
 * `saveCaseResults` and `saveCaseTestimonial` (`fill details`).
 */
export interface FieldActions {
  updateClient: (input: Extract<FieldSave, { action: "updateClient" }>["input"]) => Promise<ActionResult<unknown>>;
  addClientSector: (input: { label: string }) => Promise<ActionResult<ClientSector>>;
  updateCaseFields: (input: Extract<FieldSave, { action: "updateCaseFields" }>["input"]) => Promise<ActionResult<unknown>>;
  saveCaseResults: (input: Extract<FieldSave, { action: "saveCaseResults" }>["input"]) => Promise<ActionResult<unknown>>;
  saveCaseTestimonial: (input: Extract<FieldSave, { action: "saveCaseTestimonial" }>["input"]) => Promise<ActionResult<unknown>>;
}

/** Runs `save` through its action. */
export function runFieldSave(actions: FieldActions, save: FieldSave): Promise<ActionResult<unknown>> {
  switch (save.action) {
    case "updateClient":
      return actions.updateClient(save.input);
    case "updateCaseFields":
      return actions.updateCaseFields(save.input);
    case "saveCaseResults":
      return actions.saveCaseResults(save.input);
    case "saveCaseTestimonial":
      return actions.saveCaseTestimonial(save.input);
  }
}

/** Why a change saves nothing: `unchanged` quietly, any other with a message (`refusalMessage`). */
export type FieldRefusal =
  | { reason: "unchanged" }
  | { reason: "needLogo" | "needClientInfo" | "needService" | "required" | "noRow" | "authorWithoutQuote" }
  | { reason: "tooLong"; max: number }
  | { reason: "yearRange"; min: number; max: number };

export type FieldPlan = ({ ok: true; save: FieldSave; next: EditableFields }) | ({ ok: false } & FieldRefusal);

/** Typed words as stored: one line (a field has no line breaks), trimmed. */
export const fieldText = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

/** Length in characters (code points), as the server counts the case's texts. */
const chars = (text: string) => [...text].length;

const refuse = (refusal: FieldRefusal): FieldPlan => ({ ok: false, ...refusal });

/**
 * The save that `change` makes on top of the stored `fields`, with the fields as they are
 * after it (`next`): the client's other fields, the case's other result rows, the other half
 * of the testimonial, the year with the services and the services with the year, as stored.
 * Words are trimmed; the same value again saves nothing (`unchanged`). The checks are the
 * server's, so most refusals never reach it.
 */
export function planFieldSave(fields: EditableFields, change: FieldChange, caseId: string, options: Pick<FieldOptions, "limits" | "years">): FieldPlan {
  const { limits, years } = options;
  const client = fields.client;
  const story = fields.case;

  const saveClient = (patch: Partial<EditableFields["client"]>): FieldPlan => {
    const next = { ...client, ...patch };
    if (next.logoId === null) return refuse({ reason: "needLogo" });
    if (next.industry === null || next.description.trim() === "") return refuse({ reason: "needClientInfo" });
    return {
      ok: true,
      save: { action: "updateClient", input: { clientId: next.id, name: next.name, industry: next.industry, description: next.description, logoId: next.logoId } },
      next: { ...fields, client: next },
    };
  };

  const saveYearAndServices = (year: number, businessLines: BusinessLine[]): FieldPlan => ({
    ok: true,
    save: { action: "updateCaseFields", input: { caseId, year, businessLines } },
    next: { ...fields, case: { ...story, year, businessLines } },
  });

  switch (change.field) {
    case "name": {
      const name = fieldText(change.text);
      if (name === client.name) return refuse({ reason: "unchanged" });
      if (name === "") return refuse({ reason: "required" });
      // The client's name counts UTF-16 units, as the server does.
      if (name.length > limits.nameMax) return refuse({ reason: "tooLong", max: limits.nameMax });
      return saveClient({ name });
    }
    case "sector":
      return change.key === client.industry ? refuse({ reason: "unchanged" }) : saveClient({ industry: change.key });
    case "logo":
      return change.logoId === client.logoId ? refuse({ reason: "unchanged" }) : saveClient({ logoId: change.logoId });
    case "year": {
      const typed = change.text.trim();
      const year = /^\d+$/.test(typed) ? Number(typed) : Number.NaN;
      if (year === story.year) return refuse({ reason: "unchanged" });
      if (!Number.isInteger(year) || year < years.min || year > years.max) return refuse({ reason: "yearRange", min: years.min, max: years.max });
      return saveYearAndServices(year, [...story.businessLines]);
    }
    case "service": {
      const on = story.businessLines.includes(change.line);
      const lines = on ? story.businessLines.filter((line) => line !== change.line) : [...story.businessLines, change.line];
      if (lines.length === 0) return refuse({ reason: "needService" });
      return saveYearAndServices(story.year, lines);
    }
    case "resultLabel":
    case "resultValue": {
      const row = story.results[change.index];
      if (row === undefined) return refuse({ reason: "noRow" });
      const text = fieldText(change.text);
      const key = change.field === "resultLabel" ? "label" : "value";
      if (text === row[key]) return refuse({ reason: "unchanged" });
      if (text === "") return refuse({ reason: "required" });
      const max = key === "label" ? limits.resultLabelMax : limits.resultValueMax;
      if (chars(text) > max) return refuse({ reason: "tooLong", max });
      const results = story.results.map((r, i) => (i === change.index ? { ...r, [key]: text } : { ...r }));
      return { ok: true, save: { action: "saveCaseResults", input: { caseId, results } }, next: { ...fields, case: { ...story, results } } };
    }
    case "testimonialQuote":
    case "testimonialAuthor": {
      const text = fieldText(change.text);
      const key = change.field === "testimonialQuote" ? "quote" : "author";
      if (text === story.testimonial[key]) return refuse({ reason: "unchanged" });
      const max = key === "quote" ? limits.testimonialQuoteMax : limits.testimonialAuthorMax;
      if (chars(text) > max) return refuse({ reason: "tooLong", max });
      const testimonial = { ...story.testimonial, [key]: text };
      if (testimonial.quote === "" && testimonial.author !== "") return refuse({ reason: "authorWithoutQuote" });
      return {
        ok: true,
        save: { action: "saveCaseTestimonial", input: { caseId, quote: testimonial.quote, author: testimonial.author } },
        next: { ...fields, case: { ...story, testimonial } },
      };
    }
  }
}

/** The words for a refused change (never called for `unchanged`). */
export function refusalMessage(refusal: Exclude<FieldRefusal, { reason: "unchanged" }>): string {
  const t = it.configurator.fields;
  switch (refusal.reason) {
    case "tooLong":
      return fill(t.tooLong, { max: refusal.max });
    case "yearRange":
      return fill(t.yearRange, { min: refusal.min, max: refusal.max });
    default:
      return t[refusal.reason];
  }
}

/** The words for a save the server refused, by its code. */
export function saveErrorMessage(code: string | undefined): string {
  const errors: Readonly<Record<string, string>> = it.configurator.fields.errors;
  return (code !== undefined && Object.hasOwn(errors, code) ? errors[code] : undefined) ?? errors.failed!;
}

/** What the renderer needs to show a change before the page reloads the values. */
export interface ShownContext {
  sectors: readonly ClientSector[];
  /** A business line's label, as the services show it. */
  serviceLabel: (line: BusinessLine) => string;
}

/**
 * `values` showing `next` (the fields after a change) at once, while the save runs and until
 * the page reloads the bound values: only what the fields hold changes. A new logo shows its
 * picked file (`logoUrl`) until then.
 */
export function shownValues(values: BoundValues, next: EditableFields, change: FieldChange, ctx: ShownContext): BoundValues {
  const story = next.case;
  const sector = ctx.sectors.find((s) => s.key === next.client.industry)?.label;
  return {
    client: {
      ...values.client,
      name: next.client.name,
      ...(sector === undefined ? {} : { sector }),
      ...(change.field === "logo" && change.previewUrl !== null ? { logoUrl: change.previewUrl } : {}),
    },
    case: {
      ...values.case,
      year: story.year,
      services: story.businessLines.map(ctx.serviceLabel),
      results: story.results.map((r) => ({ ...r })),
      testimonial: story.testimonial.quote === "" ? null : { ...story.testimonial },
    },
  };
}
