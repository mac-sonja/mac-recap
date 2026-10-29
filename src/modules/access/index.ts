// Public surface of the access module. Code outside this module imports only this file.
import { createSupabaseAuthAdmin } from "@/modules/access/adapters/supabase/auth-admin";
import { createSupabaseAuthGateway } from "@/modules/access/adapters/supabase/auth-gateway";
import { createSupabaseProfileRepository } from "@/modules/access/adapters/supabase/profile-repository";
import { makeGetActor } from "@/modules/access/application/get-actor";
import { makeGetSystemActor } from "@/modules/access/application/get-system-actor";
import type { EmailLink } from "@/modules/access/application/ports";
import { makeSession, type SessionState } from "@/modules/access/application/session";
import { makeUsers, type AddedUser } from "@/modules/access/application/users";
import type { ListedUser } from "@/modules/access/domain/users";
import type { Actor, Profile } from "@/modules/access/domain/actor";
import { can as policyCan, type Action, type Resource } from "@/modules/access/domain/policy";
import type { AppError, Result } from "@/shared/result";

export { authorize } from "@/modules/access/application/authorize";
export type { Actor, Profile, Role } from "@/modules/access/domain/actor";
export { landingFor } from "@/modules/access/domain/landing";
export { MIN_PASSWORD_LENGTH, SIGN_UP_DOMAIN, TEAMS, type Team } from "@/modules/access/domain/sign-up";
export { hasSessionCookie, refreshSession } from "@/modules/access/adapters/supabase/proxy-session";
export type { EmailLink, EmailLinkType } from "@/modules/access/application/ports";
export type { SessionState } from "@/modules/access/application/session";
export type { AddedUser } from "@/modules/access/application/users";
export { ASSIGNABLE_ROLES, type AssignableRole, type ListedUser } from "@/modules/access/domain/users";
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
 * Resolves who is making the current request: the Supabase Auth session matched
 * to a `profile`, read on every call (Story 6.1). Every server action and route
 * handler calls this, then `authorize`, before any use case (AD-11).
 * `UNAUTHENTICATED` with no session, or when the profile is missing or disabled.
 */
export function getActor(): Promise<Result<Actor>> {
  return makeGetActor(createSupabaseAuthGateway(), createSupabaseProfileRepository())();
}

// Session entry points (Story 6.1). They run before there is an actor, so they
// are the only exports a server action may call without `authorize`
// (test/helpers/authorize-guard.ts lists them).
const session = () => makeSession({ auth: createSupabaseAuthGateway(), profiles: createSupabaseProfileRepository() });

/** Whether the request has a session, and whether its person may use the tool. */
export function sessionState(): Promise<SessionState> {
  return session().sessionState();
}

/** Signs in with email and password; returns the role's landing. `ACCOUNT_INACTIVE` ends the session. */
export function signIn(email: string, password: string): Promise<Result<string>> {
  return session().signIn(email, password);
}

/** Self-sign-up on the company domain; sends the confirmation email back to `origin`. */
export function signUp(input: unknown, origin: string): Promise<Result<void>> {
  return session().signUp(input, origin);
}

/** Turns an email link into a session; returns the path to go to next. */
export function confirmEmailLink(link: EmailLink): Promise<Result<string>> {
  return session().confirmEmailLink(link);
}

/** Sends a password-reset email when the address has an account; never says which. */
export function requestPasswordReset(email: string, origin: string): Promise<Result<void>> {
  return session().requestPasswordReset(email, origin);
}

/** Sets the signed-in person's password; returns their landing. */
export function setPassword(password: string): Promise<Result<string>> {
  return session().setPassword(password);
}

/** Ends the session. */
export function signOut(): Promise<void> {
  return session().signOut();
}

/**
 * The worker's built-in `system` actor (the seeded profile, AD-11), read fresh
 * on every call. Only the worker calls this; it still authorizes `job work`
 * before each job. `UNAUTHENTICATED` when the profile is missing, disabled or
 * not `system`. Nothing outside this module knows the system profile's id.
 */
export function getSystemActor(): Promise<Result<Actor>> {
  return makeGetSystemActor(createSupabaseProfileRepository())();
}

