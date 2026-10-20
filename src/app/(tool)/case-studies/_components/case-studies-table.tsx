"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { StatusBadge } from "@/app/_components/status-badge";
import { wizardHref } from "@/app/_lib/routes";
import { CASE_STATUSES } from "@/shared/case-status";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import {
  DEFAULT_SORT,
  businessLineLabel,
  filterRows,
  nextSort,
  sortRows,
  type CaseStudyRow,
  type SortKey,
  type SortState,
  type StatusFilter,
} from "./filter-sort";

export interface CaseStudiesTableProps {
  /** The scoped list, loaded once by the page; search and sort run here. */
  rows: CaseStudyRow[];
  /** Policy decision (`create case`): whether the empty state offers "Nuova case history". */
  canCreate: boolean;
  /** The empty-state line; defaults to the Case history page's. */
  emptyMessage?: string;
  /** Where the empty state's "Nuova case history" goes; defaults to the wizard's step 0. */
  newHref?: string;
}

export const SEARCH_DEBOUNCE_MS = 250;

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "id", label: it.caseStudies.table.columns.id },
  { key: "name", label: it.caseStudies.table.columns.name },
  { key: "client", label: it.caseStudies.table.columns.client },
  { key: "year", label: it.caseStudies.table.columns.year },
  { key: "status", label: it.caseStudies.table.columns.status },
  { key: "businessLine", label: it.caseStudies.table.columns.businessLine },
  { key: "updated", label: it.caseStudies.table.columns.updated },
];

/** The status filter's segments, in order: *Tutti*, then the lifecycle. */
const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: it.caseStudies.filter.all },
  ...CASE_STATUSES.map((status) => ({ value: status, label: it.status[status] })),
];

/**
 * The status filter (Story 2.17): a segmented control (DESIGN.md: a pill track
 * with the selected segment filled), single choice, as a radiogroup. Only the
 * selected segment is in the tab order; the arrow keys move and select, wrapping,
 * and Home and End go to the first and last.
 */
function StatusSegments({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
  const segments = useRef<Array<HTMLButtonElement | null>>([]);

  function pick(index: number) {
    segments.current[index]?.focus();
    onChange(FILTERS[index].value);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const last = FILTERS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    pick(next);
  }

  return (
    <div role="radiogroup" aria-label={it.caseStudies.filter.label} className="inline-flex shrink-0 gap-0.5 rounded-full bg-surface-control p-[3px]">
      {FILTERS.map((filter, index) => (
        <button
          key={filter.value}
          ref={(element) => {
            segments.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={filter.value === value}
          tabIndex={filter.value === value ? 0 : -1}
          onClick={() => pick(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className="whitespace-nowrap rounded-full px-3 py-1.5 font-label text-xs text-foreground-muted hover:text-foreground aria-checked:bg-surface-selected aria-checked:text-foreground"
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

/** Input types that do not take typed text: `/` there still focuses search. */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isTextField(el: Element | null): boolean {
  if (el === null) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * The Case studies table: ID (the case history code, mono), Name, Client (its
 * current name), Year, Status, Business line (empty for cases created before Story
 * 2.17), Updated and Links (blank). Default sort Updated newest first; a header
 * click sorts by it, again reverses; ID sorts codes naturally. The top-right toolbar
 * holds the status filter (*Tutti* · Bozza · In elaborazione · Da approvare ·
 * Approvato, default *Tutti*) and the search "Cerca progetto o cliente…", which covers
 * name, client name, client code, case code and business line label (case- and
 * accent-insensitive, debounced); both apply together. `/` focuses the search unless
 * focus is already in a text field. A Bozza row opens
 * `/case-studies/new?caseId={id}`; other rows are not links yet.
 */
export function CaseStudiesTable({
  rows,
  canCreate,
  emptyMessage = it.caseStudies.empty,
  newHref = "/case-studies/new",
}: CaseStudiesTableProps) {
  const router = useRouter();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [status, setStatus] = useState<StatusFilter>("all");

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

  const visible = useMemo(() => sortRows(filterRows(rows, query, status), sort), [rows, query, status, sort]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-prose font-body text-base text-foreground">{emptyMessage}</p>
        {canCreate && (
          <Link href={newHref} className={PRIMARY_ACTION}>
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
    setStatus("all");
    searchRef.current?.focus();
  }

  const noResults =
    status === "all"
      ? fill(it.caseStudies.noResults, { query: query.trim() })
      : query.trim() === ""
        ? fill(it.caseStudies.noResultsStatus, { status: it.status[status] })
        : fill(it.caseStudies.noResultsQueryStatus, { query: query.trim(), status: it.status[status] });

  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    // The name link navigates on its own; modifier or non-primary clicks and text selection (copying an ID) do not navigate.
    if ((event.target as Element).closest("a")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    router.push(href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <StatusSegments value={status} onChange={setStatus} />
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
          className="w-72 rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted"
        />
      </div>

      {/* Always mounted, so screen readers announce the no-results message when it appears. */}
      <div role="status" className="font-body text-base text-foreground empty:hidden">
        {visible.length === 0 ? noResults : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected"
          >
            {it.caseStudies.clearSearch}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface-raised">
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
                      className="whitespace-nowrap px-3 py-2 font-label text-xs text-foreground-muted"
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
                <th scope="col" className="px-3 py-2 font-label text-xs text-foreground-muted">
                  {it.caseStudies.table.columns.links}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                // A Bozza reopens the wizard with no step: it picks the first incomplete one.
                const href = row.status === "draft" ? wizardHref(row.id) : null;
                return (
                  <tr
                    key={row.id}
                    data-case-id={row.id}
                    onClick={href === null ? undefined : (event) => openRow(event, href)}
                    className={cn("border-b last:border-b-0", href !== null && "cursor-pointer hover:bg-surface-control")}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground-muted">{row.code}</td>
                    <td className="px-3 py-2">
                      {href === null ? (
                        row.name
                      ) : (
                        <Link href={href} className="underline-offset-2 hover:underline">
                          {row.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.clientName}</td>
                    <td className="px-3 py-2 tabular-nums">{row.year}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{businessLineLabel(row)}</td>
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
