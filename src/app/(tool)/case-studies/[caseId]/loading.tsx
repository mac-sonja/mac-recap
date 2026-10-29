import { it } from "@/shared/i18n/it";

/**
 * First load of an approved case's page: the back link, heading and preview panel as
 * placeholders (pulsing only without reduced motion) and a screen-reader status. Without
 * it, the Case table's skeleton would show while the case loads.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <p role="status" className="sr-only">
        {it.caseStudies.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-8">
        <div className="h-4 w-40 motion-safe:animate-pulse rounded-full bg-surface-control" />
        <div className="flex flex-col gap-2">
          <div className="h-7 w-72 motion-safe:animate-pulse rounded-full bg-surface-control" />
          <div className="h-4 w-24 motion-safe:animate-pulse rounded-full bg-surface-control" />
        </div>
        <div className="h-[calc(100dvh-16rem)] min-h-[560px] motion-safe:animate-pulse rounded-xl bg-surface-control" />
      </div>
    </div>
  );
}
