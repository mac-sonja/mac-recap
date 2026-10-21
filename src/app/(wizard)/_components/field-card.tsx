import type { ReactNode } from "react";
import { CARD, CARD_LABEL } from "@/app/_components/field-styles";
import { cn } from "@/shared/utils";

/**
 * One field in its own white card, headed "01 — LABEL" (the number is decorative),
 * the field under it; `aside` sits at the right of the heading (a counter). Used by
 * both wizards' Dettagli steps (owner's mock, 2026-10-21).
 */
export function FieldCard({ number, label, aside, children }: { number: number; label: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn(CARD, "flex flex-col gap-3 p-5")}>
      <div className="flex items-baseline gap-1.5">
        <span aria-hidden="true" className={CARD_LABEL}>{`${String(number).padStart(2, "0")} —`}</span>
        {label}
        {aside !== undefined && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </div>
  );
}

