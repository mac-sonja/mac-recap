import { redirect } from "next/navigation";
import { requireSurface } from "@/app/_lib/surface";
import { listScopeFor } from "@/app/_lib/list-scope";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { PageHeader } from "@/app/_components/page-header";
import { it } from "@/shared/i18n/it";
import { ClientsTable } from "./_components/clients-table";
import type { ClientRow } from "./_components/filter-sort";

/**
 * The Clients page (Story 2.13), owner/designer only (`list clients`; any other
 * role goes to its landing). Every client with its non-deleted case count loads
 * once; search and sort run in the browser. **Aggiungi cliente** exists only with
 * `manage clients`. A card with approved cases offers **Scarica** (the client pack).
 * A failed load throws into Next's error boundary: no partial table.
 */
export default async function ClientsPage() {
  const shell = await requireSurface("list clients");
  if (shell === null) return null;
  const { actor, landing } = shell;
  if (!authorize(actor, "list clients").ok) redirect(landing);

  const listed = await caseStudy.listClientSummaries();
  if (!listed.ok) throw new Error(`Clients could not be listed: ${listed.error.code}`);

  // Approved cases per client, for the card's Scarica (the client pack).
  const approved = new Map<string, number>();
  const scope = listScopeFor(actor);
  if (scope !== null && can(actor, "list cases")) {
    const cases = await caseStudy.list(scope);
    if (!cases.ok) throw new Error(`Case studies could not be listed: ${cases.error.code}`);
    for (const c of cases.value) {
      if (c.status === "approved") approved.set(c.client.id, (approved.get(c.client.id) ?? 0) + 1);
    }
  }

  const rows: ClientRow[] = listed.value.map(({ id, code, name, caseCount, complete, logoUrl }) => ({
    id,
    code,
    name,
    caseCount,
    approvedCount: approved.get(id) ?? 0,
    complete,
    logoUrl,
  }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={it.clients.heading} lead={it.clients.lead} />
      <ClientsTable rows={rows} canManage={can(actor, "manage clients")} />
    </div>
  );
}
