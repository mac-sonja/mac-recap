import { CARD } from "@/app/_components/field-styles";
import { PageHeader } from "@/app/_components/page-header";
import { it } from "@/shared/i18n/it";

const SKELETON_ROWS = 6;
const SKELETON_CELLS = ["w-20", "w-40", "w-28", "w-10", "w-20", "w-24", "w-24"];

/** First load of the Case table: skeleton rows (tokens only, pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <PageHeader title={it.caseStudies.heading} lead={it.caseStudies.lead} />
      <p role="status" className="sr-only">
        {it.caseStudies.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="h-9 w-full max-w-md motion-safe:animate-pulse rounded-full bg-surface-control" />
        <div className={CARD}>
          {Array.from({ length: SKELETON_ROWS }, (_, row) => (
            <div key={row} data-skeleton-row="" className="flex gap-8 border-b border-border px-4 py-4 last:border-b-0">
              {SKELETON_CELLS.map((width, cell) => (
                <div key={cell} className={`h-3.5 ${width} motion-safe:animate-pulse rounded-full bg-surface-control`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
