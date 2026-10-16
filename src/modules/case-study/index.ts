// Public surface of the case-study module. Code outside this module imports only this file.
// The module owns `case_study`, `client`, `client_logo`, `case_number_counter` and
// `case_event`, and the `material` bucket's `clients/{clientId}/logos/**` (AD-1, AD-22):
// nobody else writes them.
import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import { createSupabaseCaseStudyRepository } from "@/modules/case-study/adapters/supabase/case-study-repository";
import { createSupabaseClientRepository } from "@/modules/case-study/adapters/supabase/client-repository";
import { createSupabaseLogoStorage } from "@/modules/case-study/adapters/supabase/logo-storage";
import { makeConfirmClientLogoUpload } from "@/modules/case-study/application/confirm-client-logo-upload";
import { makeCreateCaseStudy } from "@/modules/case-study/application/create-case-study";
import { makeCreateClient } from "@/modules/case-study/application/create-client";
import { makeGetCaseStudy } from "@/modules/case-study/application/get-case-study";
import { makeGetClient } from "@/modules/case-study/application/get-client";
import { makeGetClientSnapshot } from "@/modules/case-study/application/get-client-snapshot";
import { makeListCaseStudies } from "@/modules/case-study/application/list-case-studies";
import { makeListClientSummaries } from "@/modules/case-study/application/list-client-summaries";
import { makeListClients } from "@/modules/case-study/application/list-clients";
import { makeRecordEvent } from "@/modules/case-study/application/record-event";
import type { LogoDeps } from "@/modules/case-study/application/logo-deps";
import {
  makeRequestClientLogoUpload,
  type PresignedClientLogoUpload,
} from "@/modules/case-study/application/request-client-logo-upload";
import { makeTransition } from "@/modules/case-study/application/transition";
import { makeUpdateClient } from "@/modules/case-study/application/update-client";
import type { CaseEvent } from "@/modules/case-study/domain/case-event";
import type {
  CaseStudy,
  Client,
  ClientDetail,
  ClientRef,
  ClientSnapshot,
  ClientSummary,
  ListScope,
} from "@/modules/case-study/domain/case-study";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import type { Result } from "@/shared/result";

export { CASE_CREATED, TRANSITION } from "@/modules/case-study/domain/case-event";
export type { CaseEvent, RecordEventInput } from "@/modules/case-study/domain/case-event";
export {
  CLIENT_DESCRIPTION_MAX,
  CLIENT_NAME_MAX,
  CLIENT_SECTOR_MAX,
  LOCALES,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  LOGO_MIN_SHORT_SIDE_PX,
  YEAR_MAX,
  YEAR_MIN,
} from "@/modules/case-study/domain/case-study";
export type {
  CaseStudy,
  Client,
  ClientDetail,
  ClientRef,
  ClientSnapshot,
  ClientSummary,
  CreateCaseStudyInput,
  CreateClientInput,
  ListScope,
  Locale,
  LogoContentType,
  UpdateClientInput,
} from "@/modules/case-study/domain/case-study";
export type { PresignedClientLogoUpload } from "@/modules/case-study/application/request-client-logo-upload";
export { TRANSITION_EVENTS } from "@/modules/case-study/domain/transition";
export type { TransitionEvent } from "@/modules/case-study/domain/transition";
export type { FieldIssue } from "@/modules/case-study/domain/validation";

/**
 * Creates a case study (status `draft`, permanent DB-generated id, and the next
 * readable code for its client and year, e.g. `LUM-2026-01`) and its
 * `case_created` event in one transaction. Input `{ name, clientId, year, locale? }`.
 * Call only after `authorize(actor, 'create case')`. `INVALID_INPUT` names each
 * failing field in `details.fields`; `CLIENT_NOT_FOUND` for an unknown client.
 * Nothing is written on any error.
 */
export function create(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
  return makeCreateCaseStudy(createSupabaseCaseStudyRepository())(actor, input);
}

/** One case study by id; unknown, malformed or soft-deleted ids are `NOT_FOUND`. */
export function get(id: unknown): Promise<Result<CaseStudy>> {
  return makeGetCaseStudy(createSupabaseCaseStudyRepository())(id);
}

/**
 * The non-deleted case studies within exactly `scope`, newest `updated_at` first:
 * `{}` lists every status, `{ status: "approved" }` approved only; `clientId`
 * limits it to that client's cases. Derive the status scope
 * from the `list cases` policy and authorize it first, so no scope the policy
 * denies is ever queried. A malformed scope is `INVALID_INPUT`.
 */
export function list(scope: ListScope): Promise<Result<CaseStudy[]>> {
  return makeListCaseStudies(createSupabaseCaseStudyRepository())(scope);
}

/**
 * Every client (`{ id, name, code }`), sorted by name. Call only after
 * `authorize(actor, 'list clients')`.
 */
export function listClients(): Promise<Result<ClientRef[]>> {
  return makeListClients(createSupabaseClientRepository())();
}

/**
 * Every client with its count of non-deleted case studies (`{ id, name, code,
 * caseCount }`), sorted by name. Call only after `authorize(actor, 'list clients')`.
 */
