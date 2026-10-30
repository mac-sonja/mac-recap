import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE, parseTheme } from "@/app/_lib/theme";
import { requireSurface } from "@/app/_lib/surface";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import { CASE_TEMPLATE } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { boundValuesOf, imagePoolOf, pagesOfDocument, renderAssetsOf, starterPagesOf } from "../../../_lib/configurator-data";
import { Configurator } from "../../../_components/configurator/configurator";
import { generatedTextsOf } from "../../../_components/configurator/default-pages";
import { saveRevisionDoc } from "./actions";

export interface ConfiguratorPageProps {
  params: Promise<{ caseId: string }>;
}

/**
 * The configurator of a case (Story 4.2a): full-screen, no sidebar. Owner/designer
 * only (`edit`). A case in Bozza or In elaborazione, or an unknown, malformed or
 * deleted id, goes back to Case studies; any other load failure throws into the
 * wizard group's error boundary. Reads the editable revision (`getEditableRevision`)
 * and, with none yet, shows the template's starter pages as a *Bozza di prova*
 * (nothing is saved). The pages, the asset URLs (a rendition that isn't ready is left
 * out) and the bound values go to one client component.
 *
 * Story 4.3a: the head revision's id and `version` go with them, and whether it can be
 * edited (a `working` head of an In revisione case; an approved case waits for 4.9). The
 * component is keyed by both, so a refresh after a stale save starts it afresh.
 *
 * Story 4.4c: Pagine di default gets the generated texts (from `generatedDoc`) and the
 * case's images the revision already uses (none with no revision).
 */
export default async function ConfiguratorPage({ params }: ConfiguratorPageProps) {
  const shell = await requireSurface("edit");
  if (shell === null) return null;

  const { caseId } = await params;
  const found = await caseStudy.get(caseId);
  if (!found.ok) {
    if (found.error.code === "NOT_FOUND") redirect("/case-studies");
    throw new Error(`Case study could not be loaded: ${found.error.code}`);
  }
  const current = found.value;
  if (current.status !== "in_review" && current.status !== "approved") redirect("/case-studies");
  const id = current.id;

  const [revision, info, form, listed] = await Promise.all([
    caseStudy.getEditableRevision({ kind: "case", id }),
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

  const head = revision.value;
  const doc = head?.doc ?? null;
  const editable = head !== null && head.status === "working" && current.status === "in_review";
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <Configurator
      key={head === null ? "trial" : `${head.id}:${head.version}:${editable}`}
      revision={head === null ? null : { id: head.id, version: head.version, editable, kind: head.doc.kind }}
      caseId={id}
      onSave={saveRevisionDoc}
      header={{ name: current.name, code: current.code, status: current.status }}
      back={{ href: "/case-studies", label: it.configurator.back }}
      template={doc?.template ?? CASE_TEMPLATE}
      formats={doc === null ? starterPagesOf(listed.value, form.value) : pagesOfDocument(doc.formats)}
      assets={assets}
      generatedTexts={generatedTextsOf(head?.generatedDoc ?? null)}
      images={head === null ? [] : imagePoolOf(listed.value, [head.doc, head.generatedDoc])}
      values={boundValuesOf(current, info.value, client.value.logoUrl, form.value)}
      trial={doc === null}
      theme={theme}
    />
  );
}
