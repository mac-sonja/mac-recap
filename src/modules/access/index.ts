// Public surface of the access module. Code outside this module imports only this file.
import { createSupabaseProfileRepository } from "@/modules/access/adapters/supabase/profile-repository";
import { makeGetActor } from "@/modules/access/application/get-actor";
import type { Actor } from "@/modules/access/domain/actor";
import { can as policyCan, type Action, type Resource } from "@/modules/access/domain/policy";
import type { AppError, Result } from "@/shared/result";

export { authorize } from "@/modules/access/application/authorize";
export type { Actor, Role } from "@/modules/access/domain/actor";
export { landingFor } from "@/modules/access/domain/landing";
export { CASE_STATUSES } from "@/modules/access/domain/policy";
export type { Action, CaseStatus, Resource } from "@/modules/access/domain/policy";

/**
 * Boolean policy check for UI decisions (which nav items and surfaces exist).
 * Same matrix as `authorize`; server actions still call `authorize`.
 */
export function can(actor: Actor, action: Action, resource: Resource = {}): boolean {
  return policyCan(actor.role, action, resource);
}

/**
 * Resolves who is making the current request, reading `profile` on every call.
 * Every server action and route handler calls this, then `authorize`, before
 * any use case (AD-11). `UNAUTHENTICATED` when the profile is missing or disabled.
 */
export function getActor(): Promise<Result<Actor>> {
  return makeGetActor(createSupabaseProfileRepository())();
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  STALE_STATUS: 409,
};

/** HTTP status for an `AppError` code; unknown codes are 500. */
export function httpStatusFor(error: AppError): number {
  return Object.hasOwn(STATUS_BY_CODE, error.code) ? STATUS_BY_CODE[error.code] : 500;
}

/** Route-handler response for an `AppError`: the mapped status with `{ error: { code, message } }`; `details` stays server-side. */
export function respondToAppError(error: AppError): Response {
  const { code, message } = error;
  return Response.json({ error: { code, message } }, { status: httpStatusFor(error) });
}
