"use client";

import { Check, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { PRESSABLE } from "@/app/_components/button-styles";
import { SEARCH_FIELD, SEARCH_ICON } from "@/app/_components/field-styles";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { EMPTY_STATE, libraryHref, type FacetOptions, type LibraryState } from "../_lib/library-data";

/** As the Case table: the search applies this long after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 250;

const CHIP = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-label text-[13px] whitespace-nowrap transition-colors duration-150",
  PRESSABLE,
);

/** One facet: its label and a chip per value, each pressed while selected. */
function Facet<T extends string | number>({
  label,
  values,
  selected,
  labelOf,
  onToggle,
}: {
  label: string;
  values: readonly T[];
  selected: readonly T[];
  labelOf: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-2">
      <span id={id} className="w-14 shrink-0 font-label text-xs font-medium text-foreground-muted">
        {label}
      </span>
      {values.map((value) => {
        const on = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(value)}
            className={cn(
              CHIP,
              on
                ? "bg-surface-raised font-medium text-foreground-strong shadow-control"
                : "bg-surface-control text-foreground-muted hover:bg-surface-selected hover:text-foreground",
            )}
          >
            {on && <Check aria-hidden="true" className="size-3.5" />}
            {labelOf(value)}
          </button>
        );
      })}
    </div>
  );
}

const toggled = <T,>(values: readonly T[], value: T): T[] => (values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

/**
 * The library's search and facets (Story 5.1), with the grid as `children`. Everything lives
 * in the address (`?q=`, `?cliente=`, `?anno=`; any change goes back to page 1), so Back and
 * reload keep it; the server filters and pages. The search uses the table's rules and
 * applies after a pause in typing (replacing the history entry); a facet chip adds or
 * removes its value (a new history entry). Above the grid, the active filters show as
 * chips, each removable, with **Azzera tutto**. While the next page loads, the grid dims.
 */
export function LibraryFilters({
  state,
  options,
  children,
}: {
  state: LibraryState;
  options: FacetOptions;
  children: ReactNode;
}) {
  const router = useRouter();
  const searchId = useId();
  const [pending, startTransition] = useTransition();
  const [input, setInput] = useState(state.q);
  // The search text last sent to the address, and the `q` last received. Only a received `q`
  // that changed and isn't the one just sent (Back, reload of another entry) refills the field:
  // a navigation still pending never puts an older query back.
  const [sent, setSent] = useState(state.q);
  const [received, setReceived] = useState(state.q);
  if (state.q !== received) {
    setReceived(state.q);
    if (state.q !== sent) {
      setSent(state.q);
      setInput(state.q);
    }
  }
  // The pending search, and the latest state it builds on.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  /** Navigates to `next` (page 1). Cancels a pending search, so it can never undo this change. */
  function go(next: LibraryState, mode: "push" | "replace" = "push") {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setSent(next.q);
    setInput(next.q);
    startTransition(() => router[mode](libraryHref({ ...next, page: 1 }), { scroll: false }));
  }

  useEffect(() => {
    if (input === sent) return;
    timer.current = setTimeout(() => go({ ...latest.current, q: input }, "replace"), SEARCH_DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
    // `go` is the same every render (router, transition and setters); the input and the last sent text decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, sent]);

  const clientName = new Map(options.clients.map((c) => [c.code, c.name]));
  const query = state.q.trim();
  const active: { key: string; label: string; remove: LibraryState }[] = [
    ...(query === "" ? [] : [{ key: "q", label: fill(it.library.active.query, { query }), remove: { ...state, q: "" } }]),
    ...state.clients.map((code) => ({
      key: `c:${code}`,
      label: clientName.get(code) ?? code,
      remove: { ...state, clients: state.clients.filter((c) => c !== code) },
    })),
    ...state.years.map((year) => ({
      key: `y:${year}`,
      label: String(year),
      remove: { ...state, years: state.years.filter((y) => y !== year) },
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <label htmlFor={searchId} className="sr-only">
          {it.library.search.label}
        </label>
        <div className="relative w-full max-w-sm">
          <Search aria-hidden="true" className={SEARCH_ICON} />
          <input
            id={searchId}
            type="search"
            autoComplete="off"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={it.library.search.placeholder}
            className={SEARCH_FIELD}
          />
        </div>
        <Facet
          label={it.library.facets.client}
          values={options.clients.map((c) => c.code)}
          selected={state.clients}
          labelOf={(code) => clientName.get(code) ?? code}
          onToggle={(code) => go({ ...state, q: input, clients: toggled(state.clients, code) })}
        />
        <Facet
          label={it.library.facets.year}
          values={options.years}
          selected={state.years}
          labelOf={String}
          onToggle={(year) => go({ ...state, q: input, years: toggled(state.years, year) })}
        />
      </div>

      {active.length > 0 && (
        <div role="group" aria-label={it.library.active.label} data-active-filters="" className="flex flex-wrap items-center gap-2">
          {active.map((chip) => (
            <span key={chip.key} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-raised pr-1 pl-3 font-label text-[13px] text-foreground shadow-control">
              {chip.label}
              <button
                type="button"
                aria-label={fill(it.library.active.remove, { value: chip.label })}
                title={fill(it.library.active.remove, { value: chip.label })}
                onClick={() => go(chip.key === "q" ? chip.remove : { ...chip.remove, q: input })}
                className={cn("inline-flex size-5 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover hover:text-foreground-strong", PRESSABLE)}
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => go(EMPTY_STATE)}
            className="ml-1 rounded-sm font-label text-[13px] font-medium text-foreground underline-offset-2 hover:underline"
          >
            {it.library.active.clearAll}
          </button>
        </div>
      )}

      <div aria-busy={pending} className={cn("transition-opacity duration-150", pending && "opacity-60")}>
        {children}
      </div>
    </div>
  );
}
