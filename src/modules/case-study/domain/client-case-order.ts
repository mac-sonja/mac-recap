import { z } from "zod";

/**
 * Story 4.12b: the order of a client's cases in its file, and in its client pack (B5). One
 * saved list of case ids per client (`client_case_order`); none until the owner reorders.
 */

/** The most ids one saved order holds (as `set_client_case_order` checks). */
export const CLIENT_CASE_ORDER_MAX = 500;

/** `setClientCaseOrder`'s input: the client, and its case ids in the order wanted, each once. */
export const setClientCaseOrderInputSchema = z.strictObject({
  clientId: z.uuid().transform((id) => id.toLowerCase()),
  caseIds: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .max(CLIENT_CASE_ORDER_MAX)
    .refine((ids) => new Set(ids).size === ids.length, "Each case at most once."),
});
export type SetClientCaseOrderInput = z.infer<typeof setClientCaseOrderInputSchema>;

/** What `setClientCaseOrder` saved: the client's case ids in order. */
export interface ClientCaseOrder {
  clientId: string;
  caseIds: string[];
}

/**
 * The ordering rule (owner decisions 2026-10-28 and 2026-11-10), pure: `cases` (a client's
 * approved cases) in the client's `saved` order. With no saved order, newest created first.
 * With one, the saved cases come in that order, then any case not in it (approved later),
 * newest created first. Saved ids with no case in `cases` (deleted, no longer approved) are
 * skipped. Ids are compared case-insensitively; equal creation times keep `cases`' order.
 */
export function orderClientCases<T extends { id: string; createdAt: string }>(cases: readonly T[], saved: readonly string[] | null): T[] {
  const newestFirst = [...cases].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (saved === null || saved.length === 0) return newestFirst;
  const byId = new Map(newestFirst.map((c) => [c.id.toLowerCase(), c]));
  const arranged: T[] = [];
  for (const id of saved) {
    const found = byId.get(id.toLowerCase());
    if (found === undefined) continue;
    arranged.push(found);
    byId.delete(id.toLowerCase());
  }
  return [...arranged, ...newestFirst.filter((c) => byId.has(c.id.toLowerCase()))];
}
