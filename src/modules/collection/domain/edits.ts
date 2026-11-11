import { z } from "zod";

/**
 * Story 5.11a: a collection's own edits, stored in the collection only. A collection can change
 * the words of a page's free texts, hide pages and put a part's pages in another order, per
 * format. A part is one of its cases or a client's intro document (its intro and closing pages).
 * The originals (revisions, clients, client intros) are never written.
 */

/** A part of a collection: one of its cases (`id` the case), or a client's intro document (`id` the client). */
export const COLLECTION_PART_KINDS = ["case", "client_intro"] as const;
export type CollectionPartKind = (typeof COLLECTION_PART_KINDS)[number];

export interface CollectionPart {
  kind: CollectionPartKind;
  id: string;
}

/** The document's text limit in UTF-16 units, as its zod `.max` counts (`MAX_TEXT_CHARS` of generation); `collection_text_edit_text_check` counts code points, never looser. */
export const COLLECTION_TEXT_MAX = 5_000;
/** The most pages a format holds (`MAX_PAGES_PER_FORMAT` of generation; `collection_page_order_page_keys_check` matches). */
export const COLLECTION_PAGES_MAX = 50;

/** More event types the writers log (`collection_event.type`). */
export const COLLECTION_EDIT_EVENTS = {
  textEdited: "collection_text_edited",
  textRestored: "collection_text_restored",
  pageHidden: "collection_page_hidden",
  pageRestored: "collection_page_restored",
  pagesMoved: "collection_pages_moved",
} as const;

/** The collection's words for one free text of a page. `originalHash`: the sha256 (hex) of the original words when saved. */
export interface StoredTextEdit {
  part: CollectionPart;
  formatId: string;
  pageKey: string;
  elementId: string;
  text: string;
  originalHash: string;
}

/** A page the collection leaves out. */
export interface StoredHiddenPage {
  part: CollectionPart;
  formatId: string;
  pageKey: string;
}

/** A part's pages in the collection's order. */
export interface StoredPageOrder {
  part: CollectionPart;
  formatId: string;
  pageKeys: string[];
}

/** Every edit of a collection, as stored. */
export interface StoredCollectionEdits {
  textEdits: StoredTextEdit[];
  hiddenPages: StoredHiddenPage[];
  pageOrders: StoredPageOrder[];
}

export const NO_EDITS: StoredCollectionEdits = { textEdits: [], hiddenPages: [], pageOrders: [] };

const id = () => z.uuid().transform((value) => value.toLowerCase());
const version = () => z.number().int().min(1);
/** A page key, as `pageSchema` allows it. */
const pageKey = () => z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).max(64);
const NO_NUL = (value: string) => !value.includes("\u0000");

/**
 * Typed words as a collection keeps them: no-break spaces as plain spaces, no trailing spaces or
 * line breaks. The page normalises the same way before it saves.
 */
export const normaliseText = (text: string) => text.replaceAll("\u00a0", " ").trimEnd();

const partSchema = z.strictObject({ kind: z.enum(COLLECTION_PART_KINDS), id: id() });

const pageInput = {
  collectionId: id(),
  expectedVersion: version(),
  part: partSchema,
  formatId: z.string().regex(/^[a-z0-9_]{1,64}$/),
  pageKey: pageKey(),
};

/** `setCollectionText`'s input: the collection's words for one free text. */
export const setTextInputSchema = z.strictObject({
  ...pageInput,
  elementId: id(),
  // Normalised, then not blank, and at most the document's limit in UTF-16 units (as its `.max`).
  text: z
    .string()
    .refine(NO_NUL)
    .transform(normaliseText)
    .refine((value) => value.trim() !== "", "Not blank.")
    .refine((value) => value.length <= COLLECTION_TEXT_MAX, `At most ${COLLECTION_TEXT_MAX} characters.`),
});

/** `restoreCollectionText`'s input: the free text whose original words come back. */
export const restoreTextInputSchema = z.strictObject({ ...pageInput, elementId: id() });

/** `setCollectionPageHidden`'s input: hide the page (`hidden: true`) or show it again. */
export const setPageHiddenInputSchema = z.strictObject({ ...pageInput, hidden: z.boolean() });

const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;

/** `setCollectionPageOrder`'s input: every page key of the part in that format, in the new order. */
export const setPageOrderInputSchema = z.strictObject({
  collectionId: id(),
  expectedVersion: version(),
  part: partSchema,
  formatId: pageInput.formatId,
  pageKeys: z.array(pageKey()).min(1).max(COLLECTION_PAGES_MAX).refine(unique, "Each page at most once."),
});

/** Whether two parts are the same. */
export const samePart = (a: CollectionPart, b: CollectionPart) => a.kind === b.kind && a.id === b.id;

/**
 * Whether page `pageKey` may be hidden: a part keeps at least one page of its document in the
 * format. `pageKeys` are the document's pages, `hidden` the ones already left out (any key
 * no longer in the document is ignored). Hiding a page already hidden is allowed (nothing changes).
 */
export function canHide(pageKeys: readonly string[], hidden: ReadonlySet<string>, pageKey: string): boolean {
  if (hidden.has(pageKey)) return true;
  const shown = pageKeys.filter((key) => !hidden.has(key));
  return shown.some((key) => key !== pageKey);
}

/** A page as far as the file's rules read it. */
interface PageShape {
  pageKey: string;
  role: string;
}

/** Carosello: a case wrapped by its client's intro leaves out its own Chiusura (`composeParts`). */
const CAROSELLO = "carosello_1_1";
const CASE_CLOSING_KEY = "closing";

/**
 * The page keys of a part the collection's file shows in `formatId`, as `composeParts` (the
 * rendering module, C38) lays it out by default; the collection module mirrors its rule rather
 * than importing it. `wrapped`: the part's client has an approved intro and 2 or more cases with
 * pages in the collection. A wrapped case leaves out its own intro pages (and, in Carosello, its
 * Chiusura); a client intro shows only its intro and closing pages, and only when wrapping.
 */
export function shownPageKeys(pages: readonly PageShape[], kind: CollectionPartKind, formatId: string, wrapped: boolean): string[] {
  if (kind === "client_intro") return wrapped ? pages.filter((p) => p.role === "intro" || p.role === "outro").map((p) => p.pageKey) : [];
  if (!wrapped) return pages.map((p) => p.pageKey);
  return pages.filter((p) => p.role !== "intro" && !(formatId === CAROSELLO && p.pageKey === CASE_CLOSING_KEY)).map((p) => p.pageKey);
}

/** Whether `next` holds exactly the document's page keys `current`, each once, in any order. */
export const isPermutation = (current: readonly string[], next: readonly string[]) =>
  current.length === next.length && unique(next) && next.every((key) => current.includes(key));
