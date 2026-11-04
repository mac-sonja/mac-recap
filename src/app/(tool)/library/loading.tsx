import { CARD } from "@/app/_components/field-styles";
import { PageHeader } from "@/app/_components/page-header";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** Skeleton cards on the first load: one row of three, then two more, like the grid. */
const SKELETON_CARDS = 6;
const SKELETON_CHIPS = ["w-20", "w-24", "w-16", "w-28"];

/** First load of the library: skeleton search, facets and cards (tokens only, pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  const bar = "motion-safe:animate-pulse rounded-full bg-surface-control";
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <PageHeader title={it.library.title} lead={it.library.lead} />
      <p role="status" className="sr-only">
        {it.library.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className={cn(bar, "h-9 w-full max-w-sm")} />
          <div className="flex gap-2">
            {SKELETON_CHIPS.map((width) => (
              <div key={width} className={cn(bar, "h-8", width)} />
            ))}
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <li key={index} data-skeleton-card="" className={cn(CARD, "flex flex-col overflow-hidden")}>
              <div className="aspect-video w-full motion-safe:animate-pulse bg-surface-control" />
              <div className="flex flex-col gap-2 px-4 py-4">
                <div className={cn(bar, "h-3.5 w-3/4")} />
                <div className={cn(bar, "h-3 w-1/2")} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
