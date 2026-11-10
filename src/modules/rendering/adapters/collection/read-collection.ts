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
