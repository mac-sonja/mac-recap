import { CURRENT_SCHEMA_VERSION, type CaseStudyDocument, type DocumentElement, type Page } from "@/modules/generation";
import { composeParts, type BoundValues, type ComposePart, type FormatId } from "@/modules/rendering";
import type { BusinessLine } from "@/modules/case-study";

/**
 * Story 5.10a, client-safe: a collection as its page draws it. Every page is a revision's own
 * (the live approved one), never copied; the collection only says which cases, in which order.
 * Story 5.11a: the collection's own edits (words of free texts, hidden pages, page orders) are
 * laid over each part's pages before they are composed; the originals stay as they are.
 */

/** A part of the collection: `case:{caseId}`, or `client_intro:{clientId}` (a client's intro document: its intro and its closing). */
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
export function partOfKey(partKey: PartKey): { kind: "case" | "client_intro"; id: string } {
  const at = partKey.indexOf(":");
  return { kind: partKey.slice(0, at) === "client_intro" ? "client_intro" : "case", id: partKey.slice(at + 1) };
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

/** A page of a segment: shown, or hidden by the collection (it then shows as a strip with **Ripristina**). */
export interface SegmentEntry {
  /** The page as drawn (its key prefixed with the segment's, its free texts with the collection's words). */
  page: Page;
  /** Its key in the part's document. */
  pageKey: string;
  hidden: boolean;
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

/** Whether `el` is a free text: its own words, not a client or case field. */
const isFreeText = (el: DocumentElement): el is Extract<DocumentElement, { type: "text" }> & { text: string } =>
  el.type === "text" && el.text !== undefined && el.binding === undefined && el.bindings === undefined;

/** Free text `elementId` of `page` (inside Testi groups and rows too), or null: a field, an image, or not there. */
export function freeTextIn(page: Page, elementId: string): string | null {
  const walk = (elements: readonly DocumentElement[]): string | null | undefined => {
    for (const el of elements) {
      if (el.elementId === elementId) return isFreeText(el) ? el.text : null;
      if (el.type === "text_group" || el.type === "row") {
        const found = walk(el.items);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  for (const block of page.blocks) {
    const found = walk(block.elements);
    if (found !== undefined) return found;
  }
  return null;
}

/** The text edits of one page of a part in a format. */
export const pageTextEdits = (edits: ViewEdits, partKey: PartKey, formatId: string, pageKey: string) =>
  edits.texts.filter((t) => t.partKey === partKey && t.formatId === formatId && t.pageKey === pageKey);

/** A page with the collection's words, by its original page object and the words: the same object every time, so an untouched page keeps its drawing. */
const worded = new WeakMap<Page, Map<string, Page>>();
function withWords(page: Page, texts: readonly ViewTextEdit[]): Page {
  if (texts.length === 0) return page;
  const signature = JSON.stringify(texts.map((t) => [t.elementId, t.text]));
  let bySignature = worded.get(page);
  if (bySignature === undefined) {
    bySignature = new Map();
    worded.set(page, bySignature);
  }
  const cached = bySignature.get(signature);
  if (cached !== undefined) return cached;
  const words = new Map(texts.map((t) => [t.elementId, t.text]));
  const copy = structuredClone(page);
  const walk = (elements: DocumentElement[]) => {
    for (const el of elements) {
      // Only a free text takes the collection's words: a field stays the record's.
      if (isFreeText(el) && words.has(el.elementId)) el.text = words.get(el.elementId)!;
      if (el.type === "text_group" || el.type === "row") walk(el.items as DocumentElement[]);
    }
  };
  for (const block of copy.blocks) walk(block.elements);
  bySignature.set(signature, copy);
  return copy;
}

/**
 * A part's pages in a format in the collection's order, the hidden ones included: the saved
 * order first (keys no longer in the document skipped), then any page it doesn't name, in the
 * document's order.
 */
export function orderedPages(pages: readonly Page[], partKey: PartKey, formatId: string, edits: ViewEdits): readonly Page[] {
  const order = edits.orders.find((o) => o.partKey === partKey && o.formatId === formatId);
  if (order === undefined) return pages;
  const byKey = new Map(pages.map((p) => [p.pageKey, p]));
  const named = order.pageKeys.flatMap((key) => byKey.get(key) ?? []);
  const seen = new Set(named.map((p) => p.pageKey));
  return [...named, ...pages.filter((p) => !seen.has(p.pageKey))];
}

/** The hidden page keys of a part in a format. */
const hiddenOf = (edits: ViewEdits, partKey: PartKey, formatId: string) =>
  new Set(edits.hidden.filter((h) => h.partKey === partKey && h.formatId === formatId).map((h) => h.pageKey));

/** A part's pages as a document `composeParts` reads: in `formatId`, in the collection's order with its words (hidden pages included). */
const docOf = (part: PartPages, kind: "case_history" | "client_intro", partKey: PartKey, formatId: FormatId, edits: ViewEdits): CaseStudyDocument =>
  ({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind,
    template: part.template,
    formats: Object.fromEntries(
      Object.entries(part.formats).map(([id, pages]) => [
        id,
        { pages: id === formatId ? orderedPages(pages, partKey, formatId, edits).map((p) => withWords(p, pageTextEdits(edits, partKey, formatId, p.pageKey))) : pages },
      ]),
    ),
  }) as CaseStudyDocument;

/**
 * The collection's pages in one format, as `composeParts` lays them out by default (C38): for
 * each client with an approved intro and 2 or more cases with pages, its intro, its cases without
 * their own intro pages (and Carosello Chiusura), then its closing once; otherwise each case
 * whole. Groups are given already grouped by client, so the order stays the collection's. A case
 * with no approved revision gets an empty `unavailable` segment where it sits.
 */
export function collectionSegments(groups: readonly CollectionGroup[], formatId: FormatId, edits: ViewEdits = NO_EDITS): ViewSegment[] {
  const parts: ComposePart[] = [];
  for (const group of groups) {
    const introKey = `client_intro:${group.clientId}`;
    if (group.intro !== null) parts.push({ kind: "client_intro", clientId: group.clientId, doc: docOf(group.intro, "client_intro", introKey, formatId, edits), assets: {}, values: group.intro.values });
    for (const c of group.cases) {
      if (c.part !== null) {
        parts.push({ kind: "case_history", caseId: c.caseId, clientId: group.clientId, doc: docOf(c.part, "case_history", `case:${c.caseId}`, formatId, edits), assets: {}, values: c.part.values });
      }
    }
  }
  // Composed with the hidden pages in: each stays in its run, where it sat, as a strip.
  const composed = new Map(composeParts(parts, formatId).segments.map((s) => [s.key, s]));
  const out: ViewSegment[] = [];
  const add = (key: string, kind: ViewSegment["kind"], clientId: string, part: PartPages, partKey: PartKey, caseId?: string) => {
    const hidden = hiddenOf(edits, partKey, formatId);
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

/** The original pages of a part, by its key (a case's live revision, or its client's intro document); undefined when it has none. */
export function partPagesOf(groups: readonly CollectionGroup[], partKey: PartKey): PartPages | undefined {
  const { kind, id } = partOfKey(partKey);
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
