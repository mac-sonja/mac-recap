import { matchesCaseSearch, type SearchableCase } from "@/app/(tool)/case-studies/_components/filter-sort";
import type { BusinessLine } from "@/modules/case-study";

/** One approved case as the library lists it (Story 5.1). */
export interface LibraryCase extends SearchableCase {
  /** The uuid: keys and hrefs only. */
  id: string;
  code: string;
  name: string;
  clientName: string;
  clientCode: string;
  year: number;
  businessLines: readonly BusinessLine[];
  /** When the case was approved (its latest `approve` event); null without that event. */
  approvedAt: string | null;
  /** The case's last update: the approval time's stand-in when it has none. */
  updatedAt: string;
}

/** Cards per page. */
export const PAGE_SIZE = 24;

/** The longest search text kept from the address, as the table does. */
const MAX_QUERY = 200;

/** The library's state, as the address holds it: `?q=`, `?cliente=` (client codes), `?anno=`, `?pagina=`. */
export interface LibraryState {
  q: string;
  /** Client codes; values in the facet add up (OR). */
  clients: string[];
  /** Years; values in the facet add up (OR). */
  years: number[];
  /** 1-based; clamped to the pages there are when paginating. */
  page: number;
}

export const EMPTY_STATE: LibraryState = { q: "", clients: [], years: [], page: 1 };

/** A page's search params, as Next hands them to the page. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

const all = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/**
 * The state from the address. Repeated `cliente` and `anno` values each count; blank,
 * repeated and malformed ones (a year that isn't four digits, a page that isn't a
 * positive whole number) are dropped.
 */
export function parseLibraryState(params: SearchParams | undefined): LibraryState {
  const q = all(params?.q)[0] ?? "";
  const clients = unique(all(params?.cliente).map((code) => code.trim()).filter((code) => code !== ""));
  const years = unique(
    all(params?.anno)
      .filter((year) => /^\d{4}$/.test(year.trim()))
      .map((year) => Number(year.trim())),
  );
  const rawPage = all(params?.pagina)[0]?.trim() ?? "";
  const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1;
  return { q: q.slice(0, MAX_QUERY), clients, years, page };
}

/** `/library` with `state` in its address, in a stable order; empty values and page 1 are left out. */
export function libraryHref(state: LibraryState): string {
  const params = new URLSearchParams();
  if (state.q.trim() !== "") params.set("q", state.q);
  for (const code of state.clients) params.append("cliente", code);
  for (const year of state.years) params.append("anno", String(year));
  if (state.page > 1) params.set("pagina", String(state.page));
  const query = params.toString();
  return query === "" ? "/library" : `/library?${query}`;
}

/**
 * The cases that match the search (the table's rules) and every facet: within a facet
 * any selected value matches (OR), facets and search all apply (AND). An empty facet
 * keeps every case.
 */
export function filterCases<T extends LibraryCase>(cases: readonly T[], state: Pick<LibraryState, "q" | "clients" | "years">): T[] {
  const clients = new Set(state.clients);
  const years = new Set(state.years);
  return cases.filter(
    (c) =>
      (clients.size === 0 || clients.has(c.clientCode)) &&
      (years.size === 0 || years.has(c.year)) &&
      matchesCaseSearch(c, state.q),
  );
}

export interface FacetOptions {
  /** Each client with an approved case, by name. */
  clients: { code: string; name: string }[];
  /** Each year with an approved case, newest first. */
  years: number[];
}

const collator = new Intl.Collator("it", { sensitivity: "base", numeric: true });

/** The facets' values: the clients and years of the approved cases. */
export function facetOptions(cases: readonly LibraryCase[]): FacetOptions {
  const clients = new Map<string, string>();
  for (const c of cases) if (!clients.has(c.clientCode)) clients.set(c.clientCode, c.clientName);
  return {
    clients: [...clients].map(([code, name]) => ({ code, name })).sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.code, b.code)),
    years: unique(cases.map((c) => c.year)).sort((a, b) => b - a),
  };
}

/** `state` without facet values no approved case has (a client gone from the library, a typo in the address). */
export function withKnownFacets(state: LibraryState, options: FacetOptions): LibraryState {
  const codes = new Set(options.clients.map((c) => c.code));
  const years = new Set(options.years);
  return { ...state, clients: state.clients.filter((code) => codes.has(code)), years: state.years.filter((year) => years.has(year)) };
}

/** When the case was approved, for sorting: its approval time, else its last update. */
const approvalTime = (c: Pick<LibraryCase, "approvedAt" | "updatedAt">) => Date.parse(c.approvedAt ?? c.updatedAt);

/** A copy, newest approval first; ties keep their incoming order. */
export function sortByApproval<T extends Pick<LibraryCase, "approvedAt" | "updatedAt">>(cases: readonly T[]): T[] {
  return cases
    .map((c, index) => ({ c, index }))
    .sort((a, b) => approvalTime(b.c) - approvalTime(a.c) || a.index - b.index)
    .map(({ c }) => c);
}

export interface PageOf<T> {
  items: T[];
  /** The page shown, 1-based: the asked one clamped to the pages there are. */
  page: number;
  /** At least 1, so an empty list still has its page 1. */
  pageCount: number;
  total: number;
}

/** The `page`th run of `PAGE_SIZE`; a page past the last shows the last, below 1 the first. */
export function paginate<T>(items: readonly T[], page: number, size: number = PAGE_SIZE): PageOf<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const shown = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: items.slice((shown - 1) * size, shown * size), page: shown, pageCount, total: items.length };
}

/**
 * The page numbers the pager shows: the first, the last, and the current one with its
 * neighbours; `null` marks a gap. Every number when there are 7 pages or fewer.
 */
export function pagerItems(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const wanted = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const n of sorted) {
    const last = out.at(-1);
    if (typeof last === "number" && n - last > 1) out.push(n - last === 2 ? last + 1 : null);
    out.push(n);
  }
  return out;
}
