import type { Actor } from "@/modules/access";
import type { CaseStudyRevision, ListedCaseStudy } from "@/modules/case-study";
import {
  addItems,
  changeItemsInputSchema,
  COLLECTION_EVENTS,
  COLLECTION_ITEMS_MAX,
  createCollectionInputSchema,
  deleteCollectionInputSchema,
  moveGroup,
  moveGroupInputSchema,
  moveItem,
  moveItemInputSchema,
  orderForCreate,
  recordExportedInputSchema,
  removeItems,
  renameCollectionInputSchema,
  retagCollectionInputSchema,
  sameOrder,
  type CollectionTags,
  type CollectionWrite,
  type GroupedItem,
  type StoredCollection,
} from "@/modules/collection/domain/collection";
import { parseInput } from "@/modules/collection/domain/validation";
import type { CollectionRepository } from "@/modules/collection/ports/collection-repository";
import { z } from "zod";
import { err, ok, type AppError, type Result } from "@/shared/result";

/** What the collection use cases read of other modules, through their public index. */
export interface CollectionDeps {
  collections: CollectionRepository;
  /** Every non-deleted case, any status (`case-study.list({})`): what a collection's ids resolve to. */
  listCases: () => Promise<Result<ListedCaseStudy[]>>;
  /** A case's live (approved) revision, or null (`case-study.getLiveRevision`). */
  liveRevision: (caseId: string) => Promise<Result<CaseStudyRevision | null>>;
  /** The business lines a tag may name (`case-study.BUSINESS_LINES`). */
  businessLines: readonly string[];
}

/** A collection in the Raccolte list. */
export interface CollectionSummary {
  id: string;
  name: string;
  version: number;
  tags: CollectionTags;
  /** Its cases still there (a deleted case has left it). */
  caseCount: number;
  createdBy: { id: string; name: string | null };
  createdAt: string;
  updatedAt: string;
}

/**
 * One case of a collection as read now: the case (its current name, code, client and status) and
 * its live approved revision. `revision` null: the case has no approved revision any more (it is
 * listed "Non disponibile", with no pages).
 */
export interface CollectionItem {
  case: ListedCaseStudy;
  revision: CaseStudyRevision | null;
}

/** A collection opened: its cases in order (each client's together), a deleted case left out. */
export interface CollectionDetail extends Omit<StoredCollection, "caseIds"> {
  items: CollectionItem[];
}

const notFound = (collectionId: string): AppError => ({ code: "COLLECTION_NOT_FOUND", message: "No collection with this id.", details: { collectionId } });
const stale = (collectionId: string): AppError => ({ code: "STALE_COLLECTION", message: "The collection changed meanwhile.", details: { collectionId } });

/** Tags whose business lines are all known; else `INVALID_INPUT` naming `businessLines`. */
function checkLines(lines: readonly string[], known: readonly string[]): Result<string[]> {
  if (lines.every((line) => known.includes(line))) return ok(known.filter((line) => lines.includes(line)));
  return err({ code: "INVALID_INPUT", message: "Invalid or missing: businessLines.", details: { fields: ["businessLines"] } });
}

