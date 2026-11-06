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

/**
 * Story 4.11a, client mode (a client's intro and outro): the client's fields only. Its pages
 * bind the client's own result rows and testimonial, saved through `saveClientResults` and
 * `saveClientTestimonial`; no case binding is offered.
 */
export interface ClientEditableFields {
  client: EditableFields["client"];
  /** The client's own result rows and testimonial (its brief), which the outro binds to. */
  record: { results: readonly FieldResult[]; testimonial: { quote: string; author: string } };
}

/** Either mode's stored fields: a case's (with its client's), or a client's own (client mode). */
export type AnyEditableFields = EditableFields | ClientEditableFields;

/** Whether the fields are client mode's (Story 4.11a). */
export const isClientFields = (fields: AnyEditableFields): fields is ClientEditableFields => !("case" in fields);

/** The result rows and the testimonial the pages bind to: the case's, or in client mode the client's own. */
export const recordOf = (fields: AnyEditableFields): ClientEditableFields["record"] => (isClientFields(fields) ? fields.record : fields.case);

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
  /** Client mode only (Story 4.11a): the client's description. */
  | { kind: "description" }
  | { kind: "resultLabel"; index: number }
  | { kind: "resultValue"; index: number }
  | { kind: "testimonialQuote" }
  | { kind: "testimonialAuthor" }
  | { kind: "meta" }
  | { kind: "services" }
  | { kind: "logos" };

export type TypedEditor = Extract<BoundEditor, { kind: "name" | "description" | "resultLabel" | "resultValue" | "testimonialQuote" | "testimonialAuthor" }>;
export type PanelEditor = Extract<BoundEditor, { kind: "meta" | "services" | "logos" }>;

export const isTypedEditor = (editor: BoundEditor | null): editor is TypedEditor =>
  editor !== null && editor.kind !== "meta" && editor.kind !== "services" && editor.kind !== "logos";

/** The meta line's fields: the client's sector and the case's year. */
const isMetaBinding = (b: { record: string; field: string }) => (b.record === "client" && b.field === "sector") || (b.record === "case" && b.field === "year");

/**
 * The editor of a bound element, or null for anything else: an own text, the client's
 * description and the client's own results and testimonial (client mode's), and every other
 * element. The meta line ("sector · year", or either alone) goes to the panel's year field.
 *
 * Client mode (Story 4.11a, `mode` "client"): only the client's bindings: the name, the
 * description and its own result rows and testimonial typed on the page, the sector in the
 * panel (as a meta line with no year), the logos. No case binding, no services.
 */
