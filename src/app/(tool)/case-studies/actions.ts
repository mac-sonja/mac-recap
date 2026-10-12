"use server";

import { authorize, getActor, httpStatusFor } from "@/modules/access";
import * as caseStudy from "@/modules/case-study";
import type { CaseStudy } from "@/modules/case-study";
import type { AppError } from "@/shared/result";

/**
 * What a server action returns to the client: the value, or the HTTP-style
 * status with `{ error: { code, message } }`. `details` stays server-side;
 * only an `INVALID_INPUT` adds the names of the failing fields.
 */
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: { code: string; message: string; fields?: string[] } };

function failure(error: AppError): ActionResult<never> {
  const { code, message } = error;
  const fields =
    code === "INVALID_INPUT" && error.details && typeof error.details === "object" && "fields" in error.details
      ? (error.details as { fields: string[] }).fields
      : undefined;
  return { ok: false, status: httpStatusFor(error), error: fields ? { code, message, fields } : { code, message } };
}

/**
 * Creates a case study (status `draft`, permanent id) with its `case_created`
 * event. Input: `{ name, client, year, locale? }`. 403 `FORBIDDEN` when the
 * actor's role may not `create case`; 400 `INVALID_INPUT` names each field.
 */
export async function createCaseStudy(input: unknown): Promise<ActionResult<CaseStudy>> {
  const actor = await getActor();
  if (!actor.ok) return failure(actor.error);
  const decision = authorize(actor.value, "create case");
  if (!decision.ok) return failure(decision.error);
  const created = await caseStudy.create(actor.value, input);
  return created.ok ? created : failure(created.error);
}
