import { normalizeForSearch } from "@/app/(tool)/case-studies/_components/filter-sort";

/** One row of the Clients table, as the server hands it to the browser. */
export interface ClientRow {
  /** The uuid: keys and hrefs only, never shown. */
  id: string;
  /** The automatic client code (e.g. `LUM`), shown in the ID column. */
  code: string;
  name: string;
  /** Non-deleted case studies of this client. */
  caseCount: number;
  /** Of those, the approved ones: with at least one the card offers **Scarica** (the client pack). */
  approvedCount: number;
  /** Every required field is filled; an unfinished client's row opens its wizard. */
  complete: boolean;
  /** A signed URL of the client's logo (valid minutes), or null: the card then shows the monogram. */
  logoUrl: string | null;
}

export const CLIENT_SORT_KEYS = ["code", "name", "caseCount"] as const;
export type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number];
export interface ClientSortState {
  key: ClientSortKey;
  direction: "asc" | "desc";
}

/** Name A–Z. */
export const DEFAULT_CLIENT_SORT: ClientSortState = { key: "name", direction: "asc" };

/** Clicking a header sorts by it ascending; clicking the sorted header again reverses it. */
export function nextClientSort(current: ClientSortState, key: ClientSortKey): ClientSortState {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

/** Rows whose name or code contains `query` (case- and accent-insensitive); a blank query keeps every row. */
export function filterClientRows(rows: readonly ClientRow[], query: string): ClientRow[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === "") return [...rows];
  return rows.filter((row) => [row.name, row.code].some((field) => normalizeForSearch(field).includes(needle)));
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

function compare(a: ClientRow, b: ClientRow, key: ClientSortKey): number {
  // Codes sort naturally (`LUMA` after `LUM`, digits by value); names by Italian collation.
  return key === "caseCount" ? a.caseCount - b.caseCount : collator.compare(a[key], b[key]);
}

/** A sorted copy; ties keep their incoming order. */
export function sortClientRows(rows: readonly ClientRow[], { key, direction }: ClientSortState): ClientRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => sign * compare(a.row, b.row, key) || a.index - b.index)
    .map(({ row }) => row);
}
