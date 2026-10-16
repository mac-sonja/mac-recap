"use client";

import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { SEARCH_DEBOUNCE_MS } from "@/app/(tool)/case-studies/_components/case-studies-table";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { ClientDialog, type ClientLimits } from "./client-dialog";
import {
  DEFAULT_CLIENT_SORT,
  filterClientRows,
  nextClientSort,
  sortClientRows,
  type ClientRow,
  type ClientSortKey,
  type ClientSortState,
} from "./filter-sort";

export interface ClientsTableProps {
  /** Every client, loaded once by the page; search and sort run here. */
  rows: ClientRow[];
  /** Policy decision (`manage clients`): whether **Aggiungi cliente** exists. */
  canManage: boolean;
  /** The add dialog's limits (`CLIENT_*_MAX`, `LOGO_*`). */
  limits: ClientLimits;
}

const COLUMNS: ReadonlyArray<{ key: ClientSortKey; label: string; numeric?: boolean }> = [
  { key: "code", label: it.clients.table.columns.code },
  { key: "name", label: it.clients.table.columns.name },
  { key: "caseCount", label: it.clients.table.columns.caseCount, numeric: true },
];

/** Input types that do not take typed text: `/` there still focuses search (as on the Case history table). */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isTextField(el: Element | null): boolean {
  if (el === null) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return (el as HTMLElement).isContentEditable === true;
}

/** How long after a save the refreshed list may still take focus back to **Aggiungi cliente**. */
const REFOCUS_WINDOW_MS = 5000;

export const clientHref = (id: string) => `/clients/${encodeURIComponent(id)}`;

/**
 * The Clients table: Codice (mono), Nome and Case history (non-deleted count).
 * Default sort Name A–Z; a header click sorts by it, again reverses. Search covers
 * name and code (case- and accent-insensitive, debounced); `/` focuses it unless focus
 * is already in a text field. A row opens the client's
 * page. **Aggiungi cliente** (only with `manage clients`) opens the add dialog; it
 * is hidden below 1024 px, where the page is read-only. After a save the page is
 * refreshed and focus goes back to **Aggiungi cliente**.
 */
export function ClientsTable({ rows, canManage, limits }: ClientsTableProps) {
  const router = useRouter();
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const refocusAdd = useRef(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ClientSortState>(DEFAULT_CLIENT_SORT);
  const [adding, setAdding] = useState(false);

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

  // After an add, the refreshed rows may swap the empty state's button for the
  // toolbar's: focus whichever **Aggiungi cliente** is now mounted.
  useEffect(() => {
    if (!refocusAdd.current) return;
    refocusAdd.current = false;
    addRef.current?.focus();
  }, [rows]);

  const visible = useMemo(() => sortClientRows(filterClientRows(rows, query), sort), [rows, query, sort]);

  const addButton = canManage ? (
    <button ref={addRef} type="button" onClick={() => setAdding(true)} className={cn(PRIMARY_ACTION, "hidden lg:inline-flex")}>
      <Plus aria-hidden="true" className="size-4" />
      {it.clients.add}
    </button>
  ) : null;

  const dialog = adding ? (
    <ClientDialog
      mode={{ kind: "add" }}
      limits={limits}
      onClose={() => {
        refocusAdd.current = false;
        setAdding(false);
      }}
      onSaved={() => {
        refocusAdd.current = true;
        // A refresh that brings no new rows never runs the refocus: don't let the flag linger.
        setTimeout(() => {
          refocusAdd.current = false;
        }, REFOCUS_WINDOW_MS);
        setAdding(false);
        router.refresh();
      }}
    />
  ) : null;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-prose font-body text-base text-foreground">
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
        {dialog}
      </div>
    );
  }

  function clearSearch() {
    setInput("");
    setQuery("");
    searchRef.current?.focus();
  }

  function openRow(event: MouseEvent<HTMLTableRowElement>, href: string) {
    // The name link navigates on its own; modifier or non-primary clicks and text selection (copying a code) do not navigate.
    if ((event.target as Element).closest("a")) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    router.push(href);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex w-full max-w-md flex-col gap-1">
          <label htmlFor={searchId} className="sr-only">
            {it.clients.search.label}
          </label>
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            autoComplete="off"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={it.clients.search.placeholder}
            className="w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted"
          />
        </div>
        {addButton}
      </div>

      {/* Always mounted, so screen readers announce the no-results message when it appears. */}
      <div role="status" className="font-body text-base text-foreground empty:hidden">
        {visible.length === 0 ? fill(it.clients.noResults, { query: query.trim() }) : null}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={clearSearch}
            className="rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected"
          >
            {it.clients.clearSearch}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-surface-raised">
          <table className="w-full border-collapse text-left font-body text-sm text-foreground">
            <caption className="sr-only">{it.clients.table.caption}</caption>
            <thead className="border-b">
              <tr>
                {COLUMNS.map(({ key, label, numeric }) => {
                  const active = sort.key === key;
                  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("whitespace-nowrap px-3 py-2 font-label text-xs text-foreground-muted", numeric && "text-right")}
                    >
                      <button
                        type="button"
                        onClick={() => setSort((current) => nextClientSort(current, key))}
                        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
                      >
                        {label}
                        <Arrow aria-hidden="true" className={cn("size-3", !active && "invisible")} />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const href = clientHref(row.id);
                return (
                  <tr
                    key={row.id}
                    data-client-id={row.id}
                    onClick={(event) => openRow(event, href)}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-surface-control"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground-muted">{row.code}</td>
                    <td className="px-3 py-2">
                      <Link href={href} className="underline-offset-2 hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.caseCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </div>
  );
}
