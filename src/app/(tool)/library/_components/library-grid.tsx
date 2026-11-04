import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { libraryHref, pagerItems, type LibraryState } from "../_lib/library-data";
import { LibraryCard, type LibraryCardProps } from "./library-card";

/** The pager's square buttons: a page number, or ‹ ›. */
const PAGER_ITEM =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2.5 font-label text-[13px] tabular-nums text-foreground-muted transition-colors duration-150";
const PAGER_LINK = `${PAGER_ITEM} hover:bg-surface-hover hover:text-foreground-strong aria-[current=page]:bg-surface-raised aria-[current=page]:font-medium aria-[current=page]:text-foreground-strong aria-[current=page]:shadow-control`;

/**
 * The library's numbered pages (no infinite scroll): ‹, the page numbers (the first, the
 * last and the current one with its neighbours, gaps as …), ›. Each is a link that keeps
 * the search and the facets, so Back and reload return to the same page.
 */
function Pager({ state, page, pageCount }: { state: LibraryState; page: number; pageCount: number }) {
  const copy = it.library.pager;
  const hrefOf = (n: number) => libraryHref({ ...state, page: n });
  const step = (n: number, label: string, Icon: typeof ChevronLeft) =>
    n < 1 || n > pageCount ? (
      <span aria-disabled="true" aria-label={label} role="link" className={cn(PAGER_ITEM, "opacity-40")}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
    ) : (
      <Link href={hrefOf(n)} aria-label={label} title={label} className={PAGER_LINK}>
        <Icon aria-hidden="true" className="size-4" />
      </Link>
    );
  return (
    <nav aria-label={copy.label} className="flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        <li>{step(page - 1, copy.previous, ChevronLeft)}</li>
        {pagerItems(page, pageCount).map((n, index) => (
          <li key={n ?? `gap-${index}`}>
            {n === null ? (
              <span aria-hidden="true" className={PAGER_ITEM}>
                …
              </span>
            ) : (
              <Link
                href={hrefOf(n)}
                aria-label={fill(copy.page, { n })}
                aria-current={n === page ? "page" : undefined}
                className={PAGER_LINK}
              >
                {n}
              </Link>
            )}
          </li>
        ))}
        <li>{step(page + 1, copy.next, ChevronRight)}</li>
      </ul>
    </nav>
  );
}

/**
 * The cards of one page of the library (Story 5.1), newest approval first, and the pager
 * under them when there is more than one page.
 */
export function LibraryGrid({
  cards,
  state,
  page,
  pageCount,
}: {
  cards: readonly LibraryCardProps[];
  /** The search and facets the pager's links keep. */
  state: LibraryState;
  page: number;
  pageCount: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      <ul data-library-grid="" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <LibraryCard key={card.id} {...card} />
        ))}
      </ul>
      {pageCount > 1 && <Pager state={state} page={page} pageCount={pageCount} />}
    </div>
  );
}
