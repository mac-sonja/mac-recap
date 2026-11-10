import { z } from "zod";

/**
 * Story 5.10a: a collection, a named set of approved case histories from any clients, gathered
 * for a pitch. It holds case ids only, never a copy of a case: every read resolves them to the
 * case's current approved revision and the client's current info. Its cases sit in groups, one
 * per client, each client's cases next to each other.
 */

/** A collection's name, in characters (code points) after trimming (`collection_name_check` matches). */
export const COLLECTION_NAME_MAX = 120;
/** The most cases one collection holds (`collection_check_items` matches). */
export const COLLECTION_ITEMS_MAX = 200;
/** The kinds of tag: a business line (from `BUSINESS_LINES`) or a client industry (a `client_sector` key). */
export const COLLECTION_TAG_KINDS = ["business_line", "industry"] as const;
export type CollectionTagKind = (typeof COLLECTION_TAG_KINDS)[number];

/** The event types the writers log (`collection_event.type`). */
export const COLLECTION_EVENTS = {
  created: "collection_created",
  renamed: "collection_renamed",
  retagged: "collection_retagged",
  itemsAdded: "collection_items_added",
  itemsRemoved: "collection_items_removed",
  groupMoved: "collection_group_moved",
  itemMoved: "collection_item_moved",
  deleted: "collection_deleted",
  /** Story 5.10b: a file of it was handed out (`data { exportId, format }`). */
  exported: "collection_exported",
} as const;

/** A sector key, as `client_sector_key_check` allows it. */
const SECTOR_KEY = /^[a-z0-9_]{1,48}$/;

const NO_NUL = (value: string) => !value.includes("\u0000");
const charCount = (text: string) => [...text].length;

/** A collection's name: trimmed, 1–120 characters. */
export const collectionNameSchema = z
  .string()
  .refine(NO_NUL)
  .transform((value) => value.trim())
  .refine((value) => charCount(value) >= 1 && charCount(value) <= COLLECTION_NAME_MAX);

const id = () => z.uuid().transform((value) => value.toLowerCase());
const unique = <T>(values: readonly T[]) => new Set(values).size === values.length;

/**
 * A collection's tags: at least one business line and at least one industry, each once.
 * Business lines are checked against `BUSINESS_LINES` by the use case (the domain imports no
 * other module); industries exist in `client_sector` (checked in SQL).
 */
export const collectionTagsSchema = z.object({
  businessLines: z.array(z.string().min(1).max(48)).min(1).max(20).refine(unique),
  industries: z.array(z.string().regex(SECTOR_KEY)).min(1).max(100).refine(unique),
});
export type CollectionTags = z.infer<typeof collectionTagsSchema>;

const version = () => z.number().int().min(1);
const caseIds = (min: number) => z.array(id()).min(min).max(COLLECTION_ITEMS_MAX).refine(unique, "Each case at most once.");

/** `createCollection`'s input: the name, the tags and the selected cases in the order they were selected. */
export const createCollectionInputSchema = z.strictObject({
  name: collectionNameSchema,
  businessLines: collectionTagsSchema.shape.businessLines,
  industries: collectionTagsSchema.shape.industries,
  caseIds: caseIds(1),
});
export type CreateCollectionInput = z.infer<typeof createCollectionInputSchema>;

export const renameCollectionInputSchema = z.strictObject({
  collectionId: id(),
  expectedVersion: version(),
  name: collectionNameSchema,
});

export const retagCollectionInputSchema = z.strictObject({
  collectionId: id(),
  expectedVersion: version(),
  businessLines: collectionTagsSchema.shape.businessLines,
  industries: collectionTagsSchema.shape.industries,
});

export const deleteCollectionInputSchema = z.strictObject({ collectionId: id() });

export const changeItemsInputSchema = z.strictObject({
  collectionId: id(),
  expectedVersion: version(),
  caseIds: caseIds(1),
});

export const moveGroupInputSchema = z.strictObject({
  collectionId: id(),
  expectedVersion: version(),
  clientId: id(),
  /** The group's new place among the groups, from 0 (clamped). */
  to: z.number().int().min(0).max(COLLECTION_ITEMS_MAX),
});

