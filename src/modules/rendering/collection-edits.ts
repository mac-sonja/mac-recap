import type { CaseStudyDocument, DocumentElement, Page, TextElement } from "@/modules/generation";
import { composeParts, type ComposedFile, type ComposeOptions, type ComposePart } from "@/modules/rendering/compose";
import type { FormatId } from "@/modules/rendering/domain/formats";

/**
 * Story 5.11b, pure and browser-safe: a collection's own edits (Story 5.11a: the words of free
 * texts, hidden pages, page orders) laid over its parts' documents before they are composed. The
 * one rule set the collection page (`collection-file.ts`) and the collection export both use, so
 * the file equals what the page shows. The originals are never changed: every edited page is a copy.
 *
 * Generation is imported for its types only: its index imports this module at runtime.
 */

/** A part of a collection: `case:{caseId}`, or `client_intro:{clientId}` (a client's intro document: its intro and its closing). */
export type CollectionPartKey = string;

/** The collection's words for one free text of a part's page in a format. */
export interface CollectionTextOverride {
  partKey: CollectionPartKey;
  formatId: string;
  pageKey: string;
  elementId: string;
  text: string;
}

/** A page the collection leaves out. */
export interface CollectionHiddenPageRef {
  partKey: CollectionPartKey;
  formatId: string;
  pageKey: string;
}

/** A part's page keys in a format, in the collection's order. */
export interface CollectionPageOrderRef {
  partKey: CollectionPartKey;
  formatId: string;
  pageKeys: readonly string[];
}

/** Every edit of a collection, as both the page and the export apply them. */
export interface CollectionEditSet {
  texts: readonly CollectionTextOverride[];
  hidden: readonly CollectionHiddenPageRef[];
  orders: readonly CollectionPageOrderRef[];
}

export const NO_COLLECTION_EDITS: CollectionEditSet = Object.freeze({ texts: [], hidden: [], orders: [] });

/** A part key with its id in lower case (ids are uuids; the kind is kept). */
export function normalisePartKey(partKey: CollectionPartKey): CollectionPartKey {
  const at = partKey.indexOf(":");
  return at < 0 ? partKey : `${partKey.slice(0, at)}:${partKey.slice(at + 1).toLowerCase()}`;
}

/** The part key of a composed part: a case by its id, a client's intro document by its client's id. */
export const collectionPartKey = (part: ComposePart): CollectionPartKey =>
  part.kind === "case_history" ? `case:${part.caseId.toLowerCase()}` : `client_intro:${part.clientId.toLowerCase()}`;

const samePart = (a: CollectionPartKey, b: CollectionPartKey) => normalisePartKey(a) === normalisePartKey(b);

/** Whether `el` is a free text: its own words, not a client or case field. */
export const isFreeText = (el: DocumentElement): el is TextElement & { text: string } =>
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
export const pageTextEdits = <T extends CollectionTextOverride>(
  edits: { texts: readonly T[] },
  partKey: CollectionPartKey,
  formatId: string,
  pageKey: string,
): T[] => edits.texts.filter((t) => samePart(t.partKey, partKey) && t.formatId === formatId && t.pageKey === pageKey);

/**
 * A copy of `page` with the collection's words: only free texts take them (inside groups and rows
 * too); a field stays the record's, and an edit whose element is no longer a free text is ignored.
 * `page` itself when there is no edit.
 */
export function wordedPage(page: Page, texts: readonly Pick<CollectionTextOverride, "elementId" | "text">[]): Page {
  if (texts.length === 0) return page;
  const words = new Map(texts.map((t) => [t.elementId, t.text]));
  const copy = structuredClone(page);
  const walk = (elements: DocumentElement[]) => {
    for (const el of elements) {
      if (isFreeText(el) && words.has(el.elementId)) el.text = words.get(el.elementId)!;
      if (el.type === "text_group" || el.type === "row") walk(el.items as DocumentElement[]);
    }
  };
  for (const block of copy.blocks) walk(block.elements);
  return copy;
}

