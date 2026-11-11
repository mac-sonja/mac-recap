import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { listScopeFor } from "@/app/_lib/list-scope";
import { clientConfiguratorHref, newCaseForClientHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { formatDateTime } from "@/shared/i18n/format";
import { fill, it } from "@/shared/i18n/it";
import { CaseStudiesTable } from "../../case-studies/_components/case-studies-table";
import type { CaseStudyRow } from "../../case-studies/_components/filter-sort";
import { cn } from "@/shared/utils";
import { ClientPackButton } from "../_components/client-pack-button";
import { ClientPanel } from "../_components/client-panel";
import { IndustryPills } from "../_components/industry-pills";
import { IntroStatus } from "../_components/intro-status";
import { EditClientButton } from "../_components/edit-client-button";
import { LogoTile } from "../_components/logo-tile";
import { clientLimits, clientMaterialLimits } from "../_lib/client-limits";
import { CLIENTS_SURFACE, clientsAccess } from "../_lib/clients-surface";

export interface ClientPageProps {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ modifica?: string | string[] }>;
}

/**
 * A client's page (Stories 2.13, 2.14), owner/designer only (`list clients`): the
 * logo (on a white tile), name, code, its sector as a pill and description (never
 * the brief), **Modifica** (`manage clients`, opens the edit panel, `?modifica=1`)
 * and **Modifica layout** (Story 4.12a: a link to the client's file in the configurator,
 * for a role that may `edit`, inactive with its reason while the client has no intro ready and
 * no approved case; both hidden below 1024 px, where the info is read-only), **Nuova
 * case history** with the client preselected, and the Case history table limited
 * to this client. An empty field shows nothing; a logo that can't be signed is
 * left out. A malformed or unknown id goes back to `/clients`; any other failure
 * throws into the error boundary. The uuid is only in the URL; the code is shown.
 * With `?modifica=1` and `manage clients`, the edit panel opens over the page with
 * the client's data, files and brief, and **Elimina cliente** (which needs the
 * case history count); a failed read throws into the error boundary. Story 3.11: once the
 * client has an intro-and-outro draft, "Introduzione:" and its status badge (refreshed while
 * In elaborazione). Story 4.11a: **Apri** beside it, for a role that may `edit`, once the intro
 * is Da approvare or Approvato: the intro and outro in the configurator. Story 5.9a: **Scarica**
 * (the client's pack) once the client has an approved case.
 * Story 5.9b: a role that may only `download client pack` (account/sales/social) gets it
 * read-only: the profile, the approved cases (each opens its approved case page) and
 * **Scarica**; no intro status, no edit, layout or new-case controls. A client with no
 * approved case goes back to `/clients`.
 */
export default async function ClientPage({ params, searchParams }: ClientPageProps) {
  const shell = await requireSurface(CLIENTS_SURFACE);
  if (shell === null) return null;
  const { actor, landing } = shell;
  const readOnly = clientsAccess(actor) === "read-only";
  if (!(readOnly ? authorize(actor, "download client pack", { status: "approved" }) : authorize(actor, "list clients")).ok) redirect(landing);

  const { clientId } = await params;
  const found = await caseStudy.getClient(clientId);
  if (!found.ok) {
    if (found.error.code === "CLIENT_NOT_FOUND") redirect("/clients");
    throw new Error(`Client could not be loaded: ${found.error.code}`);
  }
  const client = found.value;

  // Story 5.9b: a read-only actor sees approved cases only, whatever its own list scope.
  const scope = readOnly ? ({ status: "approved" } as const) : listScopeFor(actor);
  if (scope === null || !authorize(actor, "list cases", scope).ok) redirect(landing);
  const listed = await caseStudy.list({ ...scope, clientId: client.id });
  if (!listed.ok) throw new Error(`Case studies could not be listed: ${listed.error.code}`);
  if (readOnly && !listed.value.some((c) => c.status === "approved")) redirect("/clients");

  // Story 3.11: the intro-and-outro draft's status, once the client has one. Read-only (5.9b), the
  // status isn't shown, but the pack dialog's note still needs whether the intro is approved.
  const intro = await caseStudy.getClientIntro(client.id);
  if (!intro.ok) throw new Error(`Client intro could not be loaded: ${intro.error.code}`);

  // The sector labels (the pill here and the panel's Settore) come from the shared list.
  const sectors = await caseStudy.listClientSectors();
  if (!sectors.ok) throw new Error(`Client sectors could not be listed: ${sectors.error.code}`);

  // Read-only, approved cases only (the list is already scoped; this keeps it so).
  const cases = readOnly ? listed.value.filter((c) => c.status === "approved") : listed.value;
  const rows: CaseStudyRow[] = cases.map((c) => ({
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

  // Story 4.12a: the client's file has something to show (an intro ready, or an approved case).
  const introReady = intro.value !== null && (intro.value.status === "in_review" || intro.value.status === "approved");
  const approvedCount = listed.value.filter((c) => c.status === "approved").length;
  const hasFile = introReady || approvedCount > 0;
  // Story 5.9a: the pack draws the intro only once it is approved.
  const introApproved = intro.value !== null && intro.value.approvedRevisionId !== null;
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
            {/* Story 5.9b: the intro's status is for the roles that work on clients, not read-only ones. */}
            {readOnly || intro.value === null ? null : (
              <IntroStatus status={intro.value.status} href={can(actor, "edit") ? clientConfiguratorHref(client.id) : undefined} />
            )}
            {client.industry === null ? null : (
              <IndustryPills options={sectors.value} selected={client.industry} label={it.clients.detail.industries} />
            )}
            {client.description === null ? null : (
              <p className="max-w-prose whitespace-pre-line font-body text-[15px] leading-relaxed text-foreground-muted">{client.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Story 5.9a/5.9b: the client's pack, with at least one approved case, for every role that may download it. */}
          {can(actor, "download client pack", { status: "approved" }) && (
            <ClientPackButton clientId={client.id} name={client.name} approvedCount={approvedCount} introApproved={introApproved} />
          )}
          {can(actor, "edit") &&
            // Story 4.12a: the client's whole file in the configurator (hidden below 1024 px, as the configurator is);
            // inactive, saying why, while the file would be empty (no intro ready, no approved case).
            (hasFile ? (
              <Link href={clientConfiguratorHref(client.id)} className={cn(SECONDARY_ACTION, "hidden lg:inline-flex")}>
                {it.clientPanel.layout}
              </Link>
            ) : (
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
              </>
            ))}
          {canManage && <EditClientButton clientId={client.id} />}
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
          canEdit={can(actor, "edit")}
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
