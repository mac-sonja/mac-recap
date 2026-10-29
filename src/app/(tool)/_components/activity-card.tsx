import {
  Check,
  CircleAlert,
  FilePlus2,
  NotebookPen,
  PenLine,
  Sparkles,
  Trash2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CARD } from "@/app/_components/field-styles";
import { formatDateTime, formatRelative } from "@/shared/i18n/format";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import type { ActivityKind, ActivityLine } from "../_lib/activity-lines";

/** An *Attività* line and where it opens; `null` draws it without a link. */
export interface ActivityCardLine extends ActivityLine {
  href: string | null;
}

/** The icon in front of each *Attività* line, by what happened (owner, 2026-10-21). */
const ACTIVITY_ICON: Readonly<Record<ActivityKind, LucideIcon>> = {
  created: FilePlus2,
  detailsUpdated: PenLine,
  storyWritten: NotebookPen,
  uploaded: Upload,
  removed: Trash2,
  generate: Sparkles,
  generated: Sparkles,
  generationFailed: CircleAlert,
  approved: Check,
};

/** An *Attività* sentence with the case name in bold where the template says `{name}`. */
function ActivitySentence({ template, name }: { template: string; name: string }) {
  const [before, after] = template.split("{name}");
  return (
    <>
      {before}
      <strong className="font-semibold text-foreground-strong">{name}</strong>
      {after}
    </>
  );
}

export interface ActivityCardProps {
  /** The heading's id, which names the card and its list. */
  headingId: string;
  /** What the card says when there is nothing to show. */
  empty: string;
  /** `null` when the log could not be read: the card then says so. */
  lines: readonly ActivityCardLine[] | null;
  /** A link beside the heading (Home's *Vedi tutte*). */
  more?: ReactNode;
  /**
   * The moment "how long ago" counts from, as an ISO timestamp; defaults to now. A client
   * component passes the server's, so the server and hydration render the same words.
   */
  now?: string;
}

/**
 * The event log as short sentences (Home's and the approved case page's *Attività*): an
 * icon by kind, who did what to which case, and how long ago, with the full date on hover.
 * Three entries tall, the rest scrolls inside its card.
 */
export function ActivityCard({ headingId, empty, lines, more, now }: ActivityCardProps) {
  const at = now === undefined ? undefined : new Date(now);
  return (
    <section aria-labelledby={headingId} className={cn(CARD, "flex flex-col")}>
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2">
        <h2 id={headingId} className="font-heading text-[15px] font-semibold text-foreground-strong">
          {it.home.activity.heading}
        </h2>
        {more}
      </div>
      {lines === null || lines.length === 0 ? (
        <p className="px-5 pt-2 pb-6 font-body text-sm text-foreground-muted">{lines === null ? it.home.activity.failed : empty}</p>
      ) : (
        // Three entries tall (owner, 2026-10-21; a one-line entry is 67 px), the rest
        // scrolls inside the card; focusable so it scrolls from the keyboard too.
        <ul
          tabIndex={0}
          aria-labelledby={headingId}
          className="flex max-h-[201px] flex-col overflow-y-auto overscroll-contain px-5 pb-2 focus-visible:outline-offset-[-2px]"
        >
          {lines.map((line) => {
            const Icon = ACTIVITY_ICON[line.kind];
            const content = (
              <>
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground-muted" strokeWidth={1.75} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-body text-sm text-foreground">
                    <ActivitySentence template={line.template} name={line.caseName} />
                  </span>
                  <time dateTime={line.at} title={formatDateTime(line.at, at)} className="font-label text-xs text-foreground-muted">
                    {formatRelative(line.at, at)}
                  </time>
                </span>
              </>
            );
            return (
              <li key={line.id} className="border-b border-border last:border-b-0">
                {line.href === null ? (
                  <div className="flex items-start gap-3 py-3.5">{content}</div>
                ) : (
                  <Link
                    href={line.href}
                    className="-mx-2 flex items-start gap-3 rounded-md px-2 py-3.5 transition-colors duration-150 hover:bg-surface-hover"
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
