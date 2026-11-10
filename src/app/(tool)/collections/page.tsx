import { Layers } from "lucide-react";
import Link from "next/link";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { CARD } from "@/app/_components/field-styles";
import { PageHeader } from "@/app/_components/page-header";
import { requireSurface } from "@/app/_lib/surface";
import * as caseStudy from "@/modules/case-study";
import * as collection from "@/modules/collection";
import { formatDateTime } from "@/shared/i18n/format";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { CollectionsTable, type CollectionRow } from "./_components/collections-table";

/**
 * The Raccolte list (Story 5.10a): every collection, for every role (`manage collections`; owner
 * 2026-11-10: admin included), newest update first, each with its name, tags, number of cases,
 * last update and who created it; filtered by business line and industry; open, rename, delete.
 * A collection is made from the Libreria (**Crea raccolta**), so the empty state leads there. A
 * failed list throws into the error boundary; without the sector list an industry shows its key.
 */
export default async function CollectionsPage() {
  const shell = await requireSurface("manage collections");
  if (shell === null) return null;

  const [listed, sectors] = await Promise.all([collection.listCollections(), caseStudy.listClientSectors()]);
  if (!listed.ok) throw new Error(`Collections could not be listed: ${listed.error.code}`);
  const now = new Date();
  const rows: CollectionRow[] = listed.value.map((c) => ({
    id: c.id,
    name: c.name,
    version: c.version,
    businessLines: caseStudy.BUSINESS_LINES.filter((line) => c.tags.businessLines.includes(line)),
    industries: c.tags.industries,
    caseCount: c.caseCount,
    createdBy: c.createdBy.name,
    updatedAt: c.updatedAt,
    updatedLabel: formatDateTime(c.updatedAt, now),
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={it.collections.title} lead={it.collections.lead} />
      {rows.length === 0 ? (
        <div className={cn(CARD, "flex flex-col items-center gap-4 px-8 py-14 text-center")}>
          <span className="flex size-11 items-center justify-center rounded-full bg-surface-control text-foreground-muted">
            <Layers aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </span>
          <p className="max-w-sm font-body text-[15px] leading-snug text-foreground-muted">{it.collections.empty}</p>
          <Link href="/library" className={PRIMARY_ACTION}>
            {it.collections.emptyAction}
          </Link>
        </div>
      ) : (
        <CollectionsTable rows={rows} businessLines={caseStudy.BUSINESS_LINES} sectors={sectors.ok ? sectors.value : []} />
      )}
    </div>
  );
}
