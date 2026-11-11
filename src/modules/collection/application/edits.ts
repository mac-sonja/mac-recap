import { createHash } from "node:crypto";
import type { Actor } from "@/modules/access";
import type { CaseStudyRevision, ListedCaseStudy } from "@/modules/case-study";
import type { DocumentElement, Page, TextElement } from "@/modules/generation";
import {
  canHide,
  isPermutation,
  restoreTextInputSchema,
  samePart,
  setPageHiddenInputSchema,
  setPageOrderInputSchema,
  setTextInputSchema,
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

export function makeCollectionEditUseCases({ collections, listCases, liveRevision, liveIntroRevision }: CollectionEditDeps) {
  /** The live revision a part draws from, or null when it has none any more. */
  const revisionOf = (part: CollectionPart) => (part.kind === "case" ? liveRevision(part.id) : liveIntroRevision(part.id));

  /**
   * The collection at `expectedVersion`, and the pages of `part` in `formatId` from its live
   * approved revision. The part must be one of its cases, or a client one of its cases belongs to.
   */
  async function partPages(collectionId: string, expectedVersion: number, part: CollectionPart, formatId: string): Promise<Result<{ stored: StoredCollection; pages: readonly Page[] }>> {
    const found = await collections.find(collectionId);
    if (!found.ok) return found;
    if (found.value === null) return err(notFound(collectionId));
    if (found.value.version !== expectedVersion) return err(stale(collectionId));
    const listed = await listCases();
    if (!listed.ok) return listed;
    const inside = new Set(found.value.caseIds.map((id) => id.toLowerCase()));
    const cases = listed.value.filter((c) => inside.has(c.id.toLowerCase()));
    const belongs = part.kind === "case" ? cases.some((c) => c.id.toLowerCase() === part.id) : cases.some((c) => c.client.id.toLowerCase() === part.id);
    if (!belongs) return err(invalid("part"));
    const revision = await revisionOf(part);
    if (!revision.ok) return revision;
    // No approved revision any more ("Non disponibile"): nothing of it shows, so nothing is edited.
    if (revision.value === null) return err(invalid("part"));
    const formats = revision.value.doc.formats;
    if (!Object.hasOwn(formats, formatId)) return err(invalid("formatId"));
    return ok({ stored: found.value, pages: formats[formatId]!.pages });
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
        const keys = read.value.pages.map((p) => p.pageKey);
        if (!keys.includes(pageKey)) return err(invalid("pageKey"));
        const edits = await collections.edits(collectionId);
        if (!edits.ok) return edits;
        const already = new Set(edits.value.hiddenPages.filter((h) => samePart(h.part, part) && h.formatId === formatId).map((h) => h.pageKey));
        if (!canHide(keys, already, pageKey)) return err({ code: "COLLECTION_LAST_PAGE", message: "A part keeps at least one page.", details: { pageKey } });
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
     * (`originalChanged`). An edit whose text is no longer a free text of that page (the page or
     * the text was removed, or it is now a field) is left out: it no longer shows. A part with no
     * approved revision keeps its edits unchecked (nothing of it shows). `COLLECTION_NOT_FOUND`.
     */
    async edits(collectionId: unknown): Promise<Result<CollectionEdits>> {
      const id = z.uuid().safeParse(collectionId);
      if (!id.success) return err(notFound(String(collectionId)));
      const key = id.data.toLowerCase();
      const found = await collections.find(key);
      if (!found.ok) return found;
      if (found.value === null) return err(notFound(key));
      const stored = await collections.edits(key);
      if (!stored.ok) return stored;
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
        const revision = await revisionFor(edit.part);
        if (!revision.ok) return revision;
        const { originalHash, ...rest } = edit;
        if (revision.value === null) {
          textEdits.push({ ...rest, originalChanged: false });
          continue;
        }
        const formats = revision.value.doc.formats;
        const page = Object.hasOwn(formats, edit.formatId) ? formats[edit.formatId]!.pages.find((p) => p.pageKey === edit.pageKey) : undefined;
        const original = page === undefined ? null : freeTextOf(page, edit.elementId);
        if (original === null) continue;
        textEdits.push({ ...rest, originalChanged: textHash(original.text) !== originalHash });
      }
      return ok({ textEdits, hiddenPages: stored.value.hiddenPages, pageOrders: stored.value.pageOrders });
    },
  };
}

export type CollectionEditUseCases = ReturnType<typeof makeCollectionEditUseCases>;
