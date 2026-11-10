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
import { FORMAT_IDS, type FormatId } from "@/modules/rendering";
import type { Page } from "@/modules/generation";
import { forkCaseHead, saveRevisionDoc } from "../../../case-studies/[caseId]/configurator/actions";
import { clientBoundValuesOf, clientEditableFieldsOf, clientMediaFiles, clientMediaOf, clientRenderAssetsOf } from "../../../_lib/configurator-data";
import { Configurator, type FieldActions } from "../../../_components/configurator/configurator";
import type { MediaUploadRules } from "../../../_components/configurator/media-files";
import {
  approveIntro,
  discardIntroChanges,
  forkIntroHead,
  getClientFileRenderAssets,
  reloadFilePart,
  saveIntroRevisionDoc,
  updateApprovedIntroVersion,
} from "./actions";
import { caseMediaOfClient, caseMediaRenderAssets } from "./case-media";
import { casePartsOf, introPartOf } from "./file-parts";

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

/** No pages: the client's file draws its parts' own (the configurator's single document stays idle). */
const NO_PAGES = Object.fromEntries(FORMAT_IDS.map((id) => [id, [] as readonly Page[]])) as Readonly<Record<FormatId, readonly Page[]>>;

/**
 * A client's whole file in the configurator (Story 4.12a; Story 4.11a's client mode): full
 * screen, owner/designer only (`edit`). Per format: Introduzione (the intro's `intro` pages),
 * one group per approved case, newest created first, labelled "{code} · {name}" (without its
 * own intro pages and Carosello Chiusura), then Chiusura (the intro's `outro` pages). Every
 * page saves to its own part's revision: the intro's as in Stories 4.11a and 4.11b, a case's as
 * an approved case's in Story 4.9 (`saveRevisionDoc`, forked on its first save through
 * `forkCaseHead`). A stale part is read again alone (`reloadFilePart`).
 *
 * An intro missing, in Bozza or In elaborazione leaves Introduzione and Chiusura saying so; with
 * no approved case either, the page goes back to the client page. An unknown, malformed or
 * deleted client goes to Clienti. Any other load failure throws into the wizard group's error
 * boundary; a case whose part can't be read is left out.
 *
 * The top bar reads "{Client} · Pagine cliente" with the client's code and the intro's badge;
 * Approva, Aggiorna and Scarta act on the intro alone. The Media tab lists the client's images
 * and videos ("Del cliente", uploads go to the client within its file limit) and its cases'
 * ("Dalle sue case"). The client's fields are edited through the client's own actions.
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

  const [clientMaterial, sectorList, caseMedia] = await Promise.all([
    caseStudy.listClientMaterial({ clientId: client.id }),
    caseStudy.listClientSectors(),
    caseMediaOfClient(client.id),
  ]);
  if (!clientMaterial.ok) throw new Error(`Client material could not be loaded: ${clientMaterial.error.code}`);
  if (!caseMedia.ok) throw new Error(`Case material could not be loaded: ${caseMedia.error.code}`);
  // Without the shared list the page shows the client's own sector key in place of its label.
  const sectors = sectorList.ok ? sectorList.value : [];
  const sector = sectors.find((s) => s.key === client.industry)?.label ?? client.industry ?? "";

  const clientListed = clientMediaFiles(clientMaterial.value);
  const [clientAssets, caseAssets, intro] = await Promise.all([
    clientRenderAssetsOf(clientListed, (assetId, spec) => material.getClientRendition(assetId, spec)),
    caseMediaRenderAssets(caseMedia.value),
    introPartOf(client, sector),
  ]);
  if (!intro.ok) throw new Error(`Client intro could not be loaded: ${intro.error.code}`);
  const cases = await casePartsOf(client, caseAssets);
  if (!cases.ok) throw new Error(`Case studies could not be listed: ${cases.error.code}`);
  // Nothing to show: no intro ready and no approved case.
  if (intro.value === null && cases.value.length === 0) redirect(back);

  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const introPart = intro.value;

  return (
    <Configurator
      key={`file:${client.id}`}
      revision={null}
      subject={{ kind: "client_file", id: client.id, clientId: client.id }}
      onSave={saveIntroRevisionDoc}
      header={{ name: fill(it.configurator.clientTitle, { name: client.name }), code: client.code, ...(introPart === null ? {} : { status: introPart.status }) }}
      back={{ href: back, label: it.configurator.clientBack }}
      template={introPart?.template ?? cases.value[0]!.template}
      formats={NO_PAGES}
      assets={{ ...caseAssets, ...clientAssets }}
      generatedTexts={introPart?.generatedTexts ?? {}}
      // The client's images in upload order: what Pagine di default draws first.
      images={clientListed.filter((file) => file.kind === "image").map((file) => file.id)}
      values={clientBoundValuesOf(client, sector)}
      trial={false}
      theme={theme}
      // A file not drawn yet is pending, so the Media tab keeps asking for its rendition (as after a listing).
      media={clientMediaOf(clientListed, clientAssets).map((file) => ({ ...file, thumbnailPending: !(file.id in clientAssets) }))}
      clientMedia={caseMedia.value}
      mediaRules={MEDIA_RULES}
      onRenderAssets={getClientFileRenderAssets}
      onApprove={approveIntro}
      {...(introPart === null ? {} : { headVersion: introPart.headVersion })}
      onFork={forkIntroHead}
      onUpdateApproved={updateApprovedIntroVersion}
      onDiscard={discardIntroChanges}
      clientFiles={caseMedia.value.map((file) => ({ id: file.id, name: file.originalFileName }))}
      fields={clientEditableFieldsOf(client)}
      fieldOptions={{
        sectors,
        limits: clientLimits(),
        years: { min: caseStudy.YEAR_MIN, max: caseStudy.YEAR_MAX },
        businessLines: caseStudy.BUSINESS_LINES,
      }}
      fieldActions={FIELD_ACTIONS}
      file={{
        clientId: client.id,
        intro: introPart,
        cases: cases.value,
        onSaveIntro: saveIntroRevisionDoc,
        onForkIntro: forkIntroHead,
        onSaveCase: saveRevisionDoc,
        onForkCase: forkCaseHead,
        onReload: reloadFilePart,
      }}
    />
  );
}
