import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { THEME_COOKIE, parseTheme } from "@/app/_lib/theme";
import { clientHref } from "@/app/_lib/routes";
import { requireSurface } from "@/app/_lib/surface";
import { addClientSector, saveClientResults, saveClientTestimonial, updateClient } from "@/app/(tool)/clients/actions";
import { clientLimits } from "@/app/(tool)/clients/_lib/client-limits";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { clientBoundValuesOf, clientEditableFieldsOf, clientMediaFiles, clientMediaOf, clientRenderAssetsOf, pagesOfDocument } from "../../../_lib/configurator-data";
import { Configurator, type FieldActions } from "../../../_components/configurator/configurator";
import { generatedTextsOf } from "../../../_components/configurator/default-pages";
import type { MediaUploadRules } from "../../../_components/configurator/media-files";
import { approveIntro, getIntroRenderAssets, saveIntroRevisionDoc } from "./actions";
import { caseMediaOfClient, caseMediaRenderAssets } from "./case-media";

/** Client mode's field edits: the client's own actions only (no case binding is offered). */
const FIELD_ACTIONS: FieldActions = { updateClient, addClientSector, saveClientResults, saveClientTestimonial };

/** The Media tab's drop zone in client mode: the client material's limits, images and videos only. */
const MEDIA_RULES: MediaUploadRules = {
  maxFiles: caseStudy.CLIENT_MATERIAL_MAX_FILES,
  maxFileBytes: caseStudy.CLIENT_MATERIAL_MAX_BYTES,
  contentTypes: caseStudy.CLIENT_MATERIAL_CONTENT_TYPES.filter((type) => type.startsWith("image/") || type.startsWith("video/")),
  imagePixels: { min: caseStudy.CLIENT_IMAGE_MIN_SHORT_SIDE_PX, max: caseStudy.CLIENT_IMAGE_MAX_SIDE_PX },
};

export interface ClientConfiguratorPageProps {
  params: Promise<{ clientId: string }>;
}

/**
 * A client's intro and outro in the configurator (Story 4.11a, client mode): full screen,
 * owner/designer only (`edit`). Only the client's own pages, grouped as Introduzione and
 * Chiusura. An intro Da approvare opens editable (saves go to its working revision); an
 * Approvato one opens read-only, with no Approva and no save (editing it comes with 4.11b).
 * No intro, or one in Bozza or In elaborazione, goes back to the client page; an unknown,
 * malformed or deleted client to Clienti. Any other load failure throws into the wizard
 * group's error boundary.
 *
 * The top bar reads "{Client} · Pagine cliente" with the client's code, and back goes to the
 * client page. The Media tab lists the client's images and videos ("Del cliente", uploads go
 * to the client within its file limit) and its cases' ("Dalle sue case"). The client's name,
 * sector, description, logo, results and testimonial are edited through the client's own
 * actions. Pagine di default fills the client template's texts and draws the client's images
 * in upload order.
 */
export default async function ClientConfiguratorPage({ params }: ClientConfiguratorPageProps) {
  const shell = await requireSurface("edit");
  if (shell === null) return null;

  const { clientId } = await params;
  const found = await caseStudy.getClient(clientId);
  if (!found.ok) {
    if (found.error.code === "CLIENT_NOT_FOUND") redirect("/clients");
    throw new Error(`Client could not be loaded: ${found.error.code}`);
  }
  const client = found.value;
  const back = clientHref(client.id);

  const intro = await caseStudy.getClientIntro(client.id);
  if (!intro.ok) throw new Error(`Client intro could not be loaded: ${intro.error.code}`);
  const current = intro.value;
  if (current === null || (current.status !== "in_review" && current.status !== "approved")) redirect(back);

  const revision = await caseStudy.getEditableRevision({ kind: "client_intro", id: current.id });
  if (!revision.ok) throw new Error(`Revision could not be loaded: ${revision.error.code}`);
  const head = revision.value;
  if (head === null) redirect(back);

  const [clientMaterial, sectorList, caseMedia] = await Promise.all([
    caseStudy.listClientMaterial({ clientId: client.id }),
    caseStudy.listClientSectors(),
    caseMediaOfClient(client.id),
  ]);
  if (!clientMaterial.ok) throw new Error(`Client material could not be loaded: ${clientMaterial.error.code}`);
  if (!caseMedia.ok) throw new Error(`Case material could not be loaded: ${caseMedia.error.code}`);

  const clientListed = clientMediaFiles(clientMaterial.value);
  const [clientAssets, caseAssets] = await Promise.all([
    clientRenderAssetsOf(clientListed, (assetId, spec) => material.getClientRendition(assetId, spec)),
    caseMediaRenderAssets(caseMedia.value),
  ]);

  // Without the shared list the page shows the client's own sector key in place of its label.
  const sectors = sectorList.ok ? sectorList.value : [];
  const sector = sectors.find((s) => s.key === client.industry)?.label ?? client.industry ?? "";
  const editable = current.status === "in_review" && head.status === "working";
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <Configurator
      key={`${head.id}:${head.version}:${editable}`}
      revision={{ id: head.id, version: head.version, editable, kind: head.doc.kind }}
      subject={{ kind: "client_intro", id: current.id, clientId: client.id }}
      onSave={saveIntroRevisionDoc}
      header={{ name: fill(it.configurator.clientTitle, { name: client.name }), code: client.code, status: current.status }}
      back={{ href: back, label: it.configurator.clientBack }}
      template={head.doc.template}
      formats={pagesOfDocument(head.doc.formats)}
      assets={{ ...caseAssets, ...clientAssets }}
      generatedTexts={generatedTextsOf(head.generatedDoc)}
      // The client's images in upload order: what Pagine di default draws first.
      images={clientListed.filter((file) => file.kind === "image").map((file) => file.id)}
      values={clientBoundValuesOf(client, sector)}
      trial={false}
      theme={theme}
      // A file not drawn yet is pending, so the Media tab keeps asking for its rendition (as after a listing).
      media={clientMediaOf(clientListed, clientAssets).map((file) => ({ ...file, thumbnailPending: !(file.id in clientAssets) }))}
      clientMedia={caseMedia.value}
      mediaRules={MEDIA_RULES}
      onRenderAssets={getIntroRenderAssets}
      onApprove={approveIntro}
      headVersion={current.headVersion}
      clientFiles={caseMedia.value.map((file) => ({ id: file.id, name: file.originalFileName }))}
      fields={clientEditableFieldsOf(client)}
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