export function listClientSummaries(): Promise<Result<ClientSummary[]>> {
  return makeListClientSummaries(createSupabaseClientRepository())();
}

/** One logo storage adapter, built on first use and reused across requests. */
let logoStorageMemo: LogoStorage | undefined;

function logoStorage(): LogoStorage {
  logoStorageMemo ??= createSupabaseLogoStorage();
  return logoStorageMemo;
}

function logoDeps(): LogoDeps {
  return { clients: createSupabaseClientRepository(), storage: logoStorage(), newId: randomUUID };
}

/**
 * One client by id with its info and `logoUrl` (a signed GET valid at most 15
 * minutes, or null when it has no logo or the link could not be made). Unknown or
 * malformed ids are `CLIENT_NOT_FOUND`. Call only after `authorize(actor, 'list clients')`.
 */
export function getClient(id: unknown): Promise<Result<ClientDetail>> {
  return makeGetClient(createSupabaseClientRepository(), logoStorage())(id);
}

/**
 * Adds a client: input `{ name, sector?, description? }` (name 1–120, sector ≤60,
 * description ≤400 characters after trimming; blank → null); the code is assigned
 * automatically (AD-21). The logo is linked afterwards with `updateClient`. Call only
 * after `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `CLIENT_FIELD_TOO_LONG`,
 * `CLIENT_NAME_TAKEN`, `CLIENT_CODE_EXHAUSTED`; nothing is written on any error.
 */
export function createClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeCreateClient(createSupabaseClientRepository())(actor, input);
}

/**
 * Edits a client: input `{ clientId, name, sector, description, logoId }` (sector, description and logoId required, each may be null), every
 * field as it should be after the save (`logoId` null clears the logo). The client
 * code and every case history code stay the same; old logos stay stored. Call only
 * after `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `CLIENT_FIELD_TOO_LONG`,
 * `CLIENT_NOT_FOUND`, `CLIENT_NAME_TAKEN`, `CLIENT_LOGO_INVALID` (unknown logo, or
 * another client's); nothing is written on any error. Clients are never deleted.
 */
export function updateClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeUpdateClient(createSupabaseClientRepository())(actor, input);
}

/**
 * A signed upload for a new logo: input `{ clientId, contentType, sizeBytes }`;
 * returns `{ logoId, url, method: "PUT", headers }`. PNG, JPEG or WebP, 1 B–5 MB,
 * else `CLIENT_LOGO_INVALID`. Call only after `authorize(actor, 'manage clients')`.
 * Errors: `INVALID_INPUT`, `CLIENT_LOGO_INVALID`, `CLIENT_NOT_FOUND`, `STORAGE_FAILED`.
 */
export function requestClientLogoUpload(actor: Actor, input: unknown): Promise<Result<PresignedClientLogoUpload>> {
  return makeRequestClientLogoUpload(logoDeps())(actor, input);
}

/**
 * Records an uploaded logo after re-checking the stored object (size, type and real
 * pixels, short side ≥400 px): input `{ clientId, logoId, contentType }`; returns
 * `{ logoId }`, which `updateClient` then links. Call only after
 * `authorize(actor, 'manage clients')`. Errors: `INVALID_INPUT`, `CLIENT_LOGO_INVALID`
 * (no row written), `CLIENT_NOT_FOUND`, `STORAGE_FAILED`, `CLIENT_WRITE_FAILED`.
 */
export function confirmClientLogoUpload(actor: Actor, input: unknown): Promise<Result<{ logoId: string }>> {
  return makeConfirmClientLogoUpload(logoDeps())(actor, input);
}

/**
 * The client info of a case with the client's current values (AD-22):
 * `{ clientId, name, sector, description, logoId }`, for `generation` to copy into a
 * job and its revision. Unknown, malformed or soft-deleted case ids are `NOT_FOUND`.
 */
export function getClientSnapshot(caseId: unknown): Promise<Result<ClientSnapshot>> {
  return makeGetClientSnapshot(createSupabaseClientRepository())(caseId);
}

/**
 * Appends one `case_event` row (`{ caseId, type, revisionId?, data? }`) with the actor.
 * Every mutation logs through here; an unknown case is `NOT_FOUND`.
 */
export function recordEvent(actor: Actor, input: unknown): Promise<Result<CaseEvent>> {
  return makeRecordEvent(createSupabaseCaseStudyRepository())(actor, input);
}

/**
 * The only way a case's status changes (AD-3): applies `event` (one of
 * `TRANSITION_EVENTS`) per the domain transition table and appends a `transition`
 * event `{ event, from, to }` with the actor, in one transaction. Call only with an
 * already-authorized actor (AR11). Errors: `NOT_FOUND`, `INVALID_TRANSITION`,
 * `STALE_STATUS` (status moved since read); nothing is written on any of them.
 */
export function transition(caseId: unknown, event: unknown, actor: Actor): Promise<Result<CaseStudy>> {
  return makeTransition(createSupabaseCaseStudyRepository())(caseId, event, actor);
}
