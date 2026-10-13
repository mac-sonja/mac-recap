import { redirect } from "next/navigation";
import { listScopeFor } from "@/app/_lib/list-scope";
import { requireSurface } from "@/app/_lib/surface";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { formatDateTime } from "@/shared/i18n/format";
import { CaseStudiesTable } from "./_components/case-studies-table";
import type { CaseStudyRow } from "./_components/filter-sort";

/**
 * The Case studies table. The scope comes from the `list cases` policy (every
 * status, or approved only) and is passed as is to `case-study.list`, so no scope
 * the policy denies is ever queried. The list loads once; search and sort run in
 * the browser. A failed load throws into Next's error boundary: no partial table.
 */
export default async function CaseStudiesPage() {
  const shell = await requireSurface("list cases");
  if (shell === null) return null;
  const { actor, landing } = shell;

  const scope = listScopeFor(actor);
  if (scope === null || !authorize(actor, "list cases", scope).ok) redirect(landing);

  const listed = await caseStudy.list(scope);
  if (!listed.ok) throw new Error(`Case studies could not be listed: ${listed.error.code}`);

  const rows: CaseStudyRow[] = listed.value.map((c) => ({
    id: c.id,
    name: c.name,
    client: c.client,
    year: c.year,
    status: c.status,
    updatedAt: c.updatedAt,
    updatedLabel: formatDateTime(c.updatedAt),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-foreground">{it.caseStudies.heading}</h1>
      <CaseStudiesTable rows={rows} canCreate={can(actor, "create case")} />
    </div>
  );
}
