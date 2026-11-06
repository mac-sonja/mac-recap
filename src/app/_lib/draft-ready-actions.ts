"use server";

import { failure, type ActionResult } from "@/app/_lib/action-result";
import { authorize, getActor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { ReadyDraft } from "@/modules/case-study";

/**
 * The draft-ready poll (Story 3.8): input `{ since }`, the start of the person's page
 * session (ISO, with an offset). Returns `{ kind, id, name, readyAt }` for each of their cases
 * whose generation they started and that reached Da approvare after `since`, and (Story
 * 3.11, `kind: "client_intro"`, the client's id and name) each client intro their save started. 401 without
 * an actor; 403 `FORBIDDEN` unless the role may `generate`; 400 `INVALID_INPUT`. Reads only.
 */
export async function listReadyDrafts(input: unknown): Promise<ActionResult<ReadyDraft[]>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "generate");
  if (!decision.ok) return failure(decision.error);
  const drafts = await caseStudy.listReadyDrafts(actor.value, input);
  return drafts.ok ? { ok: true, value: drafts.value } : failure(drafts.error);
}
