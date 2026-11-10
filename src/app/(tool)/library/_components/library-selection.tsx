"use client";

import { Check } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { CreateCollectionDialog } from "@/app/(tool)/collections/_components/create-collection-dialog";
import { ITEMS_MAX, type TagOptions } from "@/app/(tool)/collections/_components/collection-fields";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** The cards picked for a new collection, in the order they were picked (Story 5.10a). */
interface Selection {
  ids: readonly string[];
  toggle: (id: string) => void;
}

const SelectionContext = createContext<Selection | null>(null);

/**
 * The library's selection mode (Story 5.10a), for a role that may `manage collections`: each card
 * gets a checkbox (outside its link), and once one is ticked a bar says "{n} selezionate" with
 * **Crea raccolta** (the name and tags dialog) and **Annulla selezione**. The order the cards
 * were ticked in is kept; it survives the library's pages, searches and filters.
 */
export function LibrarySelection({ options, children }: { options: TagOptions; children: ReactNode }) {
  const [ids, setIds] = useState<readonly string[]>([]);
  const [creating, setCreating] = useState(false);
  /** Set when a tick would go past what a collection holds: said in the bar, nothing added. */
  const [full, setFull] = useState(false);
  const toggle = (id: string) => {
    if (ids.includes(id)) {
      setIds(ids.filter((x) => x !== id));
      setFull(false);
    } else if (ids.length >= ITEMS_MAX) setFull(true);
    else setIds([...ids, id]);
  };
  const copy = it.library.select;
  const count = ids.length === 1 ? copy.countOne : fill(copy.count, { n: ids.length });
  return (
    <SelectionContext value={{ ids, toggle }}>
      {ids.length > 0 && (
        <div
          role="region"
          aria-label={count}
          data-selection-bar=""
          className="sticky top-4 z-10 flex items-center justify-between gap-4 rounded-xl bg-surface-raised px-4 py-3 shadow-popover motion-safe:animate-dialog-in"
        >
          <p aria-live="polite" className="font-label text-sm font-medium text-foreground-strong tabular-nums">
            {count}
            {full && <span className="ml-3 font-normal text-danger">{fill(copy.tooMany, { max: ITEMS_MAX })}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIds([]);
                setFull(false);
              }}
              className={SECONDARY_ACTION}
            >
              {copy.clear}
            </button>
            <button type="button" onClick={() => setCreating(true)} className={PRIMARY_ACTION}>
              {copy.create}
            </button>
          </div>
        </div>
      )}
      {children}
      {/* Mounted while open: each opening starts from an empty name and no tags. */}
      {creating && <CreateCollectionDialog open onClose={() => setCreating(false)} caseIds={ids} options={options} />}
    </SelectionContext>
  );
}

/** A card's checkbox, laid over its cover's corner, outside its link. Nothing without a selection mode. */
export function CardCheckbox({ id, name }: { id: string; name: string }) {
  const selection = useContext(SelectionContext);
  if (selection === null) return null;
  const checked = selection.ids.includes(id);
  return (
    <label
      className={cn(
        "absolute top-3 left-3 z-[1] flex size-7 cursor-pointer items-center justify-center rounded-md bg-surface-raised/90 shadow-control transition-colors duration-150 hover:bg-surface-raised",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
        checked && "bg-primary hover:bg-primary-hover",
      )}
    >
      <input
        type="checkbox"
        data-select-case={id}
        checked={checked}
        onChange={() => selection.toggle(id)}
        aria-label={fill(it.library.select.card, { name })}
        className="peer sr-only"
      />
      <Check aria-hidden="true" className={cn("size-4 text-primary-foreground", !checked && "opacity-0")} strokeWidth={2.5} />
    </label>
  );
}
