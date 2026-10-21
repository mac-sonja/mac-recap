"use client";

import { Check } from "lucide-react";
import { CHOICE_PILL, PILL_GAP } from "@/app/(tool)/clients/_components/industry-pills";
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

/**
 * The case's Servizi as multi-select pills (owner, 2026-10-21): a named group of
 * toggle buttons (`aria-pressed`), each in the tab order; Space, Enter or a click
 * switches one on or off. `CHOICE_PILL`s, as the client's Settori.
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
          className={cn(CHOICE_PILL, "aria-disabled:cursor-not-allowed aria-disabled:opacity-60")}
        >
          {selected.includes(businessLine) && <Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} />}
          {it.businessLines[businessLine]}
        </button>
      ))}
    </div>
  );
}
