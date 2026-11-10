"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import * as material from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { clientMediaFiles, clientRenderAssetsOf } from "../../../_lib/configurator-data";
import { caseMediaOfClient, caseMediaRenderAssets } from "./case-media";

// Story 4.11a: a client's intro and outro in the configurator (client mode). Every action
// resolves the actor and authorizes it before the use case runs; the intro is named by its own
// id (`clientIntroId`). Story 4.11b: an approved intro is edited on a working copy (fork,
// update the approved version, discard), as an approved case is (Story 4.9).

/** The intro named by `input.clientIntroId`, read to pick between approving and updating. */
const introOf = (input: unknown) =>
  caseStudy.getClientIntroById(typeof input === "object" && input !== null ? (input as { clientIntroId?: unknown }).clientIntroId : undefined);

/** The most render assets one call reads. */
const MAX_RENDER_ASSETS = 50;

/**
 * The client-mode autosave: input `{ clientIntroId, revisionId, doc, expectedVersion }`, the
 * whole edited document of the intro's head revision and the `version` it was based on;
 * returns the new `version`. Writes one `client_event` (never a case event). 403 `FORBIDDEN`
 * unless the role may `edit`; 400 `INVALID_INPUT`, `DOCUMENT_INVALID`,
 * `DOCUMENT_SCHEMA_UNSUPPORTED`, `FORMAT_NOT_IN_REVISION`, `ASSET_NOT_ALLOWED` (a new file that
 * is neither the client's nor one of its cases'); 404 `NOT_FOUND`; 409 `STALE_REVISION`,
 * `STALE_HEAD`, `REVISION_NOT_WRITABLE`, `CASE_NOT_EDITABLE` (the intro is no longer Da
 * approvare, or approved with no working copy). Nothing is written on any error.
 */
export async function saveIntroRevisionDoc(input: unknown): Promise<ActionResult<{ version: number }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveIntroRevisionDoc(actor.value, input, material.liveAssetIds);
  return saved.ok ? { ok: true, value: { version: saved.value.version } } : failure(saved.error);
}

/**
 * **Approva** in client mode (Story 4.8's rules): input `{ clientIntroId, revisionId,
 * expectedRevisionVersion, expectedHeadVersion, overflow }`. The intro and its revision become
 * Approvato. Returns `{ waiting: false }` (the configurator goes back to the client page). 403
 * `FORBIDDEN` unless the role may `approve`; 400 `INVALID_INPUT`, `OVERFLOW_NOT_CLEARED`,
 * `MATERIAL_MISSING` (with `assetIds`); 404 `NOT_FOUND` (also a missing or malformed
 * `clientIntroId`, from the status read before the use case); 409 `STALE_REVISION`, `STALE_HEAD`,
 * `CASE_NOT_APPROVABLE` (also an approved intro: its copy goes through
 * `updateApprovedIntroVersion`), `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function approveIntro(input: unknown): Promise<ActionResult<{ waiting: boolean }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "approve");
  if (!decision.ok) return failure(decision.error);
  // An approved intro's copy is updated through updateApprovedIntroVersion (Story 4.11b), never approved again here.
  const found = await introOf(input);
  if (!found.ok) return failure(found.error);
  if (found.value.status === "approved") {
    return failure({ code: "CASE_NOT_APPROVABLE", message: "Only a client intro in review can be approved.", details: { status: "approved" } });
  }
  const approved = await caseStudy.approveIntro(actor.value, input, material.liveAssetIds);
  return approved.ok ? { ok: true, value: { waiting: false } } : failure(approved.error);
}

/**
 * The first edit of an approved intro (Story 4.11b): input `{ clientIntroId,
 * expectedHeadVersion }`. Forks the approved revision into the working copy every later save
 * goes to, or returns the copy that already exists (idempotent); live reads keep the approved
 * revision. Returns `{ revisionId, version, headVersion }`. 403 `FORBIDDEN` unless the role may
 * `edit`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `STALE_HEAD`, `CASE_NOT_EDITABLE` (not
 * approved), `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function forkIntroHead(input: unknown): Promise<ActionResult<caseStudy.ForkedHead>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const forked = await caseStudy.forkIntroHead(actor.value, input);
  return forked.ok ? { ok: true, value: forked.value } : failure(forked.error);
}

/**
 * **Aggiorna la versione approvata** for an intro (Story 4.11b): input as `approveIntro`,
 * `revisionId` the approved intro's working copy. Runs Story 4.8's checks on the copy (the
 * allowed files: the client's and its cases' live ones), which then becomes the approved
 * revision (the previous one `superseded`); the intro stays approved. 403 `FORBIDDEN` unless the
 * role may `update approved version`; 400 `INVALID_INPUT`, `OVERFLOW_NOT_CLEARED`,
 * `MATERIAL_MISSING` (with `assetIds`); 404 `NOT_FOUND` (also a missing or malformed
 * `clientIntroId`, from the status read before the use case); 409 `STALE_REVISION`, `STALE_HEAD`,
 * `CASE_NOT_APPROVABLE` (not approved), `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function updateApprovedIntroVersion(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "update approved version");
  if (!decision.ok) return failure(decision.error);
  // Only an approved intro's copy: Da approvare is approved through approveIntro, with its own redirect.
  const found = await introOf(input);
  if (!found.ok) return failure(found.error);
  if (found.value.status !== "approved") {
    return failure({ code: "CASE_NOT_APPROVABLE", message: "Only an approved client intro's approved version can be updated.", details: { status: found.value.status } });
  }
  const updated = await caseStudy.approveIntro(actor.value, input, material.liveAssetIds);
  return updated.ok ? { ok: true, value: undefined } : failure(updated.error);
}

/**
 * **Scarta le modifiche** for an intro (Story 4.11b): input `{ clientIntroId, revisionId,
 * expectedHeadVersion }`, `revisionId` the approved intro's working copy. The copy is superseded
 * and the head goes back to the approved revision. 403 `FORBIDDEN` unless the role may
 * `discard`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`; 409 `STALE_HEAD`, `CASE_NOT_EDITABLE`,
 * `REVISION_NOT_WRITABLE`. Nothing is written on any error.
 */
