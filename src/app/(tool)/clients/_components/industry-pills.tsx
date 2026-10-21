import type { ClientIndustry } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * Choice pills: a raised outline when off, solid ink when selected (light and dark).
 * Sized for touch and reading (Story 2.18): at least 40 px tall, 14 px text.
 */
export const PILL =
  "inline-flex min-h-10 items-center rounded-full border border-border-strong bg-surface-raised px-4 py-2 font-label text-sm text-foreground-muted transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]";
/** The gap between pills in a group (about 8 px). */
export const PILL_GAP = "gap-2";
/** The read-only list's smaller pill (a client's page): the size before Story 2.18. */
const PILL_READ_ONLY =
  "inline-flex items-center rounded-full bg-surface-control px-2.5 py-1 font-label text-xs font-medium text-foreground";
const PILL_PRESSED = "aria-pressed:border-foreground-strong aria-pressed:bg-foreground-strong aria-pressed:text-surface";

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
          className={cn(PILL, PILL_PRESSED, "hover:text-foreground")}
        >
          {it.clients.industries[industry]}
        </button>
      ))}
    </div>
  );
}
