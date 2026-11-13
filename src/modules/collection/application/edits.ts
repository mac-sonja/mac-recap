import { createHash } from "node:crypto";
import type { Actor } from "@/modules/access";
import type { CaseStudyRevision, ListedCaseStudy } from "@/modules/case-study";
import type { DocumentElement, Page, TextElement } from "@/modules/generation";
import { BRAND_PAGES, BRAND_PART_ID, hasBrandPages } from "@/modules/rendering";
import {
  canHide,
  isPermutation,
  restoreTextInputSchema,
  samePart,
  setPageHiddenInputSchema,
  setPageOrderInputSchema,
  setTextInputSchema,
  shownPageKeys,
  type CollectionPart,
  type StoredHiddenPage,
  type StoredPageOrder,
} from "@/modules/collection/domain/edits";
import type { StoredCollection } from "@/modules/collection/domain/collection";
import { parseInput } from "@/modules/collection/domain/validation";
import type { CollectionRepository } from "@/modules/collection/ports/collection-repository";
import { z } from "zod";
import { err, ok, type AppError, type Result } from "@/shared/result";

/** What the collection's edit use cases read of other modules, through their public index. */
export interface CollectionEditDeps {
  collections: CollectionRepository;
  /** Every non-deleted case, any status (`case-study.list({})`). */
  listCases: () => Promise<Result<ListedCaseStudy[]>>;
  /** A case's live (approved) revision, or null (`case-study.getLiveRevision`). */
  liveRevision: (caseId: string) => Promise<Result<CaseStudyRevision | null>>;
  /** A client's approved intro document's live revision, or null (`case-study.getClientIntro` + `getLiveRevision`). */
  liveIntroRevision: (clientId: string) => Promise<Result<CaseStudyRevision | null>>;
}

/**
 * The sha256 (hex) of a text's words: what an edit keeps of its original, and how the original
 * is checked again on every read. The one place both are worked out.
 */
export const textHash = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/** A collection's words for one free text, as read now. */
export interface CollectionTextEdit {
  part: CollectionPart;
  formatId: string;
  pageKey: string;
  elementId: string;
  text: string;
  /** The original words changed since the edit was saved ("Il testo originale è cambiato"): the collection keeps its own. */
  originalChanged: boolean;
}

/** Every edit of a collection, as its page applies them. */
export interface CollectionEdits {
  textEdits: CollectionTextEdit[];
  hiddenPages: StoredHiddenPage[];
  pageOrders: StoredPageOrder[];
}

/** What every edit returns: the collection's new version. */
export interface CollectionEditWrite {
  collectionId: string;
  version: number;
}

const notFound = (collectionId: string): AppError => ({ code: "COLLECTION_NOT_FOUND", message: "No collection with this id.", details: { collectionId } });
const stale = (collectionId: string): AppError => ({ code: "STALE_COLLECTION", message: "The collection changed meanwhile.", details: { collectionId } });
const invalid = (field: string): AppError => ({ code: "INVALID_INPUT", message: `Invalid or missing: ${field}.`, details: { fields: [field] } });

/** Free text `elementId` of `page` (inside Testi groups and rows too): a text with its own words, not a client or case field. */
export function freeTextOf(page: Page, elementId: string): (TextElement & { text: string }) | null {
  const walk = (elements: readonly DocumentElement[]): (TextElement & { text: string }) | null => {
    for (const el of elements) {
      if (el.elementId === elementId) return el.type === "text" && el.text !== undefined && el.binding === undefined && el.bindings === undefined ? (el as TextElement & { text: string }) : null;
      if (el.type === "text_group" || el.type === "row") {
        const found = walk(el.items);
        if (found !== null) return found;
      }
    }
    return null;
  };
  for (const block of page.blocks) {
    const found = walk(block.elements);
    if (found !== null) return found;
  }
  return null;
}

/** The codes a read gives for a case or client that is gone (unknown or deleted): the part is then unavailable. */
const GONE = new Set(["NOT_FOUND", "CLIENT_NOT_FOUND", "CASE_NOT_FOUND"]);

