"use client";

import { PILL, PILL_GAP } from "@/app/(tool)/clients/_components/industry-pills";
import type { BusinessLine } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

export interface BusinessLinePillsProps {
  /** `BUSINESS_LINES`, in display order (the module's index is server-only). */
  options: readonly BusinessLine[];
  /** The picked Servizi (none on a new case). */
  selected: readonly BusinessLine[];
  /** Switches one on or off. */
  onToggle: (businessLine: BusinessLine) => void;
  /** The group's accessible name: the field label's id. */
  labelledBy: string;
  describedBy?: string;
  /** Marks the group invalid (a refusal is shown under it). */
  invalid?: boolean;
  /** While true, a press does nothing (a save is running). */
  disabled?: boolean;
}

/** Selected: solid ink, as the client industry pills. */
const PILL_PRESSED = "aria-pressed:bg-foreground-strong aria-pressed:text-surface aria-pressed:hover:bg-foreground-strong";

/**
 * The case's Servizi as multi-select pills (owner, 2026-10-21): a named group of
 * toggle buttons (`aria-pressed`), each in the tab order; Space, Enter or a click
 * switches one on or off. Grey filled chips (owner's mock), solid ink when on.
 */
export function BusinessLinePills({ options, selected, onToggle, labelledBy, describedBy, invalid, disabled }: BusinessLinePillsProps) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={cn("flex flex-wrap", PILL_GAP)}
    >
      {options.map((businessLine) => (
        <button
          key={businessLine}
          type="button"
          aria-pressed={selected.includes(businessLine)}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) onToggle(businessLine);
          }}
          className={cn(
            PILL,
            PILL_PRESSED,
            "min-h-9 border-transparent bg-surface-control px-3.5 py-1.5 text-[13px] text-foreground hover:bg-surface-selected aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
          )}
        >
          {it.businessLines[businessLine]}
        </button>
      ))}
    </div>
  );
}
