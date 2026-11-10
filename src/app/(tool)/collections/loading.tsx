import { CARD } from "@/app/_components/field-styles";
import { PageHeader } from "@/app/_components/page-header";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

/** First load of the Raccolte list: skeleton rows (tokens only, pulsing only without reduced motion) and a screen-reader status. */
export default function Loading() {
  const bar = "motion-safe:animate-pulse rounded-full bg-surface-control";
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <PageHeader title={it.collections.title} lead={it.collections.lead} />
      <p role="status" className="sr-only">
        {it.collections.loading}
      </p>
      <div aria-hidden="true" className={cn(CARD, "flex flex-col gap-5 px-4 py-5")}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-6">
            <div className={cn(bar, "h-3.5 w-48")} />
            <div className={cn(bar, "h-3 w-32")} />
            <div className={cn(bar, "h-3 w-16")} />
          </div>
        ))}
      </div>
    </div>
  );
}