export function makeCollectionEditUseCases({ collections, listCases, liveRevision, liveIntroRevision }: CollectionEditDeps) {
  /** The live revision a part draws from, or null when it has none any more (none approved, or the case or client is gone). */
  const revisionOf = async (part: CollectionPart): Promise<Result<CaseStudyRevision | null>> => {
    if (part.kind === "brand") return ok(null);
    const read = await (part.kind === "case" ? liveRevision(part.id) : liveIntroRevision(part.id));
    return !read.ok && GONE.has(read.error.code) ? ok(null) : read;
  };

  /** The collection's non-deleted cases, read now. */
  async function casesOf(stored: StoredCollection): Promise<Result<ListedCaseStudy[]>> {
    const listed = await listCases();
    if (!listed.ok) return listed;
    const inside = new Set(stored.caseIds.map((id) => id.toLowerCase()));
    return ok(listed.value.filter((c) => inside.has(c.id.toLowerCase())));
  }

  /** Whether `part` is one of `cases`, the client of one of them, or MAC's pages (by their sentinel id: every collection has them). */
  const partIn = (part: CollectionPart, cases: readonly ListedCaseStudy[]) =>
    part.kind === "brand"
      ? part.id === BRAND_PART_ID
      : part.kind === "case"
        ? cases.some((c) => c.id.toLowerCase() === part.id)
        : cases.some((c) => c.client.id.toLowerCase() === part.id);

  /** MAC's pages in `formatId`: the rendering module's constants, Presentazione only. */
  const brandPagesIn = (formatId: string): readonly Page[] | null => (hasBrandPages(formatId) ? BRAND_PAGES : null);

  /**
   * Whether the file wraps client `clientId`'s cases in its intro: its intro is approved and 2 or
   * more of its cases in the collection have an approved revision (as the page draws it).
   */
  async function wraps(clientId: string, cases: readonly ListedCaseStudy[]): Promise<Result<boolean>> {
    const own = cases.filter((c) => c.client.id.toLowerCase() === clientId);
    if (own.length < 2) return ok(false);
    const [intro, ...revisions] = await Promise.all([revisionOf({ kind: "client_intro", id: clientId }), ...own.map((c) => revisionOf({ kind: "case", id: c.id.toLowerCase() }))]);
    if (!intro!.ok) return intro!;
    let drawn = 0;
    for (const r of revisions) {
      if (!r.ok) return r;
      if (r.value !== null) drawn += 1;
    }
    return ok(intro!.value !== null && drawn >= 2);
  }

  /**
   * The collection at `expectedVersion`, and the pages of `part` in `formatId` from its live
   * approved revision (MAC's pages: the rendering module's, in Presentazione only). The part must
   * be one of its cases, a client one of its cases belongs to, or MAC's pages.
   */
  async function partPages(
    collectionId: string,
    expectedVersion: number,
    part: CollectionPart,
    formatId: string,
  ): Promise<Result<{ stored: StoredCollection; cases: ListedCaseStudy[]; pages: readonly Page[] }>> {
    const found = await collections.find(collectionId);
    if (!found.ok) return found;
    if (found.value === null) return err(notFound(collectionId));
    if (found.value.version !== expectedVersion) return err(stale(collectionId));
    const cases = await casesOf(found.value);
    if (!cases.ok) return cases;
    if (!partIn(part, cases.value)) return err(invalid("part"));
    if (part.kind === "brand") {
      const pages = brandPagesIn(formatId);
      return pages === null ? err(invalid("formatId")) : ok({ stored: found.value, cases: cases.value, pages });
    }
    const revision = await revisionOf(part);
    if (!revision.ok) return revision;
    // No approved revision any more ("Non disponibile"): nothing of it shows, so nothing is edited.
    if (revision.value === null) return err(invalid("part"));
    const formats = revision.value.doc.formats;
    if (!Object.hasOwn(formats, formatId)) return err(invalid("formatId"));
    return ok({ stored: found.value, cases: cases.value, pages: formats[formatId]!.pages });
  }

  return {
    /**
     * The collection's words for one free text: input `{ collectionId, expectedVersion, part,
     * formatId, pageKey, elementId, text }` (at most 5,000 characters). The original's hash is
     * worked out here from the part's live approved revision. The same words as the original
     * remove the edit instead. Only a free text: a client or case field, an image or a logo is
     * `TEXT_NOT_EDITABLE`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async setText(actor: Actor, input: unknown): Promise<Result<CollectionEditWrite>> {
      const parsed = parseInput(setTextInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, part, formatId, pageKey, elementId, text } = parsed.value;
      const read = await partPages(collectionId, expectedVersion, part, formatId);
      if (!read.ok) return read;
      const page = read.value.pages.find((p) => p.pageKey === pageKey);
      if (page === undefined) return err(invalid("pageKey"));
      const original = freeTextOf(page, elementId);
      if (original === null) return err({ code: "TEXT_NOT_EDITABLE", message: "Only a free text can be edited in a collection.", details: { elementId } });
      const ref = { part, formatId, pageKey, elementId };
      if (original.text === text) {
        // Back to the original words: the edit goes, if there is one.
        const edits = await collections.edits(collectionId);
        if (!edits.ok) return edits;
        const had = edits.value.textEdits.some((e) => samePart(e.part, part) && e.formatId === formatId && e.pageKey === pageKey && e.elementId === elementId);
        if (!had) return ok({ collectionId, version: expectedVersion });
        const restored = await collections.deleteTextEdit(collectionId, expectedVersion, ref, actor.id);
        return restored.ok ? ok({ collectionId, version: restored.value }) : restored;
      }
      const saved = await collections.setTextEdit(collectionId, expectedVersion, { ...ref, text, originalHash: textHash(original.text) }, actor.id);
      return saved.ok ? ok({ collectionId, version: saved.value }) : saved;
    },

    /**
     * Removes the collection's words for one free text (**Ripristina testo originale**, **Usa
     * originale**): input `{ collectionId, expectedVersion, part, formatId, pageKey, elementId }`.
     * `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async restoreText(actor: Actor, input: unknown): Promise<Result<CollectionEditWrite>> {
      const parsed = parseInput(restoreTextInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, ...ref } = parsed.value;
      const done = await collections.deleteTextEdit(collectionId, expectedVersion, ref, actor.id);
      return done.ok ? ok({ collectionId, version: done.value }) : done;
    },

    /**
     * Hides a page (**Elimina dalla raccolta**, `hidden: true`) or shows it again
     * (**Ripristina**): input `{ collectionId, expectedVersion, part, formatId, pageKey, hidden }`.
     * A part keeps at least one page of its document in the format (`COLLECTION_LAST_PAGE`).
     * `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async setPageHidden(actor: Actor, input: unknown): Promise<Result<CollectionEditWrite>> {
      const parsed = parseInput(setPageHiddenInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, part, formatId, pageKey, hidden } = parsed.value;
      if (hidden) {
        const read = await partPages(collectionId, expectedVersion, part, formatId);
        if (!read.ok) return read;
        const { pages, cases } = read.value;
        if (!pages.some((p) => p.pageKey === pageKey)) return err(invalid("pageKey"));
        // The pages the file shows of the part: a case wrapped by its client's intro shows fewer.
        let wrapped = false;
        if (part.kind !== "brand") {
          const clientId = part.kind === "client_intro" ? part.id : cases.find((c) => c.id.toLowerCase() === part.id)!.client.id.toLowerCase();
          const wrapping = await wraps(clientId, cases);
          if (!wrapping.ok) return wrapping;
          wrapped = wrapping.value;
        }
        const shown = shownPageKeys(pages, part.kind, formatId, wrapped);
        const edits = await collections.edits(collectionId);
        if (!edits.ok) return edits;
        const already = new Set(edits.value.hiddenPages.filter((h) => samePart(h.part, part) && h.formatId === formatId).map((h) => h.pageKey));
        if (shown.includes(pageKey) && !canHide(shown, already, pageKey)) {
          return err({ code: "COLLECTION_LAST_PAGE", message: "A part keeps at least one page.", details: { pageKey } });
        }
      }
      const done = await collections.setPageHidden(collectionId, expectedVersion, { part, formatId, pageKey }, hidden, actor.id);
      return done.ok ? ok({ collectionId, version: done.value }) : done;
    },

    /**
     * A part's pages in a new order: input `{ collectionId, expectedVersion, part, formatId,
     * pageKeys }`, every page key of the part's document in that format, each once.
     * `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async setPageOrder(actor: Actor, input: unknown): Promise<Result<CollectionEditWrite>> {
      const parsed = parseInput(setPageOrderInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, part, formatId, pageKeys } = parsed.value;
      const read = await partPages(collectionId, expectedVersion, part, formatId);
      if (!read.ok) return read;
      if (!isPermutation(read.value.pages.map((p) => p.pageKey), pageKeys)) return err(invalid("pageKeys"));
      const done = await collections.setPageOrder(collectionId, expectedVersion, { part, formatId, pageKeys }, actor.id);
      return done.ok ? ok({ collectionId, version: done.value }) : done;
    },

    /**
     * Every edit of a live collection, each text edit checked now against its original: the
     * sha256 of the live approved revision's words against the one saved with the edit
     * (`originalChanged`). Left out, as they no longer show: every edit of a part no longer in
     * the collection (a case not in it or deleted, a client with no case left), a text edit of a
     * part with no approved revision (none approved, or its case or client gone), and one whose
     * text is no longer a free text of that page. `COLLECTION_NOT_FOUND`.
     */
    async edits(collectionId: unknown): Promise<Result<CollectionEdits>> {
      const id = z.uuid().safeParse(collectionId);
      if (!id.success) return err(notFound(String(collectionId)));
      const key = id.data.toLowerCase();
      const found = await collections.find(key);
      if (!found.ok) return found;
      if (found.value === null) return err(notFound(key));
      const [stored, cases] = await Promise.all([collections.edits(key), casesOf(found.value)]);
      if (!stored.ok) return stored;
      if (!cases.ok) return cases;
      const inside = (part: CollectionPart) => partIn(part, cases.value);
      const revisions = new Map<string, Promise<Result<CaseStudyRevision | null>>>();
      const revisionFor = (part: CollectionPart) => {
        const partKey = `${part.kind}:${part.id}`;
        let read = revisions.get(partKey);
        if (read === undefined) {
          read = revisionOf(part);
          revisions.set(partKey, read);
        }
        return read;
      };
      const textEdits: CollectionTextEdit[] = [];
      for (const edit of stored.value.textEdits) {
        if (!inside(edit.part)) continue;
        const { originalHash, ...rest } = edit;
        let pages: readonly Page[] | null;
        if (edit.part.kind === "brand") pages = brandPagesIn(edit.formatId);
        else {
          const revision = await revisionFor(edit.part);
          if (!revision.ok) return revision;
          if (revision.value === null) continue;
          const formats = revision.value.doc.formats;
          pages = Object.hasOwn(formats, edit.formatId) ? formats[edit.formatId]!.pages : null;
        }
        const page = pages?.find((p) => p.pageKey === edit.pageKey);
        const original = page === undefined ? null : freeTextOf(page, edit.elementId);
        if (original === null) continue;
        textEdits.push({ ...rest, originalChanged: textHash(original.text) !== originalHash });
      }
      return ok({ textEdits, hiddenPages: stored.value.hiddenPages.filter((h) => inside(h.part)), pageOrders: stored.value.pageOrders.filter((o) => inside(o.part)) });
    },
  };
}

export type CollectionEditUseCases = ReturnType<typeof makeCollectionEditUseCases>;
