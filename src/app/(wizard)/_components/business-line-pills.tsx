"use client";

import { useRef, type KeyboardEvent } from "react";
import { PILL, PILL_CHECKED, PILL_GAP } from "@/app/(tool)/clients/_components/industry-pills";
import type { BusinessLine } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

export interface BusinessLinePillsProps {
  /** `BUSINESS_LINES`, in display order (the module's index is server-only). */
  options: readonly BusinessLine[];
  /** The picked business line, or null (a new case, or one created before Story 2.17). */
  selected: BusinessLine | null;
  onSelect: (businessLine: BusinessLine) => void;
  /** The group's accessible name: the field label's id. */
  labelledBy: string;
  describedBy?: string;
  /** Marks the group invalid (a refusal is shown under it). */
  invalid?: boolean;
  /** While true, a pick does nothing (a save is running). */
  disabled?: boolean;
}

const KEYS_BACK = new Set(["ArrowLeft", "ArrowUp"]);
const KEYS_FORWARD = new Set(["ArrowRight", "ArrowDown"]);

/**
 * The case's business line as single-select pills (Story 2.17): a radiogroup of
 * `role="radio"` buttons with the client industry pill look. One pill is in the tab
 * order (the selected one, else the first); the arrow keys move to the previous or
 * next pill and pick it, wrapping, and Home and End go to the first and last. Space,
 * Enter or a click picks the focused pill.
 */
export function BusinessLinePills({ options, selected, onSelect, labelledBy, describedBy, invalid, disabled }: BusinessLinePillsProps) {
  const pills = useRef<Array<HTMLButtonElement | null>>([]);
  const tabStop = selected !== null && options.includes(selected) ? selected : options[0];

  function pick(index: number) {
    pills.current[index]?.focus();
    if (!disabled) onSelect(options[index]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = options.length - 1;
    let next: number | null = null;
    if (KEYS_BACK.has(event.key)) next = index === 0 ? last : index - 1;
    else if (KEYS_FORWARD.has(event.key)) next = index === last ? 0 : index + 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    pick(next);
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-required="true"
      aria-invalid={invalid || undefined}
      className={cn("flex flex-wrap", PILL_GAP)}
    >
      {options.map((businessLine, index) => (
        <button
          key={businessLine}
          ref={(element) => {
            pills.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={businessLine === selected}
          aria-disabled={disabled || undefined}
          tabIndex={businessLine === tabStop ? 0 : -1}
          onClick={() => pick(index)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn(
            PILL,
            PILL_CHECKED,
            // Grey filled chips (owner's mock, 2026-10-21); selected stays solid ink.
            "min-h-9 border-transparent bg-surface-control px-3.5 py-1.5 text-[13px] text-foreground hover:bg-surface-selected aria-checked:hover:bg-foreground-strong aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
          )}
        >
          {it.businessLines[businessLine]}
        </button>
      ))}
    </div>
  );
}
