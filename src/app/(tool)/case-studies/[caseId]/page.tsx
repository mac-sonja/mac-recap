import { redirect } from "next/navigation";
import { configuratorHref, wizardHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { can } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import { CASE_TEMPLATE } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { boundValuesOf, pagesOfDocument, renderAssetsOf, starterPagesOf } from "@/app/(wizard)/_lib/configurator-data";
import { CaseView } from "../_components/case-view";

export interface CaseViewPageProps {
  params: Promise<{ caseId: string }>;
}

/**
 * An approved case's detail page (Story 5.2, part): in the tool shell, laid out like a
 * client's page, read-only, for every role that may `list cases` and `view` the case. Any
 * other status redirects: a Bozza to the wizard, a Da approvare to the configurator for a
 * role that may `edit`, anything else (and an unknown, malformed or deleted id) to Case
 * studies; any other load failure throws into the error boundary. Reads the live revision
 * (`getLiveRevision`), never the working head; with none approved yet, it shows the
 * template's starter pages with the *Bozza di prova* note, as the configurator does.
 * **Elimina** shows only to a role that may `delete case` an approved case (owner, 2026-10-28).
 */
export default async function CaseViewPage({ params }: CaseViewPageProps) {
  // Any role that may list approved cases: the sales role's `list cases` is approved only.
  const shell = await requireSurface("list cases", { status: "approved" });
  if (shell === null) return null;
  const { actor } = shell;

  const { caseId } = await params;
  const found = await caseStudy.get(caseId);
  if (!found.ok) {
    if (found.error.code === "NOT_FOUND") redirect("/case-studies");
    throw new Error(`Case study could not be loaded: ${found.error.code}`);
  }
  const current = found.value;
  const id = current.id;
  const canEdit = can(actor, "edit");
  if (!can(actor, "view", { status: current.status })) {
    if (current.status === "draft") redirect(wizardHref(id));
    if (current.status === "in_review" && canEdit) redirect(configuratorHref(id));
    redirect("/case-studies");
  }

  const [revision, info, form, listed] = await Promise.all([
    caseStudy.getLiveRevision({ kind: "case", id }),
    caseStudy.getClientInfoForCase(id),
    material.getDetailsForm({ caseId: id }),
    material.listAssets({ caseId: id }),
  ]);
  if (!revision.ok) throw new Error(`Revision could not be loaded: ${revision.error.code}`);
  if (!info.ok) throw new Error(`Client info could not be loaded: ${info.error.code}`);
  if (!form.ok) throw new Error(`Details could not be loaded: ${form.error.code}`);
  if (!listed.ok) throw new Error(`Material could not be loaded: ${listed.error.code}`);

  const [client, assets] = await Promise.all([
    caseStudy.getClient(info.value.clientId),
    renderAssetsOf(listed.value, (assetId, spec) => material.getRendition(assetId, spec)),
  ]);
  if (!client.ok) throw new Error(`Client could not be loaded: ${client.error.code}`);

  const doc = revision.value?.doc ?? null;
  const canDelete = can(actor, "delete case", { status: "approved" });

  return (
    <CaseView
      header={{ name: current.name, code: current.code, status: current.status }}
      back={{ href: "/case-studies", label: it.caseView.back }}
      template={doc?.template ?? CASE_TEMPLATE}
      formats={doc === null ? starterPagesOf(listed.value, form.value) : pagesOfDocument(doc.formats)}
      assets={assets}
      values={boundValuesOf(current, info.value, client.value.logoUrl, form.value)}
      trial={doc === null}
      editHref={canEdit ? configuratorHref(id) : null}
      deleteCaseId={canDelete ? id : null}
    />
  );
}
