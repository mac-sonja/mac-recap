import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { listScopeFor } from "@/app/_lib/list-scope";
import { newCaseForClientHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { formatDateTime } from "@/shared/i18n/format";
import { fill, it } from "@/shared/i18n/it";
import { CaseStudiesTable } from "../../case-studies/_components/case-studies-table";
import type { CaseStudyRow } from "../../case-studies/_components/filter-sort";
import { cn } from "@/shared/utils";
import { ClientPanel } from "../_components/client-panel";
import { IndustryPills } from "../_components/industry-pills";
import { EditClientButton } from "../_components/edit-client-button";
import { LogoTile } from "../_components/logo-tile";
import { clientLimits, clientMaterialLimits } from "../_lib/client-limits";

export interface ClientPageProps {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ modifica?: string | string[] }>;
}

/**
 * A client's page (Stories 2.13, 2.14), owner/designer only (`list clients`): the
 * logo (on a white tile), name, code, its sector as a pill and description (never
 * the brief), **Modifica** (`manage clients`, opens the edit panel, `?modifica=1`)
 * and an inactive **Modifica layout** (until the configurator; both hidden below
 * 1024 px, where the info is read-only), **Nuova
 * case history** with the client preselected, and the Case history table limited
 * to this client. An empty field shows nothing; a logo that can't be signed is
 * left out. A malformed or unknown id goes back to `/clients`; any other failure
 * throws into the error boundary. The uuid is only in the URL; the code is shown.
 * With `?modifica=1` and `manage clients`, the edit panel opens over the page with
 * the client's data, files and brief, and **Elimina cliente** (which needs the
 * case history count); a failed read throws into the error boundary.
 */
export default async function ClientPage({ params, searchParams }: ClientPageProps) {
  const shell = await requireSurface("list clients");
  if (shell === null) return null;
  const { actor, landing } = shell;
  if (!authorize(actor, "list clients").ok) redirect(landing);

  const { clientId } = await params;
  const found = await caseStudy.getClient(clientId);
  if (!found.ok) {
    if (found.error.code === "CLIENT_NOT_FOUND") redirect("/clients");
    throw new Error(`Client could not be loaded: ${found.error.code}`);
  }
  const client = found.value;

  // The sector labels (the pill here and the panel's Settore) come from the shared list.
  const sectors = await caseStudy.listClientSectors();
  if (!sectors.ok) throw new Error(`Client sectors could not be listed: ${sectors.error.code}`);

  const scope = listScopeFor(actor);
  if (scope === null || !authorize(actor, "list cases", scope).ok) redirect(landing);
  const listed = await caseStudy.list({ ...scope, clientId: client.id });
  if (!listed.ok) throw new Error(`Case studies could not be listed: ${listed.error.code}`);

  const rows: CaseStudyRow[] = listed.value.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    clientName: c.client.name,
    clientCode: c.client.code,
    year: c.year,
    status: c.status,
    businessLines: c.businessLines,
    updatedAt: c.updatedAt,
    updatedLabel: formatDateTime(c.updatedAt),
  }));

  const canCreate = can(actor, "create case");
  const newHref = newCaseForClientHref(client.id);
  const canManage = can(actor, "manage clients");

  // The edit panel: the client's files (with signed thumbnails) and, for Elimina cliente, its case count.
  let panel: { assets: caseStudy.ListedClientAsset[]; caseCount: number | null } | null = null;
  if (canManage && (await searchParams)?.modifica === "1") {
    const material = await caseStudy.listClientMaterial({ clientId: client.id });
    if (!material.ok) throw new Error(`Client material could not be loaded: ${material.error.code}`);
    let caseCount: number | null = null;
    if (can(actor, "list cases", {})) {
      const cases = await caseStudy.list({ clientId: client.id });
      if (!cases.ok) throw new Error(`Case studies could not be listed: ${cases.error.code}`);
      caseCount = cases.value.length;
    }
    panel = { assets: material.value, caseCount };
  }

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/clients"
        className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded-sm font-label text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {it.clients.detail.back}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-5">
          {client.logoUrl === null ? null : (
            <LogoTile src={client.logoUrl} alt={fill(it.clients.detail.logoAlt, { name: client.name })} className="size-20" />
          )}
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-heading text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-foreground-strong">
              {client.name}
            </h1>
            <p className="font-mono text-xs text-foreground-muted">
              <span className="sr-only">{it.clients.detail.code} </span>
              {client.code}
            </p>
            {client.industry === null ? null : (
              <IndustryPills options={sectors.value} selected={client.industry} label={it.clients.detail.industries} />
            )}
            {client.description === null ? null : (
              <p className="max-w-prose whitespace-pre-line font-body text-[15px] leading-relaxed text-foreground-muted">{client.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <button
                type="button"
                aria-disabled="true"
                aria-describedby="client-layout-reason"
                className={cn(SECONDARY_ACTION, "hidden cursor-not-allowed text-foreground-muted lg:inline-flex")}
              >
                {it.clientPanel.layout}
              </button>
              <span id="client-layout-reason" className="sr-only">
                {it.clientPanel.layoutReason}
              </span>
              <EditClientButton clientId={client.id} />
            </>
          )}
          {canCreate && (
            <Link href={newHref} className={PRIMARY_ACTION}>
              {it.clients.detail.newCase}
            </Link>
          )}
        </div>
      </div>
      <section className="flex flex-col gap-4" aria-labelledby="client-cases-heading">
        <h2 id="client-cases-heading" className="font-heading text-lg font-semibold tracking-[-0.01em] text-foreground-strong">
          {it.clients.detail.casesHeading}
        </h2>
        <CaseStudiesTable
          rows={rows}
          canCreate={canCreate}
          emptyMessage={it.clients.detail.noCases}
          emptyAction={it.clients.detail.newCase}
          newHref={newHref}
        />
      </section>
      {panel !== null && (
        <ClientPanel
          key={client.id}
          client={client}
          assets={panel.assets}
          caseCount={panel.caseCount}
          sectors={sectors.value}
          limits={clientLimits()}
          materialLimits={clientMaterialLimits()}
        />
      )}
    </div>
  );
}
