import { CARD } from "@/app/_components/field-styles";
import { it } from "@/shared/i18n/it";

const SKELETON_ROWS = 4;

/** First load of a client's page: a heading and table skeleton (pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <p role="status" className="sr-only">
        {it.clients.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-4 w-16 motion-safe:animate-pulse rounded-full bg-surface-control" />
        <div className="flex items-center gap-4">
          <div className="size-20 motion-safe:animate-pulse rounded-lg bg-surface-control" />
          <div className="flex flex-col gap-2">
            <div className="h-7 w-64 motion-safe:animate-pulse rounded-full bg-surface-control" />
            <div className="h-4 w-12 motion-safe:animate-pulse rounded-full bg-surface-control" />
          </div>
        </div>
        <div className={CARD}>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} data-skeleton-row="" className="flex gap-8 border-b border-border px-4 py-4 last:border-b-0">
              <div className="h-3.5 w-24 motion-safe:animate-pulse rounded-full bg-surface-control" />
              <div className="h-3.5 w-48 motion-safe:animate-pulse rounded-full bg-surface-control" />
              <div className="h-3.5 w-20 motion-safe:animate-pulse rounded-full bg-surface-control" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
