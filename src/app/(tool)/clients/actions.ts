"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { Client, ClientBriefFieldSaved, PresignedClientLogoUpload } from "@/modules/case-study";

// Clients are added and edited, never deleted (AD-21): there is no delete action.
// Every action resolves the actor and authorizes `manage clients` before the use case runs.

/**
 * Adds a client with an automatic code: input `{ name, industries, description }`,
 * all required. 403 `FORBIDDEN` unless the role may `manage clients`; 400
 * `INVALID_INPUT` / `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG` naming the
 * fields; 409 `CLIENT_NAME_TAKEN` / `CLIENT_CODE_EXHAUSTED`. Nothing is written on any error.
 */
export async function createClient(input: unknown): Promise<ActionResult<Client>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const created = await caseStudy.createClient(actor.value, input);
  return created.ok ? created : failure(created.error);
}

/**
 * Edits a client: input `{ clientId, name, industries, description, logoId }`, all
 * required; its code never changes. 403 `FORBIDDEN` unless the role may `manage
 * clients`; 400 `INVALID_INPUT` / `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG` /
 * `CLIENT_LOGO_INVALID`; 404
 * `CLIENT_NOT_FOUND`; 409 `CLIENT_NAME_TAKEN`. Nothing is written on any error.
 */
export async function updateClient(input: unknown): Promise<ActionResult<Client>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const updated = await caseStudy.updateClient(actor.value, input);
  return updated.ok ? updated : failure(updated.error);
}

/**
 * Saves one brief text: input `{ clientId, field, text }` (context, solution or
 * results; at most 5000 characters after trimming). 403 `FORBIDDEN` unless the role
 * may `manage clients`; 400 `INVALID_INPUT` / `UNKNOWN_FIELD` /
 * `CLIENT_FIELD_TOO_LONG`; 404 `CLIENT_NOT_FOUND`. Nothing is written on any error.
 */
export async function saveClientBriefField(input: unknown): Promise<ActionResult<ClientBriefFieldSaved>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const saved = await caseStudy.saveClientBriefField(actor.value, input);
  return saved.ok ? saved : failure(saved.error);
}

/**
 * A signed upload for a new logo: input `{ clientId, contentType, sizeBytes }`.
 * 403 `FORBIDDEN` unless the role may `manage clients`; 400 `CLIENT_LOGO_INVALID`
 * (not PNG, JPEG or WebP, or not 1 B–5 MB); 404 `CLIENT_NOT_FOUND`. Nothing is written.
 */
export async function requestClientLogoUpload(input: unknown): Promise<ActionResult<PresignedClientLogoUpload>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const presigned = await caseStudy.requestClientLogoUpload(actor.value, input);
  return presigned.ok ? presigned : failure(presigned.error);
}

/**
 * Records an uploaded logo after the server re-checks it: input `{ clientId, logoId,
 * contentType }`; returns `{ logoId }` for `updateClient`. 403 `FORBIDDEN` unless the
 * role may `manage clients`; 400 `CLIENT_LOGO_INVALID` (no row written); 404 `CLIENT_NOT_FOUND`.
 */
export async function confirmClientLogoUpload(input: unknown): Promise<ActionResult<{ logoId: string }>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const confirmed = await caseStudy.confirmClientLogoUpload(actor.value, input);
  return confirmed.ok ? confirmed : failure(confirmed.error);
}
