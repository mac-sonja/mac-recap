import type { ClientIndustry } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** The pill look of the favourite toggle (asset-row.tsx): selected pills are lime-tinted. */
export const PILL =
  "inline-flex items-center rounded-full border border-border-strong px-2.5 py-1 font-label text-xs text-foreground-muted";
const PILL_PRESSED = "aria-pressed:border-accent/40 aria-pressed:bg-accent/10 aria-pressed:text-info";
/** The same selected look for a single-select pill (`role="radio"`, `aria-checked`): the case business line. */
export const PILL_CHECKED = "aria-checked:border-accent/40 aria-checked:bg-accent/10 aria-checked:text-info";

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
 * buttons (`aria-pressed`), multiselect. Read-only (a client's page): a list of
 * the selected industries only.
 */
export function IndustryPills({ options, selected, onToggle, labelledBy, describedBy, label }: IndustryPillsProps) {
  if (onToggle === undefined) {
    return (
      <ul aria-label={label} className="flex flex-wrap gap-1.5">
        {options
          .filter((industry) => selected.includes(industry))
          .map((industry) => (
            <li key={industry} className={cn(PILL, "text-foreground")}>
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
      className="flex flex-wrap gap-1.5"
    >
      {options.map((industry) => (
        <button
          key={industry}
          type="button"
          aria-pressed={selected.includes(industry)}
          onClick={() => onToggle(industry)}
          className={cn(PILL, PILL_PRESSED, "hover:text-foreground")}
        >
          {it.clients.industries[industry]}
        </button>
      ))}
    </div>
  );
}