export function makeCollectionUseCases({ collections, listCases, liveRevision, businessLines }: CollectionDeps) {
  /** The non-deleted cases by id. */
  async function casesById(): Promise<Result<Map<string, ListedCaseStudy>>> {
    const listed = await listCases();
    if (!listed.ok) return listed;
    return ok(new Map(listed.value.map((c) => [c.id.toLowerCase(), c])));
  }

  /** The collection's live items with their client, a deleted case left out. */
  const groupedOf = (stored: StoredCollection, cases: ReadonlyMap<string, ListedCaseStudy>): GroupedItem[] =>
    stored.caseIds.flatMap((id) => {
      const found = cases.get(id.toLowerCase());
      return found === undefined ? [] : [{ caseId: found.id.toLowerCase(), clientId: found.client.id.toLowerCase() }];
    });

  /**
   * Reads the collection and its cases, checks the version, and writes `next(items)` (when it
   * changes the order) as an items change. The shared path of add, remove and both moves.
   */
  async function changeItems(
    actor: Actor,
    collectionId: string,
    expectedVersion: number,
    type: string,
    data: Record<string, unknown>,
    next: (items: GroupedItem[], cases: ReadonlyMap<string, ListedCaseStudy>) => Result<string[]>,
  ): Promise<Result<CollectionWrite>> {
    const found = await collections.find(collectionId);
    if (!found.ok) return found;
    if (found.value === null) return err(notFound(collectionId));
    if (found.value.version !== expectedVersion) return err(stale(collectionId));
    const cases = await casesById();
    if (!cases.ok) return cases;
    const items = groupedOf(found.value, cases.value);
    const ids = next(items, cases.value);
    if (!ids.ok) return ids;
    if (sameOrder(items, ids.value) && items.length === found.value.caseIds.length) {
      return ok({ collectionId, version: found.value.version, caseIds: ids.value });
    }
    const saved = await collections.setItems(collectionId, expectedVersion, ids.value, actor.id, { type, data });
    if (!saved.ok) return saved;
    return ok({ collectionId, version: saved.value, caseIds: ids.value });
  }

  return {
    /**
     * Creates a collection from the library's selection: input `{ name, businessLines,
     * industries, caseIds }`, the cases in the order they were selected. They are kept in that
     * order with each client's cases gathered where its first selected case was. Every case
     * must be approved and not deleted. `INVALID_INPUT` (naming the field), `CASE_NOT_COLLECTABLE`.
     */
    async create(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
      const parsed = parseInput(createCollectionInputSchema, input);
      if (!parsed.ok) return parsed;
      const lines = checkLines(parsed.value.businessLines, businessLines);
      if (!lines.ok) return lines;
      const cases = await casesById();
      if (!cases.ok) return cases;
      const selected: GroupedItem[] = [];
      for (const id of parsed.value.caseIds) {
        const found = cases.value.get(id);
        if (found === undefined || found.status !== "approved") {
          return err({ code: "CASE_NOT_COLLECTABLE", message: "Only approved, non-deleted cases can be added to a collection.", details: { caseId: id } });
        }
        selected.push({ caseId: id, clientId: found.client.id.toLowerCase() });
      }
      const caseIds = orderForCreate(selected);
      const created = await collections.create({ name: parsed.value.name, tags: { businessLines: lines.value, industries: parsed.value.industries }, caseIds }, actor.id);
      if (!created.ok) return created;
      return ok({ collectionId: created.value.id, version: created.value.version, caseIds });
    },

    /** Every live collection, newest update first, each with its number of cases still there. */
    async list(): Promise<Result<CollectionSummary[]>> {
      const [stored, cases] = await Promise.all([collections.list(), casesById()]);
      if (!stored.ok) return stored;
      if (!cases.ok) return cases;
      return ok(
        stored.value.map(({ caseIds, ...rest }) => ({
          ...rest,
          caseCount: caseIds.filter((id) => cases.value.has(id.toLowerCase())).length,
        })),
      );
    },

    /**
     * One collection with its cases resolved now: each case's current record and live approved
     * revision (null: "Non disponibile"); a deleted case is left out. `COLLECTION_NOT_FOUND`
     * for an unknown, malformed or deleted id.
     */
    async get(collectionId: unknown): Promise<Result<CollectionDetail>> {
      const id = z.uuid().safeParse(collectionId);
      if (!id.success) return err(notFound(String(collectionId)));
      const found = await collections.find(id.data.toLowerCase());
      if (!found.ok) return found;
      if (found.value === null) return err(notFound(id.data));
      const cases = await casesById();
      if (!cases.ok) return cases;
      const { caseIds, ...rest } = found.value;
      const live = caseIds.flatMap((caseId) => cases.value.get(caseId.toLowerCase()) ?? []);
      const revisions = await Promise.all(live.map((c) => (c.status === "approved" ? liveRevision(c.id) : Promise.resolve(ok(null)))));
      const items: CollectionItem[] = [];
      for (const [i, c] of live.entries()) {
        const revision = revisions[i]!;
        if (!revision.ok) return revision;
        items.push({ case: c, revision: revision.value });
      }
      return ok({ ...rest, items });
    },

    /** Renames it: input `{ collectionId, expectedVersion, name }` (1–120 characters). `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`. */
    async rename(actor: Actor, input: unknown): Promise<Result<{ collectionId: string; version: number; name: string }>> {
      const parsed = parseInput(renameCollectionInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, name } = parsed.value;
      const saved = await collections.rename(collectionId, expectedVersion, name, actor.id);
      return saved.ok ? ok({ collectionId, version: saved.value, name }) : saved;
    },

    /**
     * Replaces its tags: input `{ collectionId, expectedVersion, businessLines, industries }`, at
     * least one of each. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async retag(actor: Actor, input: unknown): Promise<Result<{ collectionId: string; version: number; tags: CollectionTags }>> {
      const parsed = parseInput(retagCollectionInputSchema, input);
      if (!parsed.ok) return parsed;
      const lines = checkLines(parsed.value.businessLines, businessLines);
      if (!lines.ok) return lines;
      const { collectionId, expectedVersion, industries } = parsed.value;
      const tags = { businessLines: lines.value, industries };
      const saved = await collections.setTags(collectionId, expectedVersion, tags, actor.id);
      return saved.ok ? ok({ collectionId, version: saved.value, tags }) : saved;
    },

    /** Soft-deletes it: input `{ collectionId }`. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`. */
    async remove(actor: Actor, input: unknown): Promise<Result<void>> {
      const parsed = parseInput(deleteCollectionInputSchema, input);
      if (!parsed.ok) return parsed;
      return collections.softDelete(parsed.value.collectionId, actor.id);
    },

    /**
     * Logs that a file of the collection was handed out (Story 5.10b): input `{ collectionId,
     * exportId, format }`, one `collection_exported` event. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`.
     */
    async recordExported(actor: Actor, input: unknown): Promise<Result<void>> {
      const parsed = parseInput(recordExportedInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, exportId, format } = parsed.value;
      return collections.recordExported(collectionId, actor.id, exportId, format);
    },

    /**
     * Adds cases: input `{ collectionId, expectedVersion, caseIds }`. Each joins the end of its
     * client's group, or a new group at the end; one already in it is skipped. Every new case
     * must be approved and not deleted. `INVALID_INPUT`, `COLLECTION_NOT_FOUND`,
     * `STALE_COLLECTION`, `CASE_NOT_COLLECTABLE`, `COLLECTION_FULL` (over 200 cases).
     */
    async addItems(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
      const parsed = parseInput(changeItemsInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, caseIds } = parsed.value;
      return changeItems(actor, collectionId, expectedVersion, COLLECTION_EVENTS.itemsAdded, { added: caseIds }, (items, cases) => {
        const added: GroupedItem[] = [];
        for (const id of caseIds) {
          const found = cases.get(id);
          if (items.some((i) => i.caseId === id)) continue;
          if (found === undefined || found.status !== "approved") {
            return err({ code: "CASE_NOT_COLLECTABLE", message: "Only approved, non-deleted cases can be added to a collection.", details: { caseId: id } });
          }
          added.push({ caseId: id, clientId: found.client.id.toLowerCase() });
        }
        const next = addItems(items, added);
        if (next.length > COLLECTION_ITEMS_MAX) return err({ code: "COLLECTION_FULL", message: `A collection holds at most ${COLLECTION_ITEMS_MAX} cases.` });
        return ok(next);
      });
    },

    /**
     * Removes cases: input `{ collectionId, expectedVersion, caseIds }`, a case no longer approved
     * included. Removing every case left is refused (`COLLECTION_LAST_ITEM`: a collection has at
     * least one). `INVALID_INPUT`, `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async removeItems(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
      const parsed = parseInput(changeItemsInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, caseIds } = parsed.value;
      return changeItems(actor, collectionId, expectedVersion, COLLECTION_EVENTS.itemsRemoved, { removed: caseIds }, (items) => {
        const next = removeItems(items, caseIds);
        return next.length === 0 ? err({ code: "COLLECTION_LAST_ITEM", message: "A collection holds at least one case." }) : ok(next);
      });
    },

    /**
     * Moves a client's whole group: input `{ collectionId, expectedVersion, clientId, to }`, its
     * new place among the groups from 0. `INVALID_INPUT` (also a client not in it),
     * `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async moveGroup(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
      const parsed = parseInput(moveGroupInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, clientId, to } = parsed.value;
      return changeItems(actor, collectionId, expectedVersion, COLLECTION_EVENTS.groupMoved, { clientId, to }, (items) => {
        const next = moveGroup(items, clientId, to);
        return next === null ? err({ code: "INVALID_INPUT", message: "Invalid or missing: clientId.", details: { fields: ["clientId"] } }) : ok(next);
      });
    },

    /**
     * Moves one case within its own client's group (never into another): input `{ collectionId,
     * expectedVersion, caseId, to }`, its new place in the group from 0. `INVALID_INPUT` (also a
     * case not in it), `COLLECTION_NOT_FOUND`, `STALE_COLLECTION`.
     */
    async moveItem(actor: Actor, input: unknown): Promise<Result<CollectionWrite>> {
      const parsed = parseInput(moveItemInputSchema, input);
      if (!parsed.ok) return parsed;
      const { collectionId, expectedVersion, caseId, to } = parsed.value;
      return changeItems(actor, collectionId, expectedVersion, COLLECTION_EVENTS.itemMoved, { caseId, to }, (items) => {
        const next = moveItem(items, caseId, to);
        return next === null ? err({ code: "INVALID_INPUT", message: "Invalid or missing: caseId.", details: { fields: ["caseId"] } }) : ok(next);
      });
    },
  };
}

export type CollectionUseCases = ReturnType<typeof makeCollectionUseCases>;