export const moveItemInputSchema = z.strictObject({
  collectionId: id(),
  expectedVersion: version(),
  caseId: id(),
  /** The case's new place within its client's group, from 0 (clamped). */
  to: z.number().int().min(0).max(COLLECTION_ITEMS_MAX),
});

/** `recordCollectionExported`'s input (Story 5.10b): the export handed out and its format (a format id or `bundle`). */
export const recordExportedInputSchema = z.strictObject({
  collectionId: id(),
  exportId: id(),
  format: z.string().regex(/^[a-z0-9_]{1,64}$/),
});

/** A collection as stored: its case ids in order, soft-deleted cases included (reads drop them). */
export interface StoredCollection {
  id: string;
  name: string;
  version: number;
  tags: CollectionTags;
  caseIds: string[];
  createdBy: { id: string; name: string | null };
  createdAt: string;
  updatedAt: string;
}

/** What a write returns: the collection's new version and, for an items change, its cases in order. */
export interface CollectionWrite {
  collectionId: string;
  version: number;
  caseIds: string[];
}

/** One case of a collection, with the client it belongs to (its group). */
export interface GroupedItem {
  caseId: string;
  clientId: string;
}

/** The cases of one client in a collection, in order. */
export interface ItemGroup {
  clientId: string;
  caseIds: string[];
}

/** The items in groups, one per client, in order of each group's first case. */
export function groupsOf(items: readonly GroupedItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  const byClient = new Map<string, ItemGroup>();
  for (const item of items) {
    let group = byClient.get(item.clientId);
    if (group === undefined) {
      group = { clientId: item.clientId, caseIds: [] };
      byClient.set(item.clientId, group);
      groups.push(group);
    }
    group.caseIds.push(item.caseId);
  }
  return groups;
}

const flatten = (groups: readonly ItemGroup[]): string[] => groups.flatMap((g) => g.caseIds);

/**
 * The selected cases in the order a new collection keeps them (owner default, 2026-11-10): the
 * order they were selected in, each client's cases gathered where its first selected case was.
 */
export const orderForCreate = (selected: readonly GroupedItem[]): string[] => flatten(groupsOf(selected));

/**
 * `current` with `added` joined (owner default, 2026-11-10): each case at the end of its client's
 * group, or, for a client not in the collection yet, in a new group at the end. Cases already in
 * it are skipped.
 */
export function addItems(current: readonly GroupedItem[], added: readonly GroupedItem[]): string[] {
  const groups = groupsOf(current);
  const present = new Set(current.map((i) => i.caseId));
  for (const item of added) {
    if (present.has(item.caseId)) continue;
    present.add(item.caseId);
    const group = groups.find((g) => g.clientId === item.clientId);
    if (group === undefined) groups.push({ clientId: item.clientId, caseIds: [item.caseId] });
    else group.caseIds.push(item.caseId);
  }
  return flatten(groups);
}

/** `current` without `removed`. */
export const removeItems = (current: readonly GroupedItem[], removed: readonly string[]): string[] => {
  const gone = new Set(removed);
  return current.map((i) => i.caseId).filter((id) => !gone.has(id));
};

/** `list` with the entry at `from` moved to `to` (clamped). */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [entry] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, entry!);
  return next;
}

/** `current` with client `clientId`'s whole group moved to place `to` among the groups; null when it isn't there. */
export function moveGroup(current: readonly GroupedItem[], clientId: string, to: number): string[] | null {
  const groups = groupsOf(current);
  const from = groups.findIndex((g) => g.clientId === clientId);
  if (from < 0) return null;
  return flatten(moved(groups, from, to));
}

/** `current` with case `caseId` moved to place `to` within its own client's group; null when it isn't there. */
export function moveItem(current: readonly GroupedItem[], caseId: string, to: number): string[] | null {
  const groups = groupsOf(current);
  const group = groups.find((g) => g.caseIds.includes(caseId));
  if (group === undefined) return null;
  group.caseIds = moved(group.caseIds, group.caseIds.indexOf(caseId), to);
  return flatten(groups);
}

/** Whether `ids` are in the same order as `current`. */
export const sameOrder = (current: readonly GroupedItem[], ids: readonly string[]) =>
  current.length === ids.length && current.every((item, i) => item.caseId === ids[i]);
