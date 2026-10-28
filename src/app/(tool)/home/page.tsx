import {
  ArrowRight,
  Check,
  ChevronRight,
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
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { CARD } from "@/app/_components/field-styles";
import { StatusBadge } from "@/app/_components/status-badge";
import { listScopeFor } from "@/app/_lib/list-scope";
import { caseHref, caseStudiesHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { authorize, can, type CaseStatus } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { formatDateTime, formatRelative } from "@/shared/i18n/format";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { activityLines, type ActivityKind, type ActivityLine } from "./_lib/activity-lines";

/** How many cases each list on the Dashboard shows before *Vedi tutte*. */
const LIST_SIZE = 5;

interface HomeCase {
  id: string;
  code: string;
  name: string;
  clientName: string;
  status: CaseStatus;
  updatedAt: string;
  /** When a Da approvare case entered that status; null otherwise. */
  inReviewSince: string | null;
  /** Where the row opens (`caseHref`): the wizard, the configurator, or nothing. */
  href: string | null;
}

/** A number and what it counts; the first tile carries the brand colour. */
function Stat({ label, value, index, accent = false }: { label: string; value: number; index: number; accent?: boolean }) {
  return (
    <li
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        "flex motion-safe:animate-enter flex-col justify-between gap-6 rounded-xl p-5",
        accent ? "bg-primary text-primary-foreground" : "bg-surface-raised shadow-card",
      )}
    >
      <span className={cn("font-label text-[13px] font-medium", accent ? "text-primary-foreground/70" : "text-foreground-muted")}>
        {label}
      </span>
      <span className="font-display text-4xl leading-none font-semibold tracking-[-0.03em] tabular-nums">{value}</span>
    </li>
  );
}

