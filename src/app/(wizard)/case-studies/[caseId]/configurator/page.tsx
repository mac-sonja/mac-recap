import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE, parseTheme } from "@/app/_lib/theme";
import { addClientSector, updateClient } from "@/app/(tool)/clients/actions";
import { clientLimits } from "@/app/(tool)/clients/_lib/client-limits";
import { requireSurface } from "@/app/_lib/surface";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import { CASE_TEMPLATE } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import { boundValuesOf, clientMediaFiles, clientMediaOf, clientRenderAssetsOf, editableFieldsOf, imagePoolOf, pagesOfDocument, renderAssetsOf, starterPagesOf } from "../../../_lib/configurator-data";
import { Configurator } from "../../../_components/configurator/configurator";
import { generatedTextsOf } from "../../../_components/configurator/default-pages";
import { isMedia, type MediaUploadRules } from "../../../_components/configurator/media-files";
import type { FieldActions } from "../../../_components/configurator/configurator";
import {
  approveCase,
  discardCaseChanges,
  forkCaseHead,
  getRenderAssets,
  saveCaseResults,
  saveCaseTestimonial,
  saveRevisionDoc,
  updateApprovedVersion,
  updateCaseFields,
} from "./actions";

/** The field edits' saves (Story 4.3d): each through the client's or the case's own action, with its validation and permission. */
const FIELD_ACTIONS: FieldActions = { updateClient, addClientSector, updateCaseFields, saveCaseResults, saveCaseTestimonial };

/** The Media tab's drop zone: Story 2.7's limits, images and videos only. */
const MEDIA_RULES: MediaUploadRules = {
  maxFiles: material.MAX_ASSETS_PER_CASE,
  maxFileBytes: material.MAX_FILE_BYTES,
  contentTypes: material.ALLOWED_CONTENT_TYPES.filter((type) => type.startsWith("image/") || type.startsWith("video/")),
};

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
 * edited (a `working` head of an In revisione case). The component is keyed by both, so a
 * refresh after a stale save starts it afresh.
 *
 * Story 4.9: an Approvato case is editable too. Its head is either the approved revision
 * (`fork`: the first save forks a working copy through `forkCaseHead`) or a copy already
 * pending (shown with its edits, with Aggiorna and Scarta). Updating keeps the head where it
 * is, so the configurator stays; discarding moves it back, so the key starts it afresh on the
 * approved version.
 *
 * Story 4.4c: Pagine di default gets the generated texts (from `generatedDoc`) and the
 * case's images the revision already uses (none with no revision).
 *
 * Story 4.5a: the Media tab gets the case's images and videos and the upload rules.
 *
 * Story 4.8: **Approva** gets its action, the case's `head_version` and the client's files
 * (a page may show them, so they count as present).
 *
 * Story 4.3d: the stored client and case fields (`editableFieldsOf`), the shared sector list
 * and the field saves. The key leaves the values out, so the `router.refresh()` after a field
 * save brings the new values in without starting the configurator afresh.
 *
 * Story 4.5c-2: the client's images and videos ("Del cliente" in the Media tab) with their
 * render assets, drawn from the client renditions like a case file's. Without them the
 * configurator still works: the client's files are then only counted as present.
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

  const [client, assets, clientMaterial, sectorList] = await Promise.all([
    caseStudy.getClient(info.value.clientId),
    renderAssetsOf(listed.value, (assetId, spec) => material.getRendition(assetId, spec)),
    caseStudy.listClientMaterial({ clientId: info.value.clientId }),
    caseStudy.listClientSectors(),
  ]);
  if (!client.ok) throw new Error(`Client could not be loaded: ${client.error.code}`);
  // The client's files only widen what counts as present; without them a page that shows one says so, and the server checks again.
  const clientFiles = clientMaterial.ok ? clientMaterial.value.map((file) => ({ id: file.id, name: file.fileName })) : [];
  // Their images and videos draw from their renditions; a failed read leaves them undrawn, never fails the page.
  const clientListed = clientMaterial.ok ? clientMediaFiles(clientMaterial.value) : [];
  const clientAssets = await clientRenderAssetsOf(clientListed, (assetId, spec) => material.getClientRendition(assetId, spec));

  const head = revision.value;
  const doc = head?.doc ?? null;
  // Story 4.9: an approved case's head is its approved revision (forked on the first save) or its working copy.
  const fork = current.status === "approved" && head !== null && head.status === "approved" && head.id === current.approvedRevisionId;
  const pendingCopy =
    current.status === "approved" && current.approvedRevisionId !== null && head !== null && head.status === "working" && head.id !== current.approvedRevisionId;
  const editable = head !== null && ((head.status === "working" && current.status === "in_review") || fork || pendingCopy);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // Without the shared list the panel still shows the client's own sector.
  const currentSector = info.value.industry;
  const sectors = sectorList.ok ? sectorList.value : currentSector === null ? [] : [currentSector];

  return (
    <Configurator
      key={head === null ? "trial" : `${head.id}:${head.version}:${editable}`}
      revision={head === null ? null : { id: head.id, version: head.version, editable, kind: head.doc.kind, fork }}
      subject={{ kind: "case", id }}
      onSave={saveRevisionDoc}
      header={{ name: current.name, code: current.code, status: current.status }}
      back={{ href: "/case-studies", label: it.configurator.back }}
      template={doc?.template ?? CASE_TEMPLATE}
      formats={doc === null ? starterPagesOf(listed.value, form.value) : pagesOfDocument(doc.formats)}
      assets={{ ...assets, ...clientAssets }}
      generatedTexts={generatedTextsOf(head?.generatedDoc ?? null)}
      images={head === null ? [] : imagePoolOf(listed.value, [head.doc, head.generatedDoc])}
      values={boundValuesOf(current, info.value, client.value.logoUrl, form.value)}
      trial={doc === null}
      theme={theme}
      media={listed.value.filter(isMedia)}
      clientMedia={clientMediaOf(clientListed, clientAssets)}
      mediaRules={MEDIA_RULES}
      onRenderAssets={getRenderAssets}
      onApprove={approveCase}
      headVersion={current.headVersion}
      onFork={forkCaseHead}
      onUpdateApproved={updateApprovedVersion}
      onDiscard={discardCaseChanges}
      clientFiles={clientFiles}
      fields={editableFieldsOf(current, info.value, form.value)}
      fieldOptions={{
        sectors,
        limits: clientLimits(),
        years: { min: caseStudy.YEAR_MIN, max: caseStudy.YEAR_MAX },
        businessLines: caseStudy.BUSINESS_LINES,
      }}
      fieldActions={FIELD_ACTIONS}
    />
  );
}
