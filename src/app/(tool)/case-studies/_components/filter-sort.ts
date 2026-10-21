import type { BusinessLine } from "@/modules/case-study";
import { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";
import { it } from "@/shared/i18n/it";

/** One row of the Case studies table, as the server hands it to the browser. */
export interface CaseStudyRow {
  /** The uuid: keys and hrefs only, never shown. */
  id: string;
  /** The readable case history code (e.g. `LUM-2026-01`), shown in the ID column. */
  code: string;
  name: string;
  /** The client's current name. */
  clientName: string;
  clientCode: string;
  year: number;
  status: CaseStatus;
  /** Null for cases created before Story 2.17 (the cell stays empty). */
  businessLine: BusinessLine | null;
  /** ISO timestamp, used for sorting. */
  updatedAt: string;
  /** `updatedAt` already formatted for display (Europe/Rome, Italian). */
  updatedLabel: string;
  /**
   * The case's public link, when it has one: the Link column shows an icon that opens it
   * in a new tab. Shareable links come with Story 5.5; until then no row sets it.
   */
  publicUrl?: string | null;
}

export const SORT_KEYS = ["id", "name", "client", "year", "status", "businessLine", "updated"] as const;
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

/** A row's business line as shown: its Italian label, or "" for a case without one. */
export const businessLineLabel = (row: Pick<CaseStudyRow, "businessLine">) =>
  row.businessLine === null ? "" : it.businessLines[row.businessLine];

/** The status filter: every status (*Tutti*) or exactly one. */
export type StatusFilter = CaseStatus | "all";

/**
 * Rows with the filtered status (`"all"` keeps every status) whose name, client
 * name, client code, case code or business line label contains `query`
 * (normalized); both must match. A blank query keeps every row of the status.
 */
export function filterRows(rows: readonly CaseStudyRow[], query: string, status: StatusFilter = "all"): CaseStudyRow[] {
  const needle = normalizeForSearch(query.trim());
  return rows.filter(
    (row) =>
      (status === "all" || row.status === status) &&
      (needle === "" ||
        [row.name, row.clientName, row.clientCode, row.code, businessLineLabel(row)].some((field) =>
          normalizeForSearch(field).includes(needle),
        )),
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
      // Natural order on the code: `LUM-2026-9` before `LUM-2026-10`.
      return collator.compare(a.code, b.code);
    case "client":
      return collator.compare(a.clientName, b.clientName);
    case "businessLine":
      // A case without one sorts before every label.
      return collator.compare(businessLineLabel(a), businessLineLabel(b));
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
