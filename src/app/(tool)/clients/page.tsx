import { redirect } from "next/navigation";
import { requireSurface } from "@/app/_lib/surface";
import { listScopeFor } from "@/app/_lib/list-scope";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { PageHeader } from "@/app/_components/page-header";
import { it } from "@/shared/i18n/it";
import { log } from "@/shared/log";
import { ClientPanel } from "./_components/client-panel";
import { ClientsTable } from "./_components/clients-table";
import type { ClientRow } from "./_components/filter-sort";
import { clientLimits, clientMaterialLimits } from "./_lib/client-limits";
import { CLIENTS_SURFACE, clientsAccess } from "./_lib/clients-surface";

export interface ClientsPageProps {
  searchParams?: Promise<{ nuovo?: string | string[] }>;
}

/**
 * The Clients page (Story 2.13), for `list clients` (owner/designer, admin); any other
 * role goes to its landing, except one that may `download client pack` (Story 5.9b,
 * account/sales/social), which gets a read-only list: only the clients with an approved
 * case, counted by approved cases, without the profile's status. Every client with its
 * non-deleted case count loads once; search and sort run in the browser. **Aggiungi
 * cliente** exists only with `manage clients`. A card with approved cases offers
 * **Scarica** (the client pack, Story 5.9a; its dialog notes when the client's intro isn't
 * approved).
 * A failed load throws into Next's error boundary: no partial table. With
 * `?nuovo=1` and `manage clients`, the add panel (**Nuovo cliente**) opens over the list.
 */
export default async function ClientsPage({ searchParams }: ClientsPageProps = {}) {
  const shell = await requireSurface(CLIENTS_SURFACE);
  if (shell === null) return null;
  const { actor, landing } = shell;
  const readOnly = clientsAccess(actor) === "read-only";
  // Story 5.9b: a read-only actor lists approved cases only, whatever its own list scope.
  if (!(readOnly ? authorize(actor, "download client pack", { status: "approved" }) : authorize(actor, "list clients")).ok) redirect(landing);
  if (readOnly && !authorize(actor, "list cases", { status: "approved" }).ok) redirect(landing);
  const scope = listScopeFor(actor);
  const caseScope = readOnly ? ({ status: "approved" } as const) : scope !== null && can(actor, "list cases") ? scope : null;

  const listed = await caseStudy.listClientSummaries();
  if (!listed.ok) throw new Error(`Clients could not be listed: ${listed.error.code}`);

  // Approved cases per client: the card's Scarica (the client pack) and, read-only, which clients show.
  const approved = new Map<string, number>();
  if (caseScope !== null) {
    const cases = await caseStudy.list(caseScope);
    if (!cases.ok) throw new Error(`Case studies could not be listed: ${cases.error.code}`);
    for (const c of cases.value) {
      if (c.status === "approved") approved.set(c.client.id, (approved.get(c.client.id) ?? 0) + 1);
    }
  }

  // Story 5.9a: whether each pack's intro is approved (the dialog's note), read only for cards with Scarica.
  // A failed read leaves it unknown (null): the card keeps Scarica, the dialog claims nothing.
  const introApproved = new Map<string, boolean | null>();
  await Promise.all(
    [...approved.keys()].map(async (clientId) => {
      const intro = await caseStudy.getClientIntro(clientId);
      if (!intro.ok) {
        log.warn(`client intro not read for the pack: ${intro.error.code}`, { clientId });
        introApproved.set(clientId, null);
        return;
      }
      introApproved.set(clientId, intro.value !== null && intro.value.approvedRevisionId !== null);
    }),
  );

  // Read-only: only clients with an approved case, counted by approved cases (no draft counts).
  const summaries = readOnly ? listed.value.filter(({ id }) => approved.has(id)) : listed.value;
  const rows: ClientRow[] = summaries.map(({ id, code, name, caseCount, complete, logoUrl }) => ({
    id,
    code,
    name,
    caseCount: readOnly ? (approved.get(id) ?? 0) : caseCount,
    approvedCount: approved.get(id) ?? 0,
    introApproved: introApproved.get(id) ?? null,
    complete,
    logoUrl,
  }));

  const canManage = can(actor, "manage clients");
  const adding = canManage && (await searchParams)?.nuovo === "1";

  // The panel's Settore pills: the shared list, read fresh each time it opens.
  let sectors: caseStudy.ClientSector[] = [];
  if (adding) {
    const listedSectors = await caseStudy.listClientSectors();
    if (!listedSectors.ok) throw new Error(`Client sectors could not be listed: ${listedSectors.error.code}`);
    sectors = listedSectors.value;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={it.clients.heading} lead={it.clients.lead} />
      <ClientsTable rows={rows} canManage={canManage} readOnly={readOnly} />
      {adding && (
        <ClientPanel
          client={null}
          assets={[]}
          caseCount={null}
          sectors={sectors}
          limits={clientLimits()}
          materialLimits={clientMaterialLimits()}
        />
      )}
    </div>
  );
}