export function boundEditorOf(el: DocumentElement | undefined, mode: "case" | "client" = "case"): BoundEditor | null {
  if (el === undefined) return null;
  if (mode === "client") return clientEditorOf(el);
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

/** Client mode's editor of a bound element (Story 4.11a): the client's fields only. */
function clientEditorOf(el: DocumentElement): BoundEditor | null {
  if (el.type === "logos") return { kind: "logos" };
  if (el.type !== "text") return null;
  const isSector = (b: { record: string; field: string }) => b.record === "client" && b.field === "sector";
  if (el.bindings !== undefined) return el.bindings.length > 0 && el.bindings.every(isSector) ? { kind: "meta" } : null;
  const b = el.binding;
  if (b === undefined || b.record !== "client") return null;
  switch (b.field) {
    case "name":
      return { kind: "name" };
    case "sector":
      return { kind: "meta" };
    case "description":
      return { kind: "description" };
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
export function typedValueOf(editor: TypedEditor, fields: AnyEditableFields): string {
  const record = recordOf(fields);
  switch (editor.kind) {
    case "name":
      return fields.client.name;
    case "description":
      return fields.client.description;
    case "resultLabel":
      return record.results[editor.index]?.label ?? "";
    case "resultValue":
      return record.results[editor.index]?.value ?? "";
    case "testimonialQuote":
      return record.testimonial.quote;
    case "testimonialAuthor":
      return record.testimonial.author;
  }
}

/** One change to one field. */
export type FieldChange =
  | { field: "name"; text: string }
  /** Client mode only (Story 4.11a). */
  | { field: "description"; text: string }
  | { field: "resultLabel" | "resultValue"; index: number; text: string }
  | { field: "testimonialQuote" | "testimonialAuthor"; text: string }
  /** `label`: the sector's name, for one just added (not in the loaded list yet). */
  | { field: "sector"; key: string; label?: string }
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
  | { action: "saveCaseTestimonial"; input: { caseId: string; quote: string; author: string } }
  /** Client mode (Story 4.11a): the client's own result rows and testimonial. */
  | { action: "saveClientResults"; input: { clientId: string; results: FieldResult[] } }
  | { action: "saveClientTestimonial"; input: { clientId: string; quote: string; author: string } };

/**
 * The saves a field edit goes through (the page passes the server actions): the client's
 * `updateClient` and `addClientSector` (`manage clients`), the case's `updateCaseFields`,
 * `saveCaseResults` and `saveCaseTestimonial` (`fill details`). Client mode (Story 4.11a)
 * passes the client's `saveClientResults` and `saveClientTestimonial` instead of the case's.
 */
export interface FieldActions {
  updateClient: (input: Extract<FieldSave, { action: "updateClient" }>["input"]) => Promise<ActionResult<unknown>>;
  addClientSector: (input: { label: string }) => Promise<ActionResult<ClientSector>>;
  updateCaseFields?: (input: Extract<FieldSave, { action: "updateCaseFields" }>["input"]) => Promise<ActionResult<unknown>>;
  saveCaseResults?: (input: Extract<FieldSave, { action: "saveCaseResults" }>["input"]) => Promise<ActionResult<unknown>>;
  saveCaseTestimonial?: (input: Extract<FieldSave, { action: "saveCaseTestimonial" }>["input"]) => Promise<ActionResult<unknown>>;
  saveClientResults?: (input: Extract<FieldSave, { action: "saveClientResults" }>["input"]) => Promise<ActionResult<unknown>>;
  saveClientTestimonial?: (input: Extract<FieldSave, { action: "saveClientTestimonial" }>["input"]) => Promise<ActionResult<unknown>>;
}

/** A save whose action the page did not pass (never in practice: each mode passes its own). */
const NO_ACTION: ActionResult<never> = { ok: false, status: 500, error: { code: "FIELD_ACTION_MISSING", message: "No action for this field." } };

/** Runs `save` through its action. */
export function runFieldSave(actions: FieldActions, save: FieldSave): Promise<ActionResult<unknown>> {
  const run = <I>(action: ((input: I) => Promise<ActionResult<unknown>>) | undefined, input: I) =>
    action === undefined ? Promise.resolve(NO_ACTION) : action(input);
  switch (save.action) {
    case "updateClient":
      return actions.updateClient(save.input);
    case "updateCaseFields":
      return run(actions.updateCaseFields, save.input);
    case "saveCaseResults":
      return run(actions.saveCaseResults, save.input);
    case "saveCaseTestimonial":
      return run(actions.saveCaseTestimonial, save.input);
    case "saveClientResults":
      return run(actions.saveClientResults, save.input);
    case "saveClientTestimonial":
      return run(actions.saveClientTestimonial, save.input);
  }
}

/** Why a change saves nothing: `unchanged` quietly, any other with a message (`refusalMessage`). */
export type FieldRefusal =
  | { reason: "unchanged" }
  | { reason: "needLogo" | "needClientInfo" | "needService" | "required" | "noRow" | "authorWithoutQuote" }
  | { reason: "tooLong"; max: number }
  | { reason: "yearRange"; min: number; max: number };

export type FieldPlan<F extends AnyEditableFields = EditableFields> = ({ ok: true; save: FieldSave; next: F }) | ({ ok: false } & FieldRefusal);

/** Typed words as stored: one line (a field has no line breaks), trimmed. */
export const fieldText = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

/** Length in characters (code points), as the server counts the case's texts. */
const chars = (text: string) => [...text].length;

const refuse = (refusal: FieldRefusal): { ok: false } & FieldRefusal => ({ ok: false, ...refusal });

/**
 * The save that `change` makes on top of the stored `fields`, with the fields as they are
 * after it (`next`): the client's other fields, the case's other result rows, the other half
 * of the testimonial, the year with the services and the services with the year, as stored.
 * Words are trimmed; the same value again saves nothing (`unchanged`). The checks are the
 * server's, so most refusals never reach it.
 *
 * Client mode (Story 4.11a, `ClientEditableFields`): the client's own fields only; the result
 * rows and the testimonial save through `saveClientResults` and `saveClientTestimonial`, the
 * description through `updateClient`; a case field (year, service) saves nothing.
 */
export function planFieldSave<F extends AnyEditableFields>(
  fields: F,
  change: FieldChange,
  caseId: string,
  options: Pick<FieldOptions, "limits" | "years" | "businessLines">,
): FieldPlan<F> {
  return (isClientFields(fields) ? planClientFieldSave(fields, change, options) : planCaseFieldSave(fields, change, caseId, options)) as FieldPlan<F>;
}

function planCaseFieldSave(fields: EditableFields, change: FieldChange, caseId: string, options: Pick<FieldOptions, "limits" | "years" | "businessLines">): FieldPlan {
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
    // Typed only in client mode (Story 4.11a): a case page never binds the description to an editor.
    case "description":
      return refuse({ reason: "unchanged" });
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
      // In `BUSINESS_LINES` order, as the server stores them.
      const lines = options.businessLines.filter((line) => (line === change.line ? !on : story.businessLines.includes(line)));
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

/** The client-mode half of `planFieldSave` (Story 4.11a). */
function planClientFieldSave(fields: ClientEditableFields, change: FieldChange, options: Pick<FieldOptions, "limits">): FieldPlan<ClientEditableFields> {
  const { limits } = options;
  const client = fields.client;
  const record = fields.record;

  const saveClient = (patch: Partial<ClientEditableFields["client"]>): FieldPlan<ClientEditableFields> => {
    const next = { ...client, ...patch };
    if (next.logoId === null) return refuse({ reason: "needLogo" });
    if (next.industry === null || next.description.trim() === "") return refuse({ reason: "needClientInfo" });
    return {
      ok: true,
      save: { action: "updateClient", input: { clientId: next.id, name: next.name, industry: next.industry, description: next.description, logoId: next.logoId } },
      next: { ...fields, client: next },
    };
  };

  switch (change.field) {
    case "name": {
      const name = fieldText(change.text);
      if (name === client.name) return refuse({ reason: "unchanged" });
      if (name === "") return refuse({ reason: "required" });
      if (chars(name) > limits.nameMax) return refuse({ reason: "tooLong", max: limits.nameMax });
      return saveClient({ name });
    }
    case "description": {
      // A paragraph: its line breaks stay, only the ends are trimmed.
      const description = change.text.trim();
      if (description === client.description) return refuse({ reason: "unchanged" });
      if (description === "") return refuse({ reason: "required" });
      if (chars(description) > limits.descriptionMax) return refuse({ reason: "tooLong", max: limits.descriptionMax });
      return saveClient({ description });
    }
    case "sector":
      return change.key === client.industry ? refuse({ reason: "unchanged" }) : saveClient({ industry: change.key });
    case "logo":
      return change.logoId === client.logoId ? refuse({ reason: "unchanged" }) : saveClient({ logoId: change.logoId });
    case "year":
    case "service":
      // No case binding in client mode.
      return refuse({ reason: "unchanged" });
    case "resultLabel":
    case "resultValue": {
      const row = record.results[change.index];
      if (row === undefined) return refuse({ reason: "noRow" });
      const text = fieldText(change.text);
      const key = change.field === "resultLabel" ? "label" : "value";
      if (text === row[key]) return refuse({ reason: "unchanged" });
      if (text === "") return refuse({ reason: "required" });
      const max = key === "label" ? limits.resultLabelMax : limits.resultValueMax;
      if (chars(text) > max) return refuse({ reason: "tooLong", max });
      const results = record.results.map((r, i) => (i === change.index ? { ...r, [key]: text } : { ...r }));
      return { ok: true, save: { action: "saveClientResults", input: { clientId: client.id, results } }, next: { ...fields, record: { ...record, results } } };
    }
    case "testimonialQuote":
    case "testimonialAuthor": {
      const text = fieldText(change.text);
      const key = change.field === "testimonialQuote" ? "quote" : "author";
      if (text === record.testimonial[key]) return refuse({ reason: "unchanged" });
      const max = key === "quote" ? limits.testimonialQuoteMax : limits.testimonialAuthorMax;
      if (chars(text) > max) return refuse({ reason: "tooLong", max });
      const testimonial = { ...record.testimonial, [key]: text };
      if (testimonial.quote === "" && testimonial.author !== "") return refuse({ reason: "authorWithoutQuote" });
      return {
        ok: true,
        save: { action: "saveClientTestimonial", input: { clientId: client.id, quote: testimonial.quote, author: testimonial.author } },
        next: { ...fields, record: { ...record, testimonial } },
      };
    }
  }
}

/** The words for a refused change (never called for `unchanged`). */
export function refusalMessage(refusal: Exclude<FieldRefusal, { reason: "unchanged" }>, mode: "case" | "client" = "case"): string {
  const t = it.configurator.fields;
  switch (refusal.reason) {
    case "noRow":
      // Client mode (Story 4.11a): the row is the client's, not a case's.
      return mode === "client" ? it.configurator.clientMode.noRow : t.noRow;
    case "tooLong":
      return fill(t.tooLong, { max: refusal.max });
    case "yearRange":
      return fill(t.yearRange, { min: refusal.min, max: refusal.max });
    default:
      return t[refusal.reason];
  }
}

/** The words for a save the server refused, by its code; client mode (Story 4.11a) names the intro, not a case. */
export function saveErrorMessage(code: string | undefined, mode: "case" | "client" = "case"): string {
  const errors: Readonly<Record<string, string>> = mode === "client" ? { ...it.configurator.fields.errors, ...it.configurator.clientMode.errors } : it.configurator.fields.errors;
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
export function shownValues(values: BoundValues, next: AnyEditableFields, change: FieldChange, ctx: ShownContext): BoundValues {
  const sector =
    change.field === "sector" && change.label !== undefined ? change.label : ctx.sectors.find((s) => s.key === next.client.industry)?.label;
  // Client mode (Story 4.11a): the client's own description, rows and testimonial; the case's values stay.
  if (isClientFields(next)) {
    return {
      client: {
        ...values.client,
        name: next.client.name,
        description: next.client.description,
        ...(sector === undefined ? {} : { sector }),
        ...(change.field === "logo" && change.previewUrl !== null ? { logoUrl: change.previewUrl } : {}),
        results: next.record.results.map((r) => ({ ...r })),
        testimonial: next.record.testimonial.quote === "" ? null : { ...next.record.testimonial },
      },
      case: values.case,
    };
  }
  const story = next.case;
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
