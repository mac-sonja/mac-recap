import { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";

/** One row of the Case studies table, as the server hands it to the browser. */
export interface CaseStudyRow {
  id: string;
  name: string;
  client: string;
  year: number;
  status: CaseStatus;
  /** ISO timestamp, used for sorting. */
  updatedAt: string;
  /** `updatedAt` already formatted for display (Europe/Rome, Italian). */
  updatedLabel: string;
}

export const SORT_KEYS = ["id", "name", "client", "year", "status", "updated"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

/** Updated, newest first. */
export const DEFAULT_SORT: SortState = { key: "updated", direction: "desc" };

/** Clicking a header sorts by it ascending; clicking the sorted header again reverses it. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, direction: "asc" };
  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

/** Case- and accent-insensitive form: Unicode NFD, combining marks stripped, lower-cased. */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Rows whose name, client or ID contains `query` (normalized); a blank query keeps every row. */
export function filterRows(rows: readonly CaseStudyRow[], query: string): CaseStudyRow[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === "") return [...rows];
  return rows.filter((row) =>
    [row.name, row.client, row.id].some((field) => normalizeForSearch(field).includes(needle)),
  );
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

function compare(a: CaseStudyRow, b: CaseStudyRow, key: SortKey): number {
  switch (key) {
    case "year":
      return a.year - b.year;
    case "status":
      // Lifecycle order: Bozza, In elaborazione, Da approvare, Approvato.
      return CASE_STATUSES.indexOf(a.status) - CASE_STATUSES.indexOf(b.status);
    case "updated":
      return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    case "id":
      // Lexical: UUIDs are hex, so the numeric collator would misorder digit runs.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    default:
      return collator.compare(a[key], b[key]);
  }
}

/** A sorted copy; ties keep their incoming order. */
export function sortRows(rows: readonly CaseStudyRow[], { key, direction }: SortState): CaseStudyRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => sign * compare(a.row, b.row, key) || a.index - b.index)
    .map(({ row }) => row);
}
