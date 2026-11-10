import { CURRENT_SCHEMA_VERSION, type CaseStudyDocument, type Page } from "@/modules/generation";
import { composeParts, type BoundValues, type ComposePart, type FormatId } from "@/modules/rendering";
import type { BusinessLine } from "@/modules/case-study";

/**
 * Story 5.10a, client-safe: a collection as its page draws it. Every page is a revision's own
 * (the live approved one), never copied; the collection only says which cases, in which order.
 */

/** A document's pages as the canvas draws them: its template, every format's pages, its bound values. */
export interface PartPages {
  template: string;
  formats: Readonly<Record<FormatId, readonly Page[]>>;
  values: BoundValues;
}

/** One case of the collection. `part` null: it has no approved revision any more ("Non disponibile"). */
export interface CollectionCase {
  caseId: string;
  name: string;
  code: string;
  part: PartPages | null;
}

/**
 * One client's group: its cases in order, and its approved intro document (null when it has none,
 * or fewer than two of its cases are in the collection: the intro then never shows).
 */
export interface CollectionGroup {
  clientId: string;
  clientName: string;
  intro: PartPages | null;
  cases: CollectionCase[];
}

/** An approved case that **Aggiungi casi** can offer: what the list shows, searches and matches against the tags. */
export interface CollectionCandidate {
  id: string;
  name: string;
  code: string;
  clientName: string;
  clientCode: string;
  businessLines: readonly BusinessLine[];
  /** Its client's sector key, or null. */
  industry: string | null;
}

/** One run of the collection's pages in a format: a client's intro or closing, a case, or a case with no pages any more. */
export interface ViewSegment {
  /** Unique in the collection: `client_intro:{clientId}`, `case:{caseId}`, `client_closing:{clientId}`. */
  key: string;
  kind: "intro" | "case" | "closing" | "unavailable";
  clientId: string;
  caseId?: string;
  template: string;
  values: BoundValues;
  /** The revision's pages, their keys prefixed with the segment's (`{segment}|{pageKey}`): keys repeat across cases. */
  pages: readonly Page[];
}

/** No bound values: a case with no pages draws nothing. */
export const EMPTY_VALUES: BoundValues = {
  client: { name: "", sector: "", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: null, services: [], results: [], testimonial: null },
};

/** A page shown, by its revision's own page object and segment: the same object every time, so an untouched page keeps its drawing. */
const shown = new WeakMap<Page, Map<string, Page>>();
function prefixed(page: Page, segment: string): Page {
  let bySegment = shown.get(page);
  if (bySegment === undefined) {
    bySegment = new Map();
    shown.set(page, bySegment);
  }
  let out = bySegment.get(segment);
  if (out === undefined) {
    out = { ...page, pageKey: `${segment}|${page.pageKey}` };
    bySegment.set(segment, out);
  }
  return out;
}

/** A part's pages as a document `composeParts` reads (its pages untouched). */
const docOf = (part: PartPages, kind: "case_history" | "client_intro"): CaseStudyDocument =>
  ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind,
    template: part.template,
    formats: Object.fromEntries(Object.entries(part.formats).map(([id, pages]) => [id, { pages }])),
  }) as CaseStudyDocument;

/**
 * The collection's pages in one format, as `composeParts` lays them out by default (C38): for
 * each client with an approved intro and 2 or more cases with pages, its intro, its cases without
 * their own intro pages (and Carosello Chiusura), then its closing once; otherwise each case
 * whole. Groups are given already grouped by client, so the order stays the collection's. A case
 * with no approved revision gets an empty `unavailable` segment where it sits.
 */
export function collectionSegments(groups: readonly CollectionGroup[], formatId: FormatId): ViewSegment[] {
  const parts: ComposePart[] = [];
  for (const group of groups) {
    if (group.intro !== null) parts.push({ kind: "client_intro", clientId: group.clientId, doc: docOf(group.intro, "client_intro"), assets: {}, values: group.intro.values });
    for (const c of group.cases) {
      if (c.part !== null) parts.push({ kind: "case_history", caseId: c.caseId, clientId: group.clientId, doc: docOf(c.part, "case_history"), assets: {}, values: c.part.values });
    }
  }
  const composed = new Map(composeParts(parts, formatId).segments.map((s) => [s.key, s]));
  const out: ViewSegment[] = [];
  const add = (key: string, kind: ViewSegment["kind"], clientId: string, part: PartPages, caseId?: string) => {
    const pages = composed.get(key)?.pages ?? [];
    out.push({ key, kind, clientId, ...(caseId === undefined ? {} : { caseId }), template: part.template, values: part.values, pages: pages.map((p) => prefixed(p, key)) });
  };
  for (const group of groups) {
    const introKey = `client_intro:${group.clientId}`;
    const wraps = group.intro !== null && composed.has(introKey);
    if (wraps) add(introKey, "intro", group.clientId, group.intro!);
    for (const c of group.cases) {
      if (c.part === null) {
        const fallback = group.intro ?? group.cases.find((x) => x.part !== null)?.part;
        out.push({ key: `case:${c.caseId}`, kind: "unavailable", clientId: group.clientId, caseId: c.caseId, template: fallback?.template ?? "", values: fallback?.values ?? EMPTY_VALUES, pages: [] });
      } else add(`case:${c.caseId}`, "case", group.clientId, c.part, c.caseId);
    }
    const closingKey = `client_closing:${group.clientId}`;
    if (wraps && composed.has(closingKey)) add(closingKey, "closing", group.clientId, group.intro!);
  }
  return out;
}

/** `list` with the entry at `from` moved to `to` (clamped). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, entry!);
  return next;
}

/** `groups` with client `clientId`'s group at place `to`; `groups` itself when it isn't there or doesn't move. */
export function withGroupMoved(groups: readonly CollectionGroup[], clientId: string, to: number): readonly CollectionGroup[] {
  const from = groups.findIndex((g) => g.clientId === clientId);
  if (from < 0 || from === Math.max(0, Math.min(groups.length - 1, to))) return groups;
  return moved(groups, from, to);
}

/** `groups` with case `caseId` at place `to` within its own group; `groups` itself when it isn't there or doesn't move. */
export function withCaseMoved(groups: readonly CollectionGroup[], caseId: string, to: number): readonly CollectionGroup[] {
  const at = groups.findIndex((g) => g.cases.some((c) => c.caseId === caseId));
  if (at < 0) return groups;
  const group = groups[at]!;
  const from = group.cases.findIndex((c) => c.caseId === caseId);
  if (from === Math.max(0, Math.min(group.cases.length - 1, to))) return groups;
  return groups.map((g, i) => (i === at ? { ...g, cases: moved(g.cases, from, to) } : g));
}

/** The client a case is in, or undefined. */
export const groupOfCase = (groups: readonly CollectionGroup[], caseId: string) => groups.find((g) => g.cases.some((c) => c.caseId === caseId));

/** Whether a candidate matches the collection's tags: one of its business lines, or its client's industry. */
export const matchesTags = (candidate: CollectionCandidate, tags: { businessLines: readonly string[]; industries: readonly string[] }) =>
  candidate.businessLines.some((line) => tags.businessLines.includes(line)) || (candidate.industry !== null && tags.industries.includes(candidate.industry));