// Users (Story 6.3). Callers authorize `manage users` first; these change only
// `profile.role`, `profile.job_title` and `profile.disabled_at`.
const users = () => makeUsers({ profiles: createSupabaseProfileRepository(), authAdmin: createSupabaseAuthAdmin() });

/** Enabled, non-system users, oldest first. */
export function listUsers(): Promise<Result<ListedUser[]>> {
  return users().list();
}

/** **Aggiungi utente**: `{ firstName, lastName, email, role, jobTitle? }`; sends the invite whose link returns to `origin`. */
export function addUser(actor: Actor, input: unknown, origin: string): Promise<Result<AddedUser>> {
  return users().add(actor, input, origin);
}

/** Changes a role, or approves a designer: `{ profileId, role }`. `LAST_ADMIN` keeps one admin. */
export function changeUserRole(actor: Actor, input: unknown): Promise<Result<Profile>> {
  return users().changeRole(actor, input);
}

/** **Ruolo**: `{ profileId, jobTitle }`; free text, empty clears it. */
export function changeUserJobTitle(actor: Actor, input: unknown): Promise<Result<Profile>> {
  return users().changeJobTitle(actor, input);
}

/** **Rimuovi**: `{ profileId }`; sets `disabled_at`. `LAST_ADMIN` keeps one admin. */
export function removeUser(actor: Actor, input: unknown): Promise<Result<void>> {
  return users().remove(actor, input);
}

const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  STALE_STATUS: 409,
  // Generate (Story 3.7): nothing to generate from.
  NO_MATERIAL: 409,
  // Delete (Story 4.1): only a draft may be deleted.
  CASE_NOT_DELETABLE: 409,
  // Configurator saves (Story 4.3a): a compare-and-set lost, or the revision or case is no longer editable.
  STALE_HEAD: 409,
  STALE_REVISION: 409,
  REVISION_NOT_WRITABLE: 409,
  CASE_NOT_EDITABLE: 409,
  ASSET_NOT_ALLOWED: 400,
  // Clients and case history codes (Story 2.12, AD-21).
  CLIENT_NOT_FOUND: 404,
  CLIENT_NAME_TAKEN: 409,
  CLIENT_CODE_EXHAUSTED: 409,
  // Client info (Story 2.14, AD-22).
  CLIENT_FIELD_TOO_LONG: 400,
  CLIENT_LOGO_INVALID: 400,
  // Client wizard (Story 2.15): a required field missing, or an unknown sector.
  CLIENT_FIELD_INVALID: 400,
  // Client Settore (owner, 2026-10-22): a new sector's name outside 2–40 characters.
  SECTOR_LABEL_INVALID: 400,
  // Client material (Story 2.16): a 4th file.
  CLIENT_MATERIAL_LIMIT: 409,
  // Client delete (owner, 2026-10-19): the typed name does not match the client's.
  CLIENT_DELETE_NAME_MISMATCH: 400,
  // An image under 1600 px on the short side or over 8000 px on a side.
  CLIENT_IMAGE_SIZE_INVALID: 400,
  // Material uploads (Story 2.7).
  FILE_TYPE_NOT_ALLOWED: 400,
  FILE_TOO_LARGE: 400,
  FILE_LIMIT_REACHED: 409,
  UPLOAD_NOT_FOUND: 404,
  UPLOAD_REJECTED: 400,
  ASSET_ALREADY_CONFIRMED: 409,
  STORAGE_NOT_CONFIGURED: 503,
  // Details form (Story 2.10).
  UNKNOWN_FIELD: 400,
  UNKNOWN_REF: 400,
  // Favourites (Story 2.9).
  NOT_FAVOURITABLE: 400,
  // Sign-in and sign-up (Story 6.1).
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_CONFIRMED: 403,
  ACCOUNT_INACTIVE: 403,
  EMAIL_DOMAIN_NOT_ALLOWED: 400,
  LINK_INVALID: 400,
  RATE_LIMITED: 429,
  // Users (Story 6.3).
  USER_EXISTS: 409,
  LAST_ADMIN: 409,
  INVITE_FAILED: 502,
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
