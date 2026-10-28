import type { ReactElement } from "react";
import type { DocumentKind, Page } from "@/modules/generation";
import { isFormatId, type FormatId } from "@/modules/rendering/domain/formats";
import { macCaseV1 } from "@/modules/rendering/templates/mac-case/v1";
import type { DefaultPage, Layout, RenderInput, TemplateContext, TemplateVersion } from "@/modules/rendering/templates/types";

/**
 * The template registry (Story 3.4): templates as versioned code under
 * `rendering/templates/{id}/v{n}/`, keyed by the ref documents store (`{id}@{version}`).
 * No template value lives in the database or can change at runtime. A published
 * version folder is immutable (`templates.test.ts` hashes it against `hashes.json`).
 */
export const templates: Readonly<Record<string, TemplateVersion>> = Object.freeze({
  [macCaseV1.ref]: macCaseV1,
});

/** The template a new case history is built from. */
export const CASE_TEMPLATE = macCaseV1.ref;

const templateOf = (ref: string): TemplateVersion | undefined => (Object.hasOwn(templates, ref) ? templates[ref] : undefined);

const required = (ref: string): TemplateVersion => {
  const found = templateOf(ref);
  if (found === undefined) throw new Error(`template ${ref} is not in the registry`);
  return found;
};

/** A format's layouts, in order: the only layout list for generation and the configurator's Layout. */
export const layouts = (formatId: FormatId, template: string = CASE_TEMPLATE): readonly Layout[] => required(template).layouts(formatId);

/** A format's default pages, in order: the configurator's Pagine di default. */
export const defaultPages = (formatId: FormatId, template: string = CASE_TEMPLATE): readonly DefaultPage[] =>
  required(template).defaultPages(formatId);

/** A format's seven text styles. */
export const textStyles = (formatId: FormatId, template: string = CASE_TEMPLATE) => required(template).textStyles(formatId);

/**
 * The pages a new document of `kind` starts with in one format, built from `ctx`.
 * `[]` for a template or format this registry doesn't know, and for a client intro
 * (its template arrives with Stories 3.9 and 3.11).
 */
export function starterPages(template: string, kind: DocumentKind, formatId: string, ctx: TemplateContext): Page[] {
  const found = templateOf(template);
  if (kind !== "case_history" || found === undefined || !isFormatId(formatId)) return [];
  return found.starterPages(formatId, ctx);
}

/**
 * One format's pages drawn by the template's renderer (Story 3.5): a pure function of
 * the pages, asset URLs and current bound values. The same element serves the
 * configurator, the case study view, shared links and exports (`renderToStaticMarkup`).
 * Throws for a template that isn't registered or has no renderer (a bug).
 */
export function renderFormat(template: string, formatId: FormatId, input: RenderInput): ReactElement {
  const found = required(template);
  if (found.render === undefined) throw new Error(`template ${template} has no renderer`);
  return found.render(formatId, input);
}

export { TEMPLATE_TEXT_KEYS } from "@/modules/rendering/templates/types";
export type {
  BoundResult,
  BoundTestimonial,
  BoundValues,
  DefaultPage,
  GridArea,
  Layout,
  RenderAsset,
  RenderInput,
  RenderOptions,
  TemplateContext,
  TemplateTextKey,
  TemplateVersion,
  TextStyleSpec,
} from "@/modules/rendering/templates/types";
