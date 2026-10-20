"use client";

import { Building2, ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { CARD, SEARCH_FIELD, SEARCH_ICON } from "@/app/_components/field-styles";
import { clientHref, clientWizardHref } from "@/app/_lib/routes";
import { SEARCH_DEBOUNCE_MS } from "@/app/(tool)/case-studies/_components/case-studies-table";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import {
  DEFAULT_CLIENT_SORT,
  filterClientRows,
  sortClientRows,
  type ClientRow,
  type ClientSortState,
} from "./filter-sort";

export interface ClientsTableProps {
  /** Every client, loaded once by the page; search and sort run here. */
  rows: ClientRow[];
  /** Policy decision (`manage clients`): whether **Aggiungi cliente** exists. */
  canManage: boolean;
}

/** The sort menu's options: a sort key and direction each. */
const SORTS: ReadonlyArray<{ value: string; label: string; sort: ClientSortState }> = [
  { value: "name-asc", label: it.clients.sort.nameAsc, sort: DEFAULT_CLIENT_SORT },
  { value: "name-desc", label: it.clients.sort.nameDesc, sort: { key: "name", direction: "desc" } },
  { value: "cases-desc", label: it.clients.sort.mostCases, sort: { key: "caseCount", direction: "desc" } },
  { value: "code-asc", label: it.clients.sort.code, sort: { key: "code", direction: "asc" } },
];

/** Monogram fills (globals.css); listed whole so Tailwind generates them. */
const MONOGRAMS = [
  "bg-monogram-1",
  "bg-monogram-2",
  "bg-monogram-3",
  "bg-monogram-4",
  "bg-monogram-5",
  "bg-monogram-6",
  "bg-monogram-7",
];

function monogramTone(code: string): string {
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MONOGRAMS[hash % MONOGRAMS.length];
}

/** A client's initial on a deep colour tile (the card's mark until logos reach the list). */
function Monogram({ name, code }: { name: string; code: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-md font-display text-lg font-medium text-monogram-foreground italic shadow-monogram",
        monogramTone(code),
      )}
    >
      {name.trim().charAt(0).toLocaleUpperCase("it-IT")}
    </span>
  );
}

/** Input types that do not take typed text: `/` there still focuses search (as on the Case history table). */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isTextField(el: Element | null): boolean {
  if (el === null) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Where a row goes: a finished client's page, or an unfinished client's wizard at
 * step 1 (a required field is empty). Story 2.16 adds the material check.
 */
export const rowHref = (row: Pick<ClientRow, "id">) => clientHref(row.id);

/**
 * The Clients grid: one card per client with its initial, name, code (mono), case
 * count and whether its profile is complete. Default order Name A–Z; the sort menu
 * offers Z–A, most cases and code. Search covers name and code (case- and
 * accent-insensitive, debounced); `/` focuses it unless focus is already in a text
 * field. Every card opens the client's page (`rowHref`; owner, 2026-10-19), where
 * **Modifica** reopens the wizard. **Aggiungi cliente** (only with `manage clients`)
 * opens the client wizard; it is hidden below 1024 px, where the page is read-only.
 */
export function ClientsTable({ rows, canManage }: ClientsTableProps) {
  const searchId = useId();
  const sortId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sortValue, setSortValue] = useState(SORTS[0].value);
  const sort = (SORTS.find((option) => option.value === sortValue) ?? SORTS[0]).sort;

  useEffect(() => {
    if (input === query) return;
    const timer = setTimeout(() => setQuery(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) {
        return;
      }
      const search = searchRef.current;
      if (search === null || isTextField(document.activeElement)) return;
      event.preventDefault();
      search.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const visible = useMemo(() => sortClientRows(filterClientRows(rows, query), sort), [rows, query, sort]);

  const addButton = canManage ? (
    <Link href={clientWizardHref()} className={cn(PRIMARY_ACTION, "hidden lg:inline-flex")}>
      {it.clients.add}
    </Link>
  ) : null;

  if (rows.length === 0) {
    return (
      <div className={cn(CARD, "flex flex-col items-center gap-4 px-8 py-14 text-center")}>
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-control text-foreground-muted">
          <Building2 aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <p className="max-w-sm font-body text-[15px] leading-snug text-foreground-muted">
          {canManage ? (
            <>
              {/* Aggiungi cliente is hidden below 1024 px: the line there doesn't invite an add. */}
              <span className="lg:hidden">{it.clients.emptyReadOnly}</span>
              <span className="hidden lg:inline">{it.clients.empty}</span>
            </>
          ) : (
            it.clients.emptyReadOnly
          )}
        </p>
        {addButton}
      </div>
    );
  }

  function clearSearch() {
    setInput("");
    setQuery("");
    searchRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {addButton ?? <span />}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <label htmlFor={searchId} className="sr-only">
            {it.clients.search.label}
          </label>
          <div className="relative w-72">
            <Search aria-hidden="true" className={SEARCH_ICON} />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              autoComplete="off"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={it.clients.search.placeholder}
              className={SEARCH_FIELD}
            />
          </div>
          <label htmlFor={sortId} className="sr-only">
            {it.clients.sort.label}
          </label>
          <div className="relative">
            <select
              id={sortId}
              value={sortValue}
              onChange={(event) => setSortValue(event.target.value)}
              className="h-9 appearance-none rounded-full border border-transparent bg-surface-control pr-8 pl-3.5 font-label text-[13px] text-foreground transition-colors hover:bg-surface-selected"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-foreground-muted" />
          </div>
        </div>
      </div>

      {/* Always mounted, so screen readers announce the no-results message when it appears. */}
      <div role="status" className="font-body text-[15px] text-foreground empty:hidden">
        {visible.length === 0 ? fill(it.clients.noResults, { query: query.trim() }) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <button type="button" onClick={clearSearch} className={SECONDARY_ACTION}>
            {it.clients.clearSearch}
          </button>
        </div>
      ) : (
        <ul aria-label={it.clients.table.caption} className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {visible.map((row) => {
            const href = rowHref(row);
            return (
              <li key={row.id} data-client-id={row.id}>
                <Link
                  href={href}
                  className={cn(
                    CARD,
                    "group flex h-full flex-col gap-4 p-4 transition-[box-shadow,transform] duration-200 ease-out hover:shadow-popover active:scale-[0.99]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Monogram name={row.name} code={row.code} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-label text-[15px] font-semibold text-foreground-strong">{row.name}</span>
                      <span className="font-mono text-xs text-foreground-muted">
                        <span className="sr-only">{`${it.clients.detail.code} `}</span>
                        {row.code}
                      </span>
                    </span>
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-surface-control px-2 py-0.5 font-label text-badge font-medium text-foreground-muted tabular-nums">
                      {row.caseCount === 1 ? it.clients.caseCountOne : fill(it.clients.caseCount, { n: row.caseCount })}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1.5 font-label text-badge font-medium before:size-1.5 before:rounded-full before:content-['']",
                        row.complete
                          ? "bg-status-approved-tint text-status-approved-foreground before:bg-status-approved"
                          : "bg-status-review-tint text-status-review-foreground before:bg-status-review",
                      )}
                    >
                      {row.complete ? it.clients.complete : it.clients.incomplete}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
