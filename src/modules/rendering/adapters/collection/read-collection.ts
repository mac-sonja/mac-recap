import * as collection from "@/modules/collection";
import type { CollectionSourceDeps } from "@/modules/rendering/application/export-source";
import { ok } from "@/shared/result";

/**
 * A live collection as an export reads it (Story 5.10b), through the collection module's index
 * only: its id, name and cases in order (a deleted case already left out). Wired in `server.ts`
 * and `worker.ts`. `COLLECTION_NOT_FOUND` for an unknown, malformed or deleted id.
 */
export async function readCollection(collectionId: string): ReturnType<CollectionSourceDeps["getCollection"]> {
  const found = await collection.getCollection(collectionId);
  if (!found.ok) return found;
  const { id, name, items } = found.value;
  return ok({ id, name, items: items.map((item) => ({ caseId: item.case.id, clientId: item.case.client.id })) });
}

/**
 * A live collection's own edits as an export applies them (Story 5.11b), through the collection
 * module's index only: its words for free texts, hidden pages and page orders, each part keyed as
 * `case:{caseId}` or `client_intro:{clientId}`. Edits of parts no longer in the collection are
 * already left out. `COLLECTION_NOT_FOUND` for an unknown, malformed or deleted id.
 */
export async function readCollectionEdits(collectionId: string): ReturnType<CollectionSourceDeps["getCollectionEdits"]> {
  const found = await collection.getCollectionEdits(collectionId);
  if (!found.ok) return found;
  const keyOf = (part: { kind: string; id: string }) => `${part.kind}:${part.id.toLowerCase()}`;
  const { textEdits, hiddenPages, pageOrders } = found.value;
  return ok({
    texts: textEdits.map((t) => ({ partKey: keyOf(t.part), formatId: t.formatId, pageKey: t.pageKey, elementId: t.elementId, text: t.text })),
    hidden: hiddenPages.map((h) => ({ partKey: keyOf(h.part), formatId: h.formatId, pageKey: h.pageKey })),
    orders: pageOrders.map((o) => ({ partKey: keyOf(o.part), formatId: o.formatId, pageKeys: [...o.pageKeys] })),
  });
}
