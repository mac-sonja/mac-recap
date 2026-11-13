import { CURRENT_SCHEMA_VERSION, type CaseStudyDocument, type Page } from "@/modules/generation";
import {
  applyCollectionEdits,
  BRAND_PAGES,
  BRAND_PART_KEY,
  BRAND_TEMPLATE,
  FORMAT_IDS,
  freeTextIn,
  hasBrandPages,
  normalisePartKey,
  orderedPages,
  pageTextEdits,
  wordedPage,
  type BoundValues,
  type ComposePart,
  type FormatId,
} from "@/modules/rendering";
import type { BusinessLine } from "@/modules/case-study";

/**
 * Story 5.10a, client-safe: a collection as its page draws it. Every page is a revision's own
 * (the live approved one), never copied; the collection only says which cases, in which order.
 * Story 5.11a: the collection's own edits (words of free texts, hidden pages, page orders) are
 * laid over each part's pages before they are composed; the originals stay as they are.
 */

/**
 * A part of the collection: `case:{caseId}`, `client_intro:{clientId}` (a client's intro document:
 * its intro and its closing), or `BRAND_PART_KEY` (MAC's intro and outro of Presentazione).
 */
export type PartKey = string;

/** The collection's words for one free text of a part's page in a format. */
export interface ViewTextEdit {
  partKey: PartKey;
  formatId: string;
  pageKey: string;
  elementId: string;
  text: string;
  /** The original's words changed since the edit was saved: the collection keeps its own ("Il testo originale è cambiato"). */
  originalChanged: boolean;
}

/** A page the collection leaves out. */
export interface ViewHiddenPage {
  partKey: PartKey;
  formatId: string;
  pageKey: string;
}

/** A part's page keys in a format, in the collection's order. */
export interface ViewPageOrder {
  partKey: PartKey;
  formatId: string;
  pageKeys: readonly string[];
}

/** Every edit of the collection (Story 5.11a), as the page applies them. */
export interface ViewEdits {
  texts: readonly ViewTextEdit[];
  hidden: readonly ViewHiddenPage[];
  orders: readonly ViewPageOrder[];
}

export const NO_EDITS: ViewEdits = { texts: [], hidden: [], orders: [] };

/** The part a part key names, as the actions take it. */
export function partOfKey(partKey: PartKey): { kind: "case" | "client_intro" | "brand"; id: string } {
  const at = partKey.indexOf(":");
  const kind = partKey.slice(0, at);
  return { kind: kind === "client_intro" || kind === "brand" ? kind : "case", id: partKey.slice(at + 1) };
}

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

/** A page of a segment: shown, or hidden by the collection (it then leaves the canvas, and shows faded in Pagine with **Mostra**). */
export interface SegmentEntry {
  /** The page as drawn (its key prefixed with the segment's, its free texts with the collection's words). */
  page: Page;
  /** Its key in the part's document. */
  pageKey: string;
  hidden: boolean;
}

/** One run of the collection's pages in a format: MAC's intro or outro, a client's intro or closing, a case, or a case with no pages any more. */
export interface ViewSegment {
  /** Unique in the collection: `brand_intro`, `client_intro:{clientId}`, `case:{caseId}`, `client_closing:{clientId}`, `brand_outro`. */
  key: string;
  kind: "brand_intro" | "intro" | "case" | "closing" | "unavailable" | "brand_outro";
  /** The client's id; `""` for MAC's pages. */
  clientId: string;
  caseId?: string;
  template: string;
  values: BoundValues;
  /** The revision's pages shown, their keys prefixed with the segment's (`{segment}|{pageKey}`): keys repeat across cases. */
  pages: readonly Page[];
  /** Story 5.11a: the part the pages come from (a closing's is its client's intro document). */
  partKey: PartKey;
  /** Story 5.11a: every page of the run in the collection's order, the hidden ones included. */
  entries: readonly SegmentEntry[];
}

/** No bound values: a case with no pages draws nothing. */
export const EMPTY_VALUES: BoundValues = {
  client: { name: "", sector: "", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: null, services: [], results: [], testimonial: null },
};

