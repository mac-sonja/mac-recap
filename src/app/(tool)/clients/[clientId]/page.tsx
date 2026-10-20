import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PRIMARY_ACTION } from "@/app/_components/button-styles";
import { listScopeFor } from "@/app/_lib/list-scope";
import { newCaseForClientHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { authorize, can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import { formatDateTime } from "@/shared/i18n/format";
import { fill, it } from "@/shared/i18n/it";
import { CaseStudiesTable } from "../../case-studies/_components/case-studies-table";
import type { CaseStudyRow } from "../../case-studies/_components/filter-sort";
import { IndustryPills } from "../_components/industry-pills";
import { EditClientButton } from "../_components/edit-client-button";
import { LogoTile } from "../_components/logo-tile";

export interface ClientPageProps {
  params: Promise<{ clientId: string }>;
}

/**
 * A client's page (Stories 2.13, 2.14), owner/designer only (`list clients`): the
 * logo (on a white tile), name, code, industries as pills and description (never
 * the brief), **Modifica cliente** (`manage clients`, opens the client wizard at
 * step 1; hidden below 1024 px, where the info is read-only), **Nuova
 * case history** with the client preselected, and the Case history table limited
 * to this client. An empty field shows nothing; a logo that can't be signed is
 * left out. A malformed or unknown id goes back to `/clients`; any other failure
 * throws into the error boundary. The uuid is only in the URL; the code is shown.
 */
export default async function ClientPage({ params }: ClientPageProps) {
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
    businessLine: c.businessLine,
    updatedAt: c.updatedAt,
    updatedLabel: formatDateTime(c.updatedAt),
  }));

  const canCreate = can(actor, "create case");
  const newHref = newCaseForClientHref(client.id);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/clients"
        className="inline-flex w-fit items-center gap-1 font-label text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {it.clients.detail.back}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {client.logoUrl === null ? null : (
            <LogoTile src={client.logoUrl} alt={fill(it.clients.detail.logoAlt, { name: client.name })} className="size-24" />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading text-2xl font-medium text-foreground">{client.name}</h1>
            <p className="font-mono text-sm text-foreground-muted">
              <span className="sr-only">{it.clients.detail.code} </span>
              {client.code}
            </p>
            {client.industries.length === 0 ? null : (
              <IndustryPills options={caseStudy.CLIENT_INDUSTRIES} selected={client.industries} label={it.clients.detail.industries} />
            )}
            {client.description === null ? null : (
              <p className="max-w-prose whitespace-pre-line font-body text-sm text-foreground-muted">{client.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {can(actor, "manage clients") && <EditClientButton clientId={client.id} />}
          {canCreate && (
            <Link href={newHref} className={PRIMARY_ACTION}>
              <Plus aria-hidden="true" className="size-4" />
              {it.shell.nav.newCaseStudy}
            </Link>
          )}
        </div>
      </div>
      <section className="flex flex-col gap-4" aria-labelledby="client-cases-heading">
        <h2 id="client-cases-heading" className="font-heading text-lg font-medium text-foreground">
          {it.clients.detail.casesHeading}
        </h2>
        <CaseStudiesTable rows={rows} canCreate={canCreate} emptyMessage={it.clients.detail.noCases} newHref={newHref} />
      </section>
    </div>
  );
}
