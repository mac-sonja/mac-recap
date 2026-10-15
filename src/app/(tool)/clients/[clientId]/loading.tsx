import { it } from "@/shared/i18n/it";

const SKELETON_ROWS = 4;

/** First load of a client's page: a heading and table skeleton (pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {it.clients.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-8 w-64 motion-safe:animate-pulse rounded-md bg-border" />
        <div className="h-4 w-12 motion-safe:animate-pulse rounded-sm bg-border" />
        <div className="rounded-lg border bg-surface-raised">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} data-skeleton-row="" className="flex gap-6 border-b px-3 py-3 last:border-b-0">
              <div className="h-4 w-24 motion-safe:animate-pulse rounded-sm bg-border" />
              <div className="h-4 w-48 motion-safe:animate-pulse rounded-sm bg-border" />
              <div className="h-4 w-20 motion-safe:animate-pulse rounded-sm bg-border" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