/**
 * A part's pages in a format in the collection's order, the hidden ones included: the saved
 * order first (keys no longer in the document skipped), then any page it doesn't name, in the
 * document's order. The page objects are the given ones.
 */
export function orderedPages(pages: readonly Page[], partKey: CollectionPartKey, formatId: string, edits: Pick<CollectionEditSet, "orders">): readonly Page[] {
  const order = edits.orders.find((o) => samePart(o.partKey, partKey) && o.formatId === formatId);
  if (order === undefined) return pages;
  const byKey = new Map(pages.map((p) => [p.pageKey, p]));
  const named = [...new Set(order.pageKeys)].flatMap((key) => byKey.get(key) ?? []);
  const seen = new Set(named.map((p) => p.pageKey));
  return [...named, ...pages.filter((p) => !seen.has(p.pageKey))];
}

/** The edits of one part that take effect in a format: what an export's content hash covers. Canonical: sorted. */
export interface EffectivePartEdits {
  partKey: CollectionPartKey;
  /** `[pageKey, elementId, text]`, sorted: the collection's words on pages the file shows, where they differ from the page's. */
  texts: readonly (readonly [string, string, string])[];
  /** The pages the collection leaves out that the file would otherwise show, sorted. */
  hidden: readonly string[];
  /** The part's shown pages in the collection's order, when it differs from the document's; else null. */
  order: readonly string[] | null;
}

/** A collection's parts in one format with its edits laid over. */
export interface AppliedCollectionEdits {
  /** The parts, in order, each document's pages in `formatId` in the collection's order and with its words, the hidden pages still in. */
  parts: ComposePart[];
  /** `parts` composed: what the collection page lays out (a hidden page sits where it was, as a strip). */
  composed: ComposedFile;
  /**
   * The page keys each part leaves out, by normalised part key: only pages the file would show, and
   * none of a part whose every shown page is hidden (a part never shows no page).
   */
  hidden: ReadonlyMap<CollectionPartKey, ReadonlySet<string>>;
  /** The parts without their hidden pages: what the file draws. */
  shownParts: ComposePart[];
  /** `shownParts` composed: the file's pages (page numbers run on over the shown pages only). */
  file: ComposedFile;
  /** Per part with an edit that takes effect, sorted by part key. */
  effective: EffectivePartEdits[];
}

export interface ApplyCollectionEditsOptions {
  /** How a page takes its words (the page passes a cached one, so an untouched drawing keeps its objects). Default `wordedPage`. */
  wordPage?: (page: Page, texts: readonly CollectionTextOverride[]) => Page;
  compose?: ComposeOptions;
}

/** `part` with its document's pages in `formatId` replaced by `pages` (the other formats as they are). */
function withPages(part: ComposePart, formatId: FormatId, pages: readonly Page[]): ComposePart {
  const formats = part.doc.formats as Record<string, { pages: readonly Page[] }>;
  if (!Object.hasOwn(formats, formatId)) return part;
  const doc = { ...part.doc, formats: { ...formats, [formatId]: { ...formats[formatId], pages } } } as CaseStudyDocument;
  return { ...part, doc };
}