export async function discardIntroChanges(input: unknown): Promise<ActionResult<void>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "discard");
  if (!decision.ok) return failure(decision.error);
  const discarded = await caseStudy.discardIntroHead(actor.value, input);
  return discarded.ok ? { ok: true, value: undefined } : failure(discarded.error);
}

/**
 * The render assets of files the Media tab listed after the page loaded, in client mode: input
 * `{ clientIntroId, assetIds }`; returns, by asset id, those that are live images and videos of
 * the intro's client (from the client renditions) or of the client's cases (from the case
 * renditions) with a rendition ready. Any other id is left out, so the caller asks again
 * later. 403 `FORBIDDEN` unless the role may `edit`; 400 `INVALID_INPUT`; 404 `NOT_FOUND`.
 */
export async function getIntroRenderAssets(input: unknown): Promise<ActionResult<Record<string, RenderAsset>>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "edit");
  if (!decision.ok) return failure(decision.error);
  const { clientIntroId, assetIds } = (input ?? {}) as { clientIntroId?: unknown; assetIds?: unknown };
  if (!Array.isArray(assetIds) || assetIds.length > MAX_RENDER_ASSETS || !assetIds.every((id) => typeof id === "string")) {
    return failure({ code: "INVALID_INPUT", message: "assetIds must be a list of ids.", details: { fields: ["assetIds"] } });
  }
  const intro = await caseStudy.getClientIntroById(clientIntroId);
  if (!intro.ok) return failure(intro.error);
  const wanted = new Set(assetIds.map((id) => id.toLowerCase()));

  const ofClient = await caseStudy.listClientMaterial({ clientId: intro.value.clientId });
  const clientFiles = ofClient.ok ? clientMediaFiles(ofClient.value).filter((file) => wanted.has(file.id.toLowerCase())) : [];
  const fromClient = await clientRenderAssetsOf(clientFiles, (assetId, spec) => material.getClientRendition(assetId, spec));
  for (const file of clientFiles) wanted.delete(file.id.toLowerCase());

  // What's left may be one of the client's cases' files.
  let fromCases: Record<string, RenderAsset> = {};
  if (wanted.size > 0) {
    const media = await caseMediaOfClient(intro.value.clientId);
    if (media.ok) fromCases = await caseMediaRenderAssets(media.value.filter((file) => wanted.has(file.id.toLowerCase())));
  }
  return { ok: true, value: { ...fromClient, ...fromCases } };
}
