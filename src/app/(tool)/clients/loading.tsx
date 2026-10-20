import { CARD } from "@/app/_components/field-styles";
import { PageHeader } from "@/app/_components/page-header";
import { it } from "@/shared/i18n/it";

const SKELETON_CARDS = 8;

/** First load of the Clients grid: skeleton cards (tokens only, pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <PageHeader title={it.clients.heading} lead={it.clients.lead} />
      <p role="status" className="sr-only">
        {it.clients.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="h-9 w-80 motion-safe:animate-pulse rounded-full bg-surface-control" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
          {Array.from({ length: SKELETON_CARDS }, (_, card) => (
            <div key={card} data-skeleton-row="" className={`${CARD} flex flex-col gap-5 p-4`}>
              <div className="flex items-center gap-3">
                <div className="size-11 motion-safe:animate-pulse rounded-md bg-surface-control" />
                <div className="flex flex-col gap-2">
                  <div className="h-3.5 w-28 motion-safe:animate-pulse rounded-full bg-surface-control" />
                  <div className="h-3 w-12 motion-safe:animate-pulse rounded-full bg-surface-control" />
                </div>
              </div>
              <div className="h-5 w-40 motion-safe:animate-pulse rounded-full bg-surface-control" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
