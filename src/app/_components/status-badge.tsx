import type { CaseStatus } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/**
 * Per status: a tinted fill and border from the `status-*` token and the label in
 * that hue (DESIGN.md Components, status badge). *Da approvare* uses `info` text,
 * because blue text on a blue tint is below 4.5:1. Colour is never the only
 * signal: the Italian label always shows.
 */
const TONE: Readonly<Record<CaseStatus, string>> = {
  draft: "bg-status-draft/6 border-status-draft/22 text-status-draft",
  generating: "bg-status-generating/6 border-status-generating/22 text-status-generating",
  in_review: "bg-status-review/16 border-status-review/40 text-info",
  approved: "bg-status-approved/10 border-status-approved/28 text-status-approved",
};

/** A case status: a tinted pill with its Italian label (IR-OP8), no leading dot. */
export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center rounded-full border px-3 py-0.5 font-label text-badge", TONE[status], className)}
    >
      {it.status[status]}
    </span>
  );
}
