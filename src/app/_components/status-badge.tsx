import type { CaseStatus } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** The `status-*` token per case status; colour is never the only signal. */
const DOT: Readonly<Record<CaseStatus, string>> = {
  draft: "bg-status-draft",
  generating: "bg-status-generating",
  in_review: "bg-status-review",
  approved: "bg-status-approved",
};

const RING: Readonly<Record<CaseStatus, string>> = {
  draft: "border-status-draft",
  generating: "border-status-generating",
  in_review: "border-status-review",
  approved: "border-status-approved",
};

/** A case status: its colour token paired with its Italian label (IR-OP8). */
export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-surface-raised px-2 py-0.5 font-label text-xs text-foreground",
        RING[status],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", DOT[status])} />
      {it.status[status]}
    </span>
  );
}