/** A titled card with a short list of cases, or a friendly line when it is empty. */
function CaseList({
  id,
  heading,
  empty,
  cases,
  more,
}: {
  id: string;
  heading: string;
  empty: string;
  cases: readonly HomeCase[];
  more?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn(CARD, "flex flex-col")}>
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2">
        <h2 id={id} className="font-heading text-[15px] font-semibold text-foreground-strong">
          {heading}
        </h2>
        {more}
      </div>
      {cases.length === 0 ? (
        <p className="px-5 pt-2 pb-6 font-body text-sm text-foreground-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col px-2 pb-2">
          {cases.map((c) => {
            const content = (
              <>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-label text-sm font-medium text-foreground-strong">{c.name}</span>
                  <span className="truncate font-label text-xs text-foreground-muted">
                    {c.clientName} · <span className="font-mono">{c.code}</span>
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-3">
                  <time dateTime={c.updatedAt} className="hidden font-label text-xs text-foreground-muted tabular-nums xl:inline">
                    {formatDateTime(c.updatedAt)}
                  </time>
                  <StatusBadge status={c.status} />
                </span>
              </>
            );
            return (
              <li key={c.id}>
                {c.href === null ? (
                  <div className="flex items-center gap-3 rounded-md px-3 py-2.5">{content}</div>
                ) : (
                  <Link
                    href={c.href}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 hover:bg-surface-hover"
                  >
                    {content}
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-foreground-muted" />
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

/**
 * The event log as short sentences: an icon by kind, who did what to which case,
 * and how long ago. Scrolls inside its card. `lines` is null when the log could not be read.
 */
function Activity({ lines, more, canEdit }: { lines: readonly ActivityLine[] | null; more?: ReactNode; canEdit: boolean }) {
  return (
    <section aria-labelledby="home-activity" className={cn(CARD, "flex flex-col")}>
      <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2">
        <h2 id="home-activity" className="font-heading text-[15px] font-semibold text-foreground-strong">
          {it.home.activity.heading}
        </h2>
        {more}
      </div>
      {lines === null || lines.length === 0 ? (
        <p className="px-5 pt-2 pb-6 font-body text-sm text-foreground-muted">
          {lines === null ? it.home.activity.failed : it.home.activity.empty}
        </p>
      ) : (
        // Three entries tall (owner, 2026-10-21; a one-line entry is 67 px), the rest
        // scrolls inside the card; focusable so it scrolls from the keyboard too.
        <ul
          tabIndex={0}
          aria-labelledby="home-activity"
          className="flex max-h-[201px] flex-col overflow-y-auto overscroll-contain px-5 pb-2 focus-visible:outline-offset-[-2px]"
        >
          {lines.map((line) => {
            const Icon = ACTIVITY_ICON[line.kind];
            const href = caseHref(line.caseId, line.caseStatus, canEdit);
            const content = (
              <>
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground-muted" strokeWidth={1.75} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-body text-sm text-foreground">
                    <ActivitySentence template={line.template} name={line.caseName} />
                  </span>
                  <time dateTime={line.at} title={formatDateTime(line.at)} className="font-label text-xs text-foreground-muted">
                    {formatRelative(line.at)}
                  </time>
                </span>
              </>
            );
            return (
              <li key={line.id} className="border-b border-border last:border-b-0">
                {href === null ? (
                  <div className="flex items-start gap-3 py-3.5">{content}</div>
                ) : (
                  <Link
                    href={href}
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

/**
 * The Dashboard (owner/designer landing at `/home`, 2026-10-21): a greeting,
 * three numbers (to approve, being written, open drafts), the cases waiting for
 * a review, the drafts to pick up again and the latest activity (the case event
 * log: who did what, when). Same scope and policy as the Case page (`list cases`).
 */
export default async function HomePage() {
  const shell = await requireSurface("list cases");
  if (shell === null) return null;
  const { actor, landing } = shell;

  const scope = listScopeFor(actor);
  if (scope === null || !authorize(actor, "list cases", scope).ok) redirect(landing);

  const [listed, activity] = await Promise.all([caseStudy.list(scope), caseStudy.listActivity(scope)]);
  if (!listed.ok) throw new Error(`Case studies could not be listed: ${listed.error.code}`);
  // A log that can't be read leaves the rest of the Dashboard working: Attività says so.
  const lines = activity.ok ? activityLines(activity.value) : null;

  const canEdit = can(actor, "edit");
  const cases: HomeCase[] = listed.value
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      clientName: c.client.name,
      status: c.status,
      updatedAt: c.updatedAt,
      inReviewSince: c.inReviewSince ?? null,
      href: caseHref(c.id, c.status, canEdit),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // Longest waiting first, like the To review queue it links to; without the time, the last update stands in.
  const waitingSince = (c: HomeCase) => Date.parse(c.inReviewSince ?? c.updatedAt);
  const toReview = cases.filter((c) => c.status === "in_review").sort((a, b) => waitingSince(a) - waitingSince(b));
  const drafts = cases.filter((c) => c.status === "draft");
  const generating = cases.filter((c) => c.status === "generating");
  const firstName = actor.displayName.trim().split(/\s+/)[0] ?? "";
  const canCreate = can(actor, "create case");

  const moreLink = (href: string, label: string) => (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-sm font-label text-[13px] text-foreground-muted transition-colors hover:text-foreground"
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
  const seeAll = moreLink("/case-studies", it.home.seeAll);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-[2rem] leading-tight font-semibold tracking-[-0.025em] text-foreground-strong">
          {firstName === "" ? it.app.name : fill(it.home.greeting, { name: firstName })}
        </h1>
        <p className="font-body text-[15px] text-foreground-muted">{it.home.lead}</p>
      </header>

      <ul aria-label={it.home.stats.label} className="grid grid-cols-3 gap-4">
        <Stat index={0} label={it.home.stats.toReview} value={toReview.length} accent />
        <Stat index={1} label={it.home.stats.generating} value={generating.length} />
        <Stat index={2} label={it.home.stats.drafts} value={drafts.length} />
      </ul>

      <div className="grid gap-4 xl:grid-cols-2">
        <CaseList
          id="home-review"
          heading={it.home.review.heading}
          empty={it.home.review.empty}
          cases={toReview.slice(0, LIST_SIZE)}
          more={toReview.length > 0 ? moreLink(caseStudiesHref("in_review"), it.home.review.seeAll) : undefined}
        />
        <CaseList
          id="home-drafts"
          heading={it.home.drafts.heading}
          empty={it.home.drafts.empty}
          cases={drafts.slice(0, LIST_SIZE)}
        />
      </div>

      <div className={cn("grid gap-4", canCreate && "xl:grid-cols-[1fr_20rem]")}>
        <Activity lines={lines} more={cases.length > 0 ? seeAll : undefined} canEdit={canEdit} />
        {canCreate && (
          <section
            aria-labelledby="home-start"
            className="flex flex-col items-start justify-between gap-6 rounded-xl bg-surface-inverse p-6 text-surface-inverse-foreground shadow-card"
          >
            <div className="flex flex-col gap-2">
              <h2 id="home-start" className="font-heading text-lg leading-snug font-semibold tracking-[-0.01em]">
                {it.home.start.heading}
              </h2>
              <p className="font-body text-sm leading-relaxed opacity-70">{it.home.start.body}</p>
            </div>
            <Link href="/case-studies/new" className={PRIMARY_ACTION}>
              {it.home.start.action}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
