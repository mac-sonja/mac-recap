"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { normalizeForSearch } from "@/app/(tool)/case-studies/_components/filter-sort";
import type { ClientRef } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

export interface ClientComboboxProps {
  /** The input's id (the label's `htmlFor`; focused when the field is refused). */
  id: string;
  /** Every client, sorted by name. */
  clients: readonly ClientRef[];
  /** The picked client's id, or "" for none. */
  value: string;
  onChange: (clientId: string) => void;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/** "{name} ({code})": the option text, and the input's text once a client is picked. */
export const clientLabel = (client: ClientRef) => fill(it.wizard.clientOption, { name: client.name, code: client.code });

/** How long typing pauses before the result count is announced. */
export const ANNOUNCE_DELAY_MS = 500;

const byName = (a: ClientRef, b: ClientRef) => a.name.localeCompare(b.name, "it");

/**
 * The clients whose name or code contains `query`, case- and accent-insensitive (like
 * the table search), ranked: code starts with it, then name starts with it, then the
 * rest, each by name. An empty query keeps every client in the given order.
 */
export function filterClients(clients: readonly ClientRef[], query: string): readonly ClientRef[] {
  const needle = normalizeForSearch(query.trim());
  if (needle === "") return clients;
  const ranks: ClientRef[][] = [[], [], []];
  for (const client of clients) {
    const code = normalizeForSearch(client.code);
    const name = normalizeForSearch(client.name);
    if (code.startsWith(needle)) ranks[0].push(client);
    else if (name.startsWith(needle)) ranks[1].push(client);
    else if (code.includes(needle) || name.includes(needle)) ranks[2].push(client);
  }
  return ranks.flatMap((rank) => rank.sort(byName));
}

/** The one client whose label, name or code equals `text` (case- and accent-insensitive), if exactly one does. */
function exactClient(clients: readonly ClientRef[], text: string): ClientRef | null {
  const needle = normalizeForSearch(text.trim());
  if (needle === "") return null;
  const found = clients.filter((client) =>
    [clientLabel(client), client.name, client.code].some((field) => normalizeForSearch(field) === needle),
  );
  return found.length === 1 ? found[0] : null;
}

/**
 * The case's client as a searchable combobox (Story 2.18; ARIA combobox pattern with
 * a listbox popup). Typing filters the clients by name and code, makes the first
 * match active and clears the pick until an option is chosen; the list shows
 * "{name} ({code})". ArrowDown and
 * ArrowUp open the list and move the active option (`aria-activedescendant`), Enter
 * picks it, Escape closes the list (a second Escape clears the text). A click picks
 * too. A text that matches no client shows "Nessun cliente trovato" with a link to
 * the Clients page. Once picked, the input shows the client's label (selected on
 * focus, so typing replaces it), and opening the list shows every client again.
 * Enter never submits the form. Leaving with nothing picked picks the one client the
 * text names exactly, else clears the text. After typing pauses, the number of
 * matches is announced politely.
 */
export function ClientCombobox({ id, clients, value, onChange, invalid, describedBy, className }: ClientComboboxProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const noMatchId = `${baseId}-no-match`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const selected = clients.find((client) => client.id === value) ?? null;

  const [text, setText] = useState(selected === null ? "" : clientLabel(selected));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  /** Set by typing, so only the user's own searches are announced. */
  const [typed, setTyped] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // A picked client lists everything again; otherwise the typed text filters.
  const options = useMemo(
    () => (selected !== null && text === clientLabel(selected) ? clients : filterClients(clients, text)),
    [clients, selected, text],
  );
  const noMatch = text.trim() !== "" && options.length === 0;
  const expanded = open && options.length > 0;

  useEffect(() => {
    if (!typed) return;
    const count = options.length;
    const timer = setTimeout(
      () =>
        setAnnouncement(
          count === 0 ? it.wizard.clientCountNone : count === 1 ? it.wizard.clientCountOne : fill(it.wizard.clientCount, { n: count }),
        ),
      ANNOUNCE_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [typed, text, options.length]);

  function moveTo(index: number) {
    setActive(index);
    const option = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(index))}`);
    option?.scrollIntoView?.({ block: "nearest" });
  }

  function pick(client: ClientRef) {
    setText(clientLabel(client));
    setOpen(false);
    setActive(-1);
    if (client.id !== value) onChange(client.id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      const down = event.key === "ArrowDown";
      if (!open) {
        setOpen(true);
        const start = selected === null ? -1 : options.indexOf(selected);
        moveTo(start >= 0 ? start : down ? 0 : options.length - 1);
        return;
      }
      const last = options.length - 1;
      moveTo(down ? (active >= last ? 0 : active + 1) : active <= 0 ? last : active - 1);
    } else if (event.key === "Enter") {
      // Enter picks the active option; it never submits the form (Avanti does).
      event.preventDefault();
      if (expanded && active >= 0 && active < options.length) pick(options[active]);
      else setOpen(false);
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      } else if (text !== "") {
        event.preventDefault();
        setOpen(false);
        setText("");
        if (value !== "") onChange("");
      }
    }
  }

  function onBlur(event: FocusEvent<HTMLDivElement>) {
    // Focus moving inside (the no-match link) keeps the list.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setOpen(false);
    setActive(-1);
    setTyped(false);
    if (selected !== null) {
      setText(clientLabel(selected));
      return;
    }
    // Nothing picked: a text naming exactly one client picks it, anything else is cleared.
    const exact = exactClient(clients, text);
    if (exact !== null) pick(exact);
    else setText("");
  }

  const [before, after = ""] = it.wizard.noClientMatch.split("{link}");

  return (
    <div className="relative" onBlur={onBlur}>
      <input
        id={id}
        name="client"
        type="text"
        role="combobox"
        autoComplete="off"
        required
        aria-required="true"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={[describedBy, noMatch && noMatchId].filter(Boolean).join(" ") || undefined}
        placeholder={it.wizard.clientPlaceholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setTyped(true);
          setOpen(true);
          // The first match is active, so Enter picks it.
          setActive(0);
          if (value !== "") onChange("");
        }}
        onFocus={(event) => {
          if (selected !== null && text === clientLabel(selected)) event.target.select();
        }}
        onClick={(event) => {
          setOpen(true);
          // A click places the caret after focus: select the picked label again, so typing replaces it.
          const input = event.currentTarget;
          if (selected !== null && text === clientLabel(selected) && input.selectionStart === input.selectionEnd) input.select();
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={it.wizard.clientList}
        hidden={!expanded}
        // A press on the list (its scrollbar too) keeps focus on the input, so the list stays open.
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-md border border-border-strong bg-surface-raised py-1 shadow-lg"
      >
        {options.map((client, index) => (
          <li
            key={client.id}
            id={optionId(index)}
            role="option"
            aria-selected={client.id === value}
            data-active={index === active ? "" : undefined}
            // Keep focus on the input, so the pick does not blur it first.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(client)}
            onMouseMove={() => index !== active && setActive(index)}
            className={cn(
              "cursor-pointer px-3 py-2 font-body text-sm text-foreground",
              "aria-selected:text-info data-active:bg-accent/20 data-active:text-foreground-strong",
            )}
          >
            {clientLabel(client)}
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {noMatch && (
        <p id={noMatchId} className="mt-1.5 font-body text-sm text-foreground">
          {before}
          <Link href="/clients" className="text-foreground underline underline-offset-2 hover:text-foreground-strong">
            {it.wizard.noClientsLink}
          </Link>
          {after}
        </p>
      )}
    </div>
  );
}
