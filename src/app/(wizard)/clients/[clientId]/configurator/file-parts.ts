import { configuratorHref } from "@/app/_lib/routes";
import * as caseStudy from "@/modules/case-study";
import type { ClientDetail } from "@/modules/case-study";
import * as material from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import { boundValuesOf, clientBoundValuesOf, clientMediaFiles, clientRenderAssetsOf, imagePoolOf, pagesOfDocument } from "../../../_lib/configurator-data";
import type { FilePartData } from "../../../_components/configurator/client-file";
import { generatedTextsOf } from "../../../_components/configurator/default-pages";
import { isMedia } from "../../../_components/configurator/media-files";
import { caseMediaRenderAssets } from "./case-media";

// Story 4.12a, server only: the parts of a client's file (its intro, its approved cases), for
// the client configurator's page and its part-reload action. The caller has authorized the actor.

/** A part's key in the file: the intro's, or a case's. */
export const introPartKey = (introId: string) => `client_intro:${introId}`;
export const casePartKey = (caseId: string) => `case:${caseId}`;

/**
 * The client's intro as a part of its file (Stories 4.11a, 4.11b): an intro Da approvare edited
 * on its working revision, an Approvato one on its approved revision (forked on the first save)
 * or on its pending copy. Null while it isn't ready: no intro, one in Bozza or In elaborazione,
 * or no head revision. `sector` is the client's sector label. `assets` are the client's files'
 * render assets when already read; else they are read here (a reload draws files added since).
 */
export async function introPartOf(client: ClientDetail, sector: string, assets?: Readonly<Record<string, RenderAsset>>): Promise<Result<FilePartData | null>> {
  const found = await caseStudy.getClientIntro(client.id);
  if (!found.ok) return found;
  const intro = found.value;
  if (intro === null || (intro.status !== "in_review" && intro.status !== "approved")) return ok(null);
  const revision = await caseStudy.getEditableRevision({ kind: "client_intro", id: intro.id });
  if (!revision.ok) return revision;
  const head = revision.value;
  if (head === null) return ok(null);
  const listed = await caseStudy.listClientMaterial({ clientId: client.id });
  const media = listed.ok ? clientMediaFiles(listed.value) : [];
  const images = media.filter((file) => file.kind === "image").map((file) => file.id);
  const drawn = assets ?? (await clientRenderAssetsOf(media, (assetId, spec) => material.getClientRendition(assetId, spec)));
  const fork = intro.status === "approved" && head.status === "approved" && head.id === intro.approvedRevisionId;
  const pendingCopy = intro.status === "approved" && intro.approvedRevisionId !== null && head.status === "working" && head.id !== intro.approvedRevisionId;
  const editable = (intro.status === "in_review" && head.status === "working") || fork || pendingCopy;
  return ok({
    key: introPartKey(intro.id),
    subject: { kind: "client_intro", id: intro.id, clientId: client.id },
    status: intro.status,
    name: client.name,
    code: client.code,
    template: head.doc.template,
    formats: pagesOfDocument(head.doc.formats),
    generatedTexts: generatedTextsOf(head.generatedDoc),
    images,
    values: clientBoundValuesOf(client, sector),
    revision: { id: head.id, version: head.version, editable, kind: head.doc.kind, fork },
    headVersion: intro.headVersion,
    assets: drawn,
  });
}

/**
 * Approved case `caseId` of client `client` as a part of its file (Story 4.9's rules): edited on
 * its approved revision (forked on the first save) or on its pending copy. Null when it is no
 * longer an approved case of this client (deleted, another client's) or has no head revision.
 * `assets` are its files' render assets when already read; else they are read here.
 */
export async function casePartOf(client: ClientDetail, caseId: string, assets?: Readonly<Record<string, RenderAsset>>): Promise<Result<FilePartData | null>> {
  const found = await caseStudy.get(caseId);
  if (!found.ok) return found.error.code === "NOT_FOUND" ? ok(null) : found;
  const current = found.value;
  if (current.status !== "approved" || current.client.id !== client.id || current.deletedAt !== null) return ok(null);
  const [revision, info, form, listed] = await Promise.all([
    caseStudy.getEditableRevision({ kind: "case", id: current.id }),
    caseStudy.getClientInfoForCase(current.id),
    material.getDetailsForm({ caseId: current.id }),
    material.listAssets({ caseId: current.id }),
  ]);
  if (!revision.ok) return revision;
  if (!info.ok) return info;
  if (!form.ok) return form;
  if (!listed.ok) return listed;
  const head = revision.value;
  if (head === null) return ok(null);
  const fork = head.status === "approved" && head.id === current.approvedRevisionId;
  const pendingCopy = current.approvedRevisionId !== null && head.status === "working" && head.id !== current.approvedRevisionId;
  const own = listed.value.map((file) => file.id);
  const ownSet = new Set(own.map((id) => id.toLowerCase()));
  const drawn =
    assets === undefined
      ? await caseMediaRenderAssets(listed.value.filter(isMedia))
      : Object.fromEntries(Object.entries(assets).filter(([id]) => ownSet.has(id.toLowerCase())));
  return ok({
    key: casePartKey(current.id),
    subject: { kind: "case", id: current.id },
    status: current.status,
    name: current.name,
    code: current.code,
    template: head.doc.template,
    formats: pagesOfDocument(head.doc.formats),
    generatedTexts: generatedTextsOf(head.generatedDoc),
    images: imagePoolOf(listed.value, [head.doc, head.generatedDoc]),
    values: boundValuesOf(current, info.value, client.logoUrl, form.value),
    revision: { id: head.id, version: head.version, editable: fork || pendingCopy, kind: head.doc.kind, fork },
    headVersion: current.headVersion,
    assets: drawn,
    ownAssetIds: own,
    href: configuratorHref(current.id),
  });
}

/**
 * The approved cases of client `client` as parts of its file, newest created first (until the
 * client orders them, Story 4.12b). A case whose part can't be read is left out (logged with its
 * id; a read that throws too) and never drops the others; only a failed list of the cases is an error.
 */
export async function casePartsOf(client: ClientDetail, assets: Readonly<Record<string, RenderAsset>>): Promise<Result<FilePartData[]>> {
  const cases = await caseStudy.list({ clientId: client.id, status: "approved" });
  if (!cases.ok) return cases;
  const newestFirst = [...cases.value].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const parts = await Promise.allSettled(newestFirst.map((c) => casePartOf(client, c.id, assets)));
  const out: FilePartData[] = [];
  parts.forEach((settled, i) => {
    const caseId = newestFirst[i]!.id;
    if (settled.status === "rejected") log.warn("case part not read: threw", { caseId, clientId: client.id });
    else if (!settled.value.ok) log.warn(`case part not read: ${settled.value.error.code}`, { caseId, clientId: client.id });
    else if (settled.value.value !== null) out.push(settled.value.value);
  });
  return ok(out);
}
