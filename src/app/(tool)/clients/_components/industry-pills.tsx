import { Check } from "lucide-react";
import type { ClientIndustry } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** The gap between pills in a group (about 8 px). */
export const PILL_GAP = "gap-2";
/** The read-only list's smaller pill (a client's page): the size before Story 2.18. */
const PILL_READ_ONLY =
  "inline-flex items-center rounded-full bg-surface-control px-2.5 py-1 font-label text-xs font-medium text-foreground";
/**
 * The wizards' choice pill (Settori, Servizi; owner's mock, 2026-10-21): small and grey
 * filled; selected, a pale lime tint with olive ink and a check, so colour is not the only signal.
 */
export const CHOICE_PILL =
  "inline-flex min-h-7 items-center gap-1 rounded-full border border-transparent bg-surface-control px-2.5 py-1 font-label text-[13px] text-foreground transition-[background-color,color,transform] duration-150 hover:bg-surface-selected active:scale-[0.97] aria-pressed:bg-primary-tint aria-pressed:text-primary-ink aria-pressed:hover:bg-primary-tint";

export interface IndustryPillsProps {
  /** `CLIENT_INDUSTRIES`, in display order (the module's index is server-only). */
  options: readonly ClientIndustry[];
  selected: readonly ClientIndustry[];
  /** Without it the pills are read-only labels (a client's page). */
  onToggle?: (industry: ClientIndustry) => void;
  /** The group's accessible name: the field label's id. */
  labelledBy?: string;
  describedBy?: string;
  /** The read-only list's accessible name. */
  label?: string;
}

/**
 * The client's industries as pills. Editable (wizard step 1): a group of toggle
 * buttons (`aria-pressed`), multiselect, as `CHOICE_PILL`s. Read-only (a client's page): a list of
 * the selected industries only.
 */
export function IndustryPills({ options, selected, onToggle, labelledBy, describedBy, label }: IndustryPillsProps) {
  if (onToggle === undefined) {
    return (
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {options
          .filter((industry) => selected.includes(industry))
          .map((industry) => (
            <li key={industry} className={PILL_READ_ONLY}>
              {it.clients.industries[industry]}
            </li>
          ))}
      </ul>
    );
  }
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cn("flex flex-wrap", PILL_GAP)}
    >
      {options.map((industry) => (
        <button
          key={industry}
          type="button"
          aria-pressed={selected.includes(industry)}
          onClick={() => onToggle(industry)}
          className={CHOICE_PILL}
        >
          {selected.includes(industry) && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
          {it.clients.industries[industry]}
        </button>
      ))}
    </div>
  );
}
