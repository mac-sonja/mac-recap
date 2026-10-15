"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { Client } from "@/modules/case-study";

// Clients are added and renamed, never deleted (AD-21): there is no delete action.

/**
 * Adds a client with an automatic code: input `{ name }`. 403 `FORBIDDEN` unless the
 * role may `manage clients`; 400 `INVALID_INPUT` naming `name`; 409 `CLIENT_NAME_TAKEN`
 * / `CLIENT_CODE_EXHAUSTED`. Nothing is written on any error.
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
 * Renames a client: input `{ clientId, name }`; its code never changes. 403
 * `FORBIDDEN` unless the role may `manage clients`; 400 `INVALID_INPUT`; 404
 * `CLIENT_NOT_FOUND`; 409 `CLIENT_NAME_TAKEN`. Nothing is written on any error.
 */
export async function renameClient(input: unknown): Promise<ActionResult<Client>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "manage clients");
  if (!decision.ok) return failure(decision.error);
  const renamed = await caseStudy.renameClient(actor.value, input);
  return renamed.ok ? renamed : failure(renamed.error);
}
