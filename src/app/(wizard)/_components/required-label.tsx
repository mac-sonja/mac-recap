import type { ReactNode } from "react";
import { it } from "@/shared/i18n/it";

/**
 * The "*" after a required field's label. Visual only (no legend, owner 2026-10-20):
 * screen readers hear `aria-required` on the field instead. Inside a `<legend>` it
 * stays out of the accessible name, being `aria-hidden`.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" data-required-mark="" className="font-label text-xs text-foreground">
      {it.wizard.requiredMark}
    </span>
  );
}

/**
 * A required field's label with the marker beside it (outside the label, so the
 * field's name stays the label). Used by every wizard step 1 (case and client).
 */
export function RequiredLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-0.5">
      {children}
      <RequiredMark />
    </div>
  );
}
