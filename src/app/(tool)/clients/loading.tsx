import { it } from "@/shared/i18n/it";

const SKELETON_ROWS = 6;
const SKELETON_CELLS = ["w-12", "w-48", "w-8"];

/** First load of the Clients table: skeleton rows (tokens only, pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <h1 className="font-heading text-2xl font-medium text-foreground">{it.clients.heading}</h1>
      <p role="status" className="sr-only">
        {it.clients.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-9 w-full max-w-md motion-safe:animate-pulse rounded-md bg-border" />
        <div className="rounded-lg border bg-surface-raised">
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} data-skeleton-row="" className="flex gap-6 border-b px-3 py-3 last:border-b-0">
              {SKELETON_CELLS.map((width, cell) => (
                <div key={cell} className={`h-4 ${width} motion-safe:animate-pulse rounded-sm bg-border`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
