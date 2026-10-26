import { Check } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { ClientSector } from "@/modules/case-study";
import { cn } from "@/shared/utils";

/** The gap between pills in a group (about 8 px). */
export const PILL_GAP = "gap-2";
/** The read-only list's smaller pill (a client's page): the size before Story 2.18. */
const PILL_READ_ONLY =
  "inline-flex items-center rounded-full bg-surface-control px-2.5 py-1 font-label text-xs font-medium text-foreground";
/** The choice pill's look (owner's mock, 2026-10-21): small and grey filled. */
const PILL_BASE =
  "inline-flex min-h-7 items-center gap-1 rounded-full border border-transparent bg-surface-control px-2.5 py-1 font-label text-[13px] text-foreground transition-[background-color,color,transform] duration-150 hover:bg-surface-selected active:scale-[0.97]";
/**
 * The wizards' choice pill (Servizi): `PILL_BASE`; selected (`aria-pressed`), a pale lime
 * tint with olive ink and a check, so colour is not the only signal.
 */
export const CHOICE_PILL = `${PILL_BASE} aria-pressed:bg-primary-tint aria-pressed:text-primary-ink aria-pressed:hover:bg-primary-tint`;
/** The same pill as a radio (Settore, one choice), selected by `aria-checked`. */
const RADIO_PILL = `${PILL_BASE} aria-checked:bg-primary-tint aria-checked:text-primary-ink aria-checked:hover:bg-primary-tint`;
/** A refused group: a red outline around the pills, as a field gets a red border. */
const GROUP_INVALID = "rounded-md aria-invalid:outline aria-invalid:outline-1 aria-invalid:outline-offset-4 aria-invalid:outline-danger";

export interface IndustryPillsProps {
  /** Every sector, in display order (the shared list, from `listClientSectors`). */
  options: readonly ClientSector[];
  /** The selected sector's key, or null. */
  selected: string | null;
  /** Without it the pills are read-only labels (a client's page). */
  onSelect?: (key: string) => void;
  /** The group's accessible name: the field label's id. */
  labelledBy?: string;
  describedBy?: string;
  /** The read-only list's accessible name. */
  label?: string;
  invalid?: boolean;
  /** While a save runs: the selection can't change, so keys move nothing. */
  disabled?: boolean;
}

/** Arrow keys and Home/End move through a radio group (wrapping), as a native radio group does. */
const STEP: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

/**
 * The client's sector as pills. Editable (the client panel): a single-choice group
 * (`radiogroup` of `radio`s, one tab stop; arrow keys move and select, as native
 * radios do), as `CHOICE_PILL`s with the check on the selected one. Read-only (a
 * client's page): the selected sector only.
 */
export function IndustryPills({ options, selected, onSelect, labelledBy, describedBy, label, invalid, disabled }: IndustryPillsProps) {
  if (onSelect === undefined) {
    const shown = options.find((sector) => sector.key === selected);
    if (shown === undefined) return null;
    return (
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        <li className={PILL_READ_ONLY}>{shown.label}</li>
      </ul>
    );
  }

  const selectedIndex = options.findIndex((sector) => sector.key === selected);
  // One tab stop: the selected pill, or the first when none is.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = STEP[event.key];
    if (step === undefined || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (options.length === 0 || onSelect === undefined) return;
    // A native radio group doesn't move either while it can't change.
    if (disabled) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const next = step(index, options.length);
    onSelect(options[next].key);
    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required="true"
      aria-invalid={invalid || undefined}
      aria-disabled={disabled || undefined}
      className={cn("flex flex-wrap", PILL_GAP, GROUP_INVALID)}
    >
      {options.map((sector, index) => {
        const checked = sector.key === selected;
        return (
          <button
            key={sector.key}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              if (!disabled) onSelect(sector.key);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={RADIO_PILL}
          >
            {checked && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
            {sector.label}
          </button>
        );
      })}
    </div>
  );
}
