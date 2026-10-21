import type { CaseStatus } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * Per status: a soft tint, a dot in the status hue and the label in a darker shade
 * of it (DESIGN.md Components, status badge, refresh 2026-10-20). Colour is never
 * the only signal: the Italian label always shows.
 */
const TONE: Readonly<Record<CaseStatus, string>> = {
  draft: "bg-status-draft-tint text-status-draft-foreground before:bg-status-draft",
  generating: "bg-status-generating-tint text-status-generating-foreground before:bg-status-generating",
  in_review: "bg-status-review-tint text-status-review-foreground before:bg-status-review",
  approved: "bg-status-approved-tint text-status-approved-foreground before:bg-status-approved",
};

/** A case status: a tinted pill with a leading dot and its Italian label (IR-OP8). */
export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 font-label text-badge font-medium whitespace-nowrap before:size-1.5 before:rounded-full before:content-['']",
        TONE[status],
        className,
      )}
    >
      {it.status[status]}
    </span>
  );
}
