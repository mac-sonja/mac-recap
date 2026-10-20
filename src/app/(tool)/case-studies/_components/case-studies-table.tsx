"use client";

import { ArrowDown, ArrowUp, FolderOpen, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { CARD, SEARCH_FIELD, SEARCH_ICON, TH } from "@/app/_components/field-styles";
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
  /** Where the empty state's call to action goes; defaults to the wizard's step 0. */
  newHref?: string;
  /** The empty state's call to action label. */
  emptyAction?: string;
  /**
   * Shows **Crea una case** at the left of the toolbar (the Case page, with `create case`).
   * A client's page leaves it out: its header already has its own call to action.
   */
  showCreate?: boolean;
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

/** The status filter's segments, in order: *Tutte*, then the lifecycle (plural labels). */
const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "all", label: it.caseStudies.filter.all },
  ...CASE_STATUSES.map((status) => ({ value: status, label: it.caseStudies.filter.statuses[status] })),
];

/**
 * The status filter (Story 2.17): a segmented control (DESIGN.md: a pill track
 * with the selected segment filled), single choice, as a radiogroup. Only the
 * selected segment is in the tab order; the arrow keys move and select, wrapping,
 * and Home and End go to the first and last.
 */
function StatusSegments({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  /** Rows per segment under the current search. */
  counts: Readonly<Record<StatusFilter, number>>;
}) {
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
          className="inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 font-label text-[13px] text-foreground-muted transition-colors duration-150 hover:text-foreground aria-checked:bg-surface-raised aria-checked:font-medium aria-checked:text-foreground aria-checked:shadow-control"
        >
          {filter.label}
          <span className="font-mono text-[11px] text-foreground-muted tabular-nums"> {counts[filter.value]}</span>
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
 * click sorts by it, again reverses; ID sorts codes naturally. The toolbar above the table
 * holds the status filter (*Tutte* · Bozze · In creazione · Da rivedere ·
 * Approvate, each with its count, default *Tutte*) and the search, which covers
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
  emptyAction = it.caseStudies.emptyAction,
  showCreate = false,
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
  const counts = useMemo(() => {
    const matching = filterRows(rows, query, "all");
    const byStatus: Record<StatusFilter, number> = { all: matching.length, draft: 0, generating: 0, in_review: 0, approved: 0 };
    for (const row of matching) byStatus[row.status] += 1;
    return byStatus;
  }, [rows, query]);

  if (rows.length === 0) {
    return (
      <div className={cn(CARD, "flex flex-col items-center gap-4 px-8 py-14 text-center")}>
        <span className="flex size-11 items-center justify-center rounded-full bg-surface-control text-foreground-muted">
          <FolderOpen aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <p className="max-w-sm font-body text-[15px] leading-snug text-foreground-muted">{emptyMessage}</p>
        {canCreate && (
          <Link href={newHref} className={PRIMARY_ACTION}>
            {emptyAction}
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
        ? fill(it.caseStudies.noResultsStatus, { status: it.caseStudies.filter.statuses[status] })
        : fill(it.caseStudies.noResultsQueryStatus, { query: query.trim(), status: it.caseStudies.filter.statuses[status] });

  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    // The name link navigates on its own; modifier or non-primary clicks and text selection (copying an ID) do not navigate.
    if ((event.target as Element).closest("a")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    router.push(href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showCreate ? (
          <Link href={newHref} className={cn(PRIMARY_ACTION, "hidden lg:inline-flex")}>
            {it.caseStudies.add}
          </Link>
        ) : (
          <span />
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          <label htmlFor={searchId} className="sr-only">
            {it.caseStudies.search.label}
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
              placeholder={it.caseStudies.search.placeholder}
              className={SEARCH_FIELD}
            />
          </div>
          <StatusSegments value={status} onChange={setStatus} counts={counts} />
        </div>
      </div>

      {/* Always mounted, so screen readers announce the no-results message when it appears. */}
      <div role="status" className="font-body text-[15px] text-foreground empty:hidden">
        {visible.length === 0 ? noResults : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <button type="button" onClick={clearSearch} className={SECONDARY_ACTION}>
            {it.caseStudies.clearSearch}
          </button>
        </div>
      ) : (
        <div className={cn(CARD, "overflow-x-auto")}>
          <table className="w-full border-collapse text-left font-body text-sm text-foreground">
            <caption className="sr-only">{it.caseStudies.table.caption}</caption>
            <thead className="border-b border-border">
              <tr>
                {COLUMNS.map(({ key, label }) => {
                  const active = sort.key === key;
                  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                      className={TH}
                    >
                      <button
                        type="button"
                        onClick={() => setSort((current) => nextSort(current, key))}
                        className={cn("inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground", active && "text-foreground")}
                      >
                        {label}
                        <Arrow aria-hidden="true" className={cn("size-3", !active && "invisible")} />
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className={TH}>
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
                    className={cn(
                      "border-b border-border transition-colors duration-150 last:border-b-0",
                      href !== null && "cursor-pointer hover:bg-surface-hover",
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-foreground-muted">{row.code}</td>
                    <td className="px-4 py-3.5 font-medium text-foreground-strong">
                      {href === null ? (
                        row.name
                      ) : (
                        <Link href={href} className="underline-offset-2 hover:underline">
                          {row.name}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-foreground">{row.clientName}</td>
                    <td className="px-4 py-3.5 text-foreground-muted tabular-nums">{row.year}</td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-foreground-muted">{businessLineLabel(row)}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-foreground-muted tabular-nums">
                      <time dateTime={row.updatedAt}>{row.updatedLabel}</time>
                    </td>
                    <td className="px-4 py-3.5" />
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
