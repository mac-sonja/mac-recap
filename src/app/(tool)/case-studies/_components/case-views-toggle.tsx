import Link from "next/link";
import { it } from "@/shared/i18n/it";

/** The two views of the cases, in order. */
const VIEWS = [
  { key: "table", href: "/case-studies", label: it.caseViews.table },
  { key: "library", href: "/library", label: it.caseViews.library },
] as const;

export type CaseViewKey = (typeof VIEWS)[number]["key"];

/**
 * **Tabella / Libreria** (Story 5.1): the owner/designer's switch between the Case history
 * table and the library of approved cases, in both pages' headers. Styled like the status
 * filter's segmented control; each segment is a link, the current one marked as the page.
 */
export function CaseViewsToggle({ current }: { current: CaseViewKey }) {
  return (
    <nav aria-label={it.caseViews.label} className="inline-flex shrink-0 gap-0.5 rounded-full bg-surface-control p-[3px]">
      {VIEWS.map((view) => (
        <Link
          key={view.key}
          href={view.href}
          aria-current={view.key === current ? "page" : undefined}
          className="inline-flex h-[30px] items-center rounded-full px-3.5 font-label text-[13px] whitespace-nowrap text-foreground-muted transition-colors duration-150 hover:text-foreground aria-[current=page]:bg-surface-raised aria-[current=page]:font-medium aria-[current=page]:text-foreground aria-[current=page]:shadow-control"
        >
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