/** MAC's pages as a part: the rendering module's constants, in Presentazione only. */
export const BRAND_PART: PartPages = {
  template: BRAND_TEMPLATE,
  formats: Object.fromEntries(FORMAT_IDS.map((id) => [id, hasBrandPages(id) ? BRAND_PAGES : []])) as Record<FormatId, readonly Page[]>,
  values: EMPTY_VALUES,
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

// Story 5.11b: the rules that lay the edits over a part's pages live in the rendering module, so
// the page and the export apply them the same way; the page keeps its drawing caches and strips.
export { freeTextIn, orderedPages, pageTextEdits };

/** A page with the collection's words, by its original page object and the words: the same object every time, so an untouched page keeps its drawing. */
const worded = new WeakMap<Page, Map<string, Page>>();
function withWords(page: Page, texts: readonly { elementId: string; text: string }[]): Page {
  if (texts.length === 0) return page;
  const signature = JSON.stringify(texts.map((t) => [t.elementId, t.text]));
  let bySignature = worded.get(page);
  if (bySignature === undefined) {
    bySignature = new Map();
    worded.set(page, bySignature);
  }
  const cached = bySignature.get(signature);
  if (cached !== undefined) return cached;
  const copy = wordedPage(page, texts);
  bySignature.set(signature, copy);
  return copy;
}

/** A part's pages as a document `composeParts` reads (the edits are laid over by `applyCollectionEdits`). */
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
 * with no approved revision gets an empty `unavailable` segment where it sits. In Presentazione
 * MAC's intro opens the file and its outro closes it (part `BRAND_PART_KEY`).
 */
export function collectionSegments(groups: readonly CollectionGroup[], formatId: FormatId, edits: ViewEdits = NO_EDITS): ViewSegment[] {
  const parts: ComposePart[] = [];
  for (const group of groups) {
    if (group.intro !== null) parts.push({ kind: "client_intro", clientId: group.clientId, doc: docOf(group.intro, "client_intro"), assets: {}, values: group.intro.values });
    for (const c of group.cases) {
      if (c.part !== null) {
        parts.push({ kind: "case_history", caseId: c.caseId, clientId: group.clientId, doc: docOf(c.part, "case_history"), assets: {}, values: c.part.values });
      }
    }
  }
  // The export's rules (Story 5.11b): order and words laid over, and which pages are hidden, a
  // part never showing no page. Composed with the hidden pages in: each stays in its run's
  // entries (Pagine shows it faded), out of its shown pages.
  const applied = applyCollectionEdits(parts, formatId, edits, { wordPage: withWords });
  const composed = new Map(applied.composed.segments.map((s) => [s.key, s]));
  const out: ViewSegment[] = [];
  const add = (key: string, kind: ViewSegment["kind"], clientId: string, part: PartPages, partKey: PartKey, caseId?: string) => {
    const hidden = applied.hidden.get(normalisePartKey(partKey)) ?? new Set<string>();
    const entries = (composed.get(key)?.pages ?? []).map((p) => ({ page: prefixed(p, key), pageKey: p.pageKey, hidden: hidden.has(p.pageKey) }));
    out.push({
      key,
      kind,
      clientId,
      ...(caseId === undefined ? {} : { caseId }),
      template: part.template,
      values: part.values,
      pages: entries.filter((e) => !e.hidden).map((e) => e.page),
      partKey,
      entries,
    });
  };
  if (composed.has("brand_intro")) add("brand_intro", "brand_intro", "", BRAND_PART, BRAND_PART_KEY);
  for (const group of groups) {
    const introKey = `client_intro:${group.clientId}`;
    const wraps = group.intro !== null && composed.has(introKey);
    if (wraps) add(introKey, "intro", group.clientId, group.intro!, introKey);
    for (const c of group.cases) {
      const caseKey = `case:${c.caseId}`;
      if (c.part === null) {
        const fallback = group.intro ?? group.cases.find((x) => x.part !== null)?.part;
        out.push({
          key: caseKey,
          kind: "unavailable",
          clientId: group.clientId,
          caseId: c.caseId,
          template: fallback?.template ?? "",
          values: fallback?.values ?? EMPTY_VALUES,
          pages: [],
          partKey: caseKey,
          entries: [],
        });
      } else add(caseKey, "case", group.clientId, c.part, caseKey, c.caseId);
    }
    const closingKey = `client_closing:${group.clientId}`;
    if (wraps && composed.has(closingKey)) add(closingKey, "closing", group.clientId, group.intro!, introKey);
  }
  if (composed.has("brand_outro")) add("brand_outro", "brand_outro", "", BRAND_PART, BRAND_PART_KEY);
  return out;
}

/**
 * Typed words as the collection keeps them (the module normalises the same way): no-break spaces
 * as plain spaces, no trailing spaces or line breaks.
 */
export const normaliseTyped = (text: string) => text.replaceAll("\u00a0", " ").trimEnd();

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

/** The original pages of a part, by its key (a case's live revision, its client's intro document, or MAC's pages); undefined when it has none. */
export function partPagesOf(groups: readonly CollectionGroup[], partKey: PartKey): PartPages | undefined {
  const { kind, id } = partOfKey(partKey);
  if (kind === "brand") return partKey === BRAND_PART_KEY ? BRAND_PART : undefined;
  for (const group of groups) {
    if (kind === "client_intro" && group.clientId === id) return group.intro ?? undefined;
    const found = kind === "case" ? group.cases.find((c) => c.caseId === id) : undefined;
    if (found !== undefined) return found.part ?? undefined;
  }
  return undefined;
}

/** A free text's original words: what its part's live approved page says now; null when it isn't there any more. */
export function originalText(groups: readonly CollectionGroup[], partKey: PartKey, formatId: FormatId, pageKey: string, elementId: string): string | null {
  const page = partPagesOf(groups, partKey)?.formats[formatId]?.find((p) => p.pageKey === pageKey);
  return page === undefined ? null : freeTextIn(page, elementId);
}

/** `edits` with the collection's words for one free text (`text` null: the edit removed, the original back). */
export function withTextEdit(edits: ViewEdits, ref: Omit<ViewTextEdit, "text" | "originalChanged">, text: string | null): ViewEdits {
  const same = (t: ViewTextEdit) => t.partKey === ref.partKey && t.formatId === ref.formatId && t.pageKey === ref.pageKey && t.elementId === ref.elementId;
  const rest = edits.texts.filter((t) => !same(t));
  return { ...edits, texts: text === null ? rest : [...rest, { ...ref, text, originalChanged: false }] };
}

/** `edits` with one page hidden or shown again. */
export function withPageHidden(edits: ViewEdits, page: ViewHiddenPage, hidden: boolean): ViewEdits {
  const rest = edits.hidden.filter((h) => !(h.partKey === page.partKey && h.formatId === page.formatId && h.pageKey === page.pageKey));
  return { ...edits, hidden: hidden ? [...rest, page] : rest };
}

/** `edits` with a part's page order in a format. */
export function withPageOrder(edits: ViewEdits, order: ViewPageOrder): ViewEdits {
  return { ...edits, orders: [...edits.orders.filter((o) => !(o.partKey === order.partKey && o.formatId === order.formatId)), order] };
}

/**
 * A part's whole page order after one of its runs moved its page at `from` to `to` (both
 * places within the run, the hidden pages counted): the run's pages keep the places the part
 * gives them, among the part's other pages (a closing's run moves among its own pages only).
 * Null when nothing moves.
 */
export function movedPageOrder(partOrder: readonly string[], runKeys: readonly string[], from: number, to: number): string[] | null {
  const target = Math.max(0, Math.min(runKeys.length - 1, to));
  if (from < 0 || from >= runKeys.length || from === target) return null;
  const run = moved(runKeys, from, target);
  const inRun = new Set(runKeys);
  let next = 0;
  return partOrder.map((key) => (inRun.has(key) ? run[next++]! : key));
}

/** How many pages of a part the collection shows in a format, across its runs (a client's intro and closing count together). */
export const shownPagesOfPart = (segments: readonly ViewSegment[], partKey: PartKey) =>
  segments.filter((s) => s.partKey === partKey).reduce((n, s) => n + s.pages.length, 0);