/** Each part's page keys in a composed file, in order, by normalised part key (a client's intro and closing together). */
function keysByPart(file: ComposedFile): Map<CollectionPartKey, string[]> {
  const out = new Map<CollectionPartKey, string[]>();
  for (const segment of file.segments) {
    const key = collectionPartKey(segment.part);
    const list = out.get(key) ?? [];
    list.push(...segment.pages.map((p) => p.pageKey));
    out.set(key, list);
  }
  return out;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * A collection's parts in `formatId` with its edits laid over (Stories 5.11a/b), as `composeParts`
 * then lays them out:
 * - each part's pages in the collection's order (`orderedPages`);
 * - the collection's words on free texts only (inside groups and rows too); an edit whose element
 *   is no longer a free text is ignored, and an edit whose original changed keeps its words;
 * - hidden pages left out, except that a part whose every page the file would show is hidden
 *   keeps them all (a part never shows no page).
 * A client's intro edits are keyed by its client's id (`client_intro:{clientId}`). Pure: the
 * given documents are not changed, and an untouched page is the given object.
 */
export function applyCollectionEdits(
  parts: readonly ComposePart[],
  formatId: FormatId,
  edits: CollectionEditSet,
  options: ApplyCollectionEditsOptions = {},
): AppliedCollectionEdits {
  const wordPage = options.wordPage ?? wordedPage;
  const texts = edits.texts.filter((t) => t.formatId === formatId);

  const edited = parts.map((part) => {
    const formats = part.doc.formats as Record<string, { pages: readonly Page[] } | undefined>;
    const entry = Object.hasOwn(formats, formatId) ? formats[formatId] : undefined;
    if (entry === undefined) return part;
    const key = collectionPartKey(part);
    const pages = orderedPages(entry.pages, key, formatId, edits).map((page) => {
      const own = pageTextEdits({ texts }, key, formatId, page.pageKey);
      return own.length === 0 ? page : wordPage(page, own);
    });
    return withPages(part, formatId, pages);
  });

  const composed = composeParts(edited, formatId, options.compose);
  const composedKeys = keysByPart(composed);
  const hidden = new Map<CollectionPartKey, ReadonlySet<string>>();
  for (const [key, shown] of composedKeys) {
    const own = new Set(edits.hidden.filter((h) => h.formatId === formatId && samePart(h.partKey, key)).map((h) => h.pageKey));
    const left = new Set(shown.filter((pageKey) => own.has(pageKey)));
    // A part never shows no page: when every page it would show is hidden, its hides are ignored.
    hidden.set(key, left.size === shown.length ? new Set() : left);
  }

  const shownParts = edited.map((part) => {
    const out = hidden.get(collectionPartKey(part));
    if (out === undefined || out.size === 0) return part;
    const formats = part.doc.formats as Record<string, { pages: readonly Page[] }>;
    return withPages(part, formatId, formats[formatId]!.pages.filter((p) => !out.has(p.pageKey)));
  });
  const file = composeParts(shownParts, formatId, options.compose);

  // What takes effect: compared with the parts as they are.
  const before = keysByPart(composeParts(parts, formatId, options.compose));
  const after = keysByPart(file);
  const originals = new Map(
    parts.map((part) => {
      const formats = part.doc.formats as Record<string, { pages: readonly Page[] } | undefined>;
      const pages = Object.hasOwn(formats, formatId) ? (formats[formatId]?.pages ?? []) : [];
      return [collectionPartKey(part), new Map(pages.map((p) => [p.pageKey, p]))] as const;
    }),
  );
  const effective: EffectivePartEdits[] = [];
  for (const [key, shown] of after) {
    const onShown = new Set(shown);
    const pages = originals.get(key) ?? new Map<string, Page>();
    const words = texts
      .filter((t) => samePart(t.partKey, key) && onShown.has(t.pageKey))
      .flatMap((t): (readonly [string, string, string])[] => {
        const page = pages.get(t.pageKey);
        const original = page === undefined ? null : freeTextIn(page, t.elementId);
        return original === null || original === t.text ? [] : [[t.pageKey, t.elementId, t.text] as const];
      });
    // One edit per element: the last given wins, as `wordedPage` applies them.
    const byElement = new Map(words.map((w) => [`${w[0]}\u0000${w[1]}`, w]));
    const textRows = [...byElement.values()].sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));
    const hiddenRows = [...(hidden.get(key) ?? [])].sort(compare);
    const wouldShow = (before.get(key) ?? []).filter((pageKey) => onShown.has(pageKey));
    const order = wouldShow.length === shown.length && wouldShow.every((pageKey, i) => pageKey === shown[i]) ? null : [...shown];
    if (textRows.length > 0 || hiddenRows.length > 0 || order !== null) effective.push({ partKey: key, texts: textRows, hidden: hiddenRows, order });
  }
  effective.sort((a, b) => compare(a.partKey, b.partKey));

  return { parts: edited, composed, hidden, shownParts, file, effective };
}
