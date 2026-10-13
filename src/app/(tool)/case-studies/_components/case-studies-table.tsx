"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { StatusBadge } from "@/app/_components/status-badge";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import {
  DEFAULT_SORT,
  filterRows,
  nextSort,
  sortRows,
  type CaseStudyRow,
  type SortKey,
  type SortState,
} from "./filter-sort";

export interface CaseStudiesTableProps {
  /** The scoped list, loaded once by the page; search and sort run here. */
  rows: CaseStudyRow[];
  /** Policy decision (`create case`): whether the empty state offers "Nuovo case study". */
  canCreate: boolean;
}

export const SEARCH_DEBOUNCE_MS = 250;

/** Until the Story 2.5 wizard: a Bozza row reopens the new-case-study placeholder. */
export const draftHref = (id: string) => `/case-studies/new?caseId=${encodeURIComponent(id)}`;

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "id", label: it.caseStudies.table.columns.id },
  { key: "name", label: it.caseStudies.table.columns.name },
  { key: "client", label: it.caseStudies.table.columns.client },
  { key: "year", label: it.caseStudies.table.columns.year },
  { key: "status", label: it.caseStudies.table.columns.status },
  { key: "updated", label: it.caseStudies.table.columns.updated },
];

/** Input types that do not take typed text: `/` there still focuses search. */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isTextField(el: Element | null): boolean {
  if (el === null) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

const PRIMARY_ACTION =
  "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-label text-sm text-primary-foreground hover:opacity-90";

/**
 * The Case studies table: ID, Name, Client, Year, Status, Updated and Links (blank).
 * Default sort Updated newest first; a header click sorts by it, again reverses.
 * Search covers name, client and ID (case- and accent-insensitive, debounced);
 * `/` focuses it unless focus is already in a text field. A Bozza row opens
 * `/case-studies/new?caseId={id}`; other rows are not links yet.
 */
export function CaseStudiesTable({ rows, canCreate }: CaseStudiesTableProps) {
  const router = useRouter();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

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

  const visible = useMemo(() => sortRows(filterRows(rows, query), sort), [rows, query, sort]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-prose font-body text-base text-foreground">{it.caseStudies.empty}</p>
        {canCreate && (
          <Link href="/case-studies/new" className={PRIMARY_ACTION}>
            <Plus aria-hidden="true" className="size-4" />
            {it.shell.nav.newCaseStudy}
          </Link>
        )}
      </div>
    );
  }

  function clearSearch() {
    setInput("");
    setQuery("");
    searchRef.current?.focus();
  }

  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    // The name link navigates on its own; modifier or non-primary clicks and text selection (copying an ID) do not navigate.
    if ((event.target as Element).closest("a")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    router.push(href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-md flex-col gap-1">
        <label htmlFor={searchId} className="sr-only">
          {it.caseStudies.search.label}
        </label>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          autoComplete="off"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={it.caseStudies.search.placeholder}
          className="w-full rounded-md border bg-surface-raised px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted"
        />
      </div>

      {/* Always mounted, so screen readers announce the no-results message when it appears. */}
      <div role="status" className="font-body text-base text-foreground empty:hidden">
        {visible.length === 0 ? fill(it.caseStudies.noResults, { query: query.trim() }) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md border bg-surface-raised px-3 py-2 font-label text-sm text-foreground hover:bg-surface"
          >
            {it.caseStudies.clearSearch}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-surface-raised">
          <table className="w-full border-collapse text-left font-body text-sm text-foreground">
            <caption className="sr-only">{it.caseStudies.table.caption}</caption>
            <thead className="border-b">
              <tr>
                {COLUMNS.map(({ key, label }) => {
                  const active = sort.key === key;
                  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                      className="whitespace-nowrap px-3 py-2 font-label text-xs font-semibold text-foreground-muted"
                    >
                      <button
                        type="button"
                        onClick={() => setSort((current) => nextSort(current, key))}
                        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
                      >
                        {label}
                        <Arrow aria-hidden="true" className={cn("size-3", !active && "invisible")} />
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="px-3 py-2 font-label text-xs font-semibold text-foreground-muted">
                  {it.caseStudies.table.columns.links}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const href = row.status === "draft" ? draftHref(row.id) : null;
                return (
                  <tr
                    key={row.id}
                    data-case-id={row.id}
                    onClick={href === null ? undefined : (event) => openRow(event, href)}
                    className={cn("border-b last:border-b-0", href !== null && "cursor-pointer hover:bg-surface")}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground-muted">{row.id}</td>
                    <td className="px-3 py-2">
                      {href === null ? (
                        row.name
                      ) : (
                        <Link href={href} className="underline-offset-2 hover:underline">
                          {row.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.client}</td>
                    <td className="px-3 py-2 tabular-nums">{row.year}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      <time dateTime={row.updatedAt}>{row.updatedLabel}</time>
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
