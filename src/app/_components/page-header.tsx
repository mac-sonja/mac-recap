import type { ReactNode } from "react";

/**
 * A tool page's header: a large title, an optional one-line lead under it, and the
 * page's main action on the right. The same rhythm on every page.
 */
export function PageHeader({ title, lead, action }: { title: ReactNode; lead?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-foreground-strong">
          {title}
        </h1>
        {lead ? <p className="max-w-xl font-body text-[15px] leading-snug text-foreground-muted">{lead}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}
