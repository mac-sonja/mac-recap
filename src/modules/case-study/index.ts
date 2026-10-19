// Public surface of the case-study module. Code outside this module imports only this file.
// The module owns `case_study`, `client`, `client_logo`, `client_brief`, `client_asset`,
// `case_number_counter` and `case_event`, and the `material` bucket's
// `clients/{clientId}/logos/**` and `clients/{clientId}/material/**` (AD-1, AD-22):
// nobody else writes them.
import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import { createSupabaseCaseStudyRepository } from "@/modules/case-study/adapters/supabase/case-study-repository";
import { createSupabaseClientRepository } from "@/modules/case-study/adapters/supabase/client-repository";
import { createSupabaseClientMaterialStorage } from "@/modules/case-study/adapters/supabase/client-material-storage";
import { createSupabaseLogoStorage } from "@/modules/case-study/adapters/supabase/logo-storage";
import type { ClientMaterialDeps } from "@/modules/case-study/application/client-material-deps";
import { makeConfirmClientMaterialUpload } from "@/modules/case-study/application/confirm-client-material-upload";
import { makeListClientMaterial } from "@/modules/case-study/application/list-client-material";
import { makeRemoveClientMaterial } from "@/modules/case-study/application/remove-client-material";
import {
  makeRequestClientMaterialUpload,
  type PresignedClientMaterial,
} from "@/modules/case-study/application/request-client-material-upload";
import { makeConfirmClientLogoUpload } from "@/modules/case-study/application/confirm-client-logo-upload";
import { makeCreateCaseStudy } from "@/modules/case-study/application/create-case-study";
import { makeCreateClient } from "@/modules/case-study/application/create-client";
import { makeGetCaseStudy } from "@/modules/case-study/application/get-case-study";
import { makeGetClient } from "@/modules/case-study/application/get-client";
import { makeGetClientInfoForCase } from "@/modules/case-study/application/get-client-info-for-case";
import { makeListCaseStudies } from "@/modules/case-study/application/list-case-studies";
import { makeListClientSummaries } from "@/modules/case-study/application/list-client-summaries";
import { makeListClients } from "@/modules/case-study/application/list-clients";
import { makeRecordEvent } from "@/modules/case-study/application/record-event";
import {
  makeSaveClientBriefField,
  type ClientBriefFieldSaved,
} from "@/modules/case-study/application/save-client-brief-field";
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
  CaseClientInfo,
  ClientSummary,
  ListScope,
} from "@/modules/case-study/domain/case-study";
import type { ListedClientAsset } from "@/modules/case-study/domain/client-material";
import type { ClientMaterialStorage } from "@/modules/case-study/ports/client-material-storage";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import type { Result } from "@/shared/result";

export { CASE_CREATED, TRANSITION } from "@/modules/case-study/domain/case-event";
export type { CaseEvent, RecordEventInput } from "@/modules/case-study/domain/case-event";
export {
  CLIENT_BRIEF_FIELDS,
  CLIENT_BRIEF_MAX,
  CLIENT_DESCRIPTION_MAX,
  CLIENT_INDUSTRIES,
  CLIENT_NAME_MAX,
  isClientComplete,
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
  ClientBrief,
  ClientBriefField,
  ClientDetail,
  ClientIndustry,
  ClientRef,
  CaseClientInfo,
  ClientSummary,
  CreateCaseStudyInput,
  CreateClientInput,
  ListScope,
  Locale,
  LogoContentType,
  UpdateClientInput,
} from "@/modules/case-study/domain/case-study";
export {
  CLIENT_IMAGE_MAX_SIDE_PX,
  CLIENT_IMAGE_MIN_SHORT_SIDE_PX,
  CLIENT_MATERIAL_CONTENT_TYPES,
  CLIENT_MATERIAL_MAX_BYTES,
  CLIENT_MATERIAL_MAX_FILES,
  CLIENT_MATERIAL_MIN_IMAGES,
  clientImageCount,
} from "@/modules/case-study/domain/client-material";
export type {
  ClientAsset,
  ClientAssetKind,
  ClientMaterialContentType,
  ListedClientAsset,
} from "@/modules/case-study/domain/client-material";
export type { PresignedClientMaterial } from "@/modules/case-study/application/request-client-material-upload";
export type { PresignedClientLogoUpload } from "@/modules/case-study/application/request-client-logo-upload";
export type { ClientBriefFieldSaved } from "@/modules/case-study/application/save-client-brief-field";
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
 * Every client with its count of non-deleted case studies and whether every
 * required field is filled (`{ id, name, code, caseCount, complete }`), sorted by name. Call only after `authorize(actor, 'list clients')`.
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

/** One client material storage adapter, built on first use and reused across requests. */
let clientMaterialStorageMemo: ClientMaterialStorage | undefined;

function clientMaterialStorage(): ClientMaterialStorage {
  clientMaterialStorageMemo ??= createSupabaseClientMaterialStorage();
  return clientMaterialStorageMemo;
}

function clientMaterialDeps(): ClientMaterialDeps {
  return { clients: createSupabaseClientRepository(), storage: clientMaterialStorage(), newId: randomUUID };
}

/**
 * One client by id with its info, its brief (for the wizard; never shown on the
 * client page) and `logoUrl` (a signed GET valid at most 15
 * minutes, or null when it has no logo or the link could not be made). Unknown or
 * malformed ids are `CLIENT_NOT_FOUND`. Call only after `authorize(actor, 'list clients')`.
 * Its files come from `listClientMaterial`.
 */
export function getClient(id: unknown): Promise<Result<ClientDetail>> {
  return makeGetClient(createSupabaseClientRepository(), logoStorage())(id);
}

/**
 * Adds a client: input `{ name, industries, description }` (name 1–120, one or more
 * industries from `CLIENT_INDUSTRIES`, description 1–400 characters after trimming);
 * the code is assigned automatically (AD-21). The logo is linked afterwards with
 * `updateClient` and the brief saved with `saveClientBriefField`. Call only after
 * `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `CLIENT_FIELD_INVALID`,
 * `CLIENT_FIELD_TOO_LONG`, `CLIENT_NAME_TAKEN`, `CLIENT_CODE_EXHAUSTED`; nothing is
 * written on any error.
 */
export function createClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeCreateClient(createSupabaseClientRepository())(actor, input);
}

/**
 * Edits a client: input `{ clientId, name, industries, description, logoId }`, every
 * field required and as it should be after the save (a logo is replaced, never cleared). The client
 * code and every case history code stay the same. Client info is live: every case
 * history shows the new values. A replaced or removed logo is deleted (row and
 * object); a failed delete never fails the save. Call only
 * after `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `CLIENT_FIELD_INVALID`,
 * `CLIENT_FIELD_TOO_LONG`, `CLIENT_NOT_FOUND`, `CLIENT_NAME_TAKEN`, `CLIENT_LOGO_INVALID` (unknown logo, or
 * another client's); nothing is written on any error. Clients are never deleted.
 */
export function updateClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeUpdateClient(createSupabaseClientRepository(), logoStorage())(actor, input);
}

/**
 * Saves one brief text of a client: input `{ clientId, field, text }` (`field` one of
 * context, solution, results; `text` at most 5000 characters after trimming, `""`
 * clears it). Saving the stored text again writes nothing. Call only after
 * `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `UNKNOWN_FIELD`,
 * `CLIENT_FIELD_TOO_LONG`, `CLIENT_NOT_FOUND`; nothing is written on any error.
 */
export function saveClientBriefField(actor: Actor, input: unknown): Promise<Result<ClientBriefFieldSaved>> {
  return makeSaveClientBriefField(createSupabaseClientRepository())(actor, input);
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
 * A signed upload for one new client file: input `{ clientId, contentType, sizeBytes }`;
 * returns `{ assetId, url, method: "PUT", headers }`. The case material types
 * (`FILE_TYPE_NOT_ALLOWED`), 1 B–50 MB (`FILE_TOO_LARGE`), at most 3 files per client
 * (`CLIENT_MATERIAL_LIMIT`). Call only after `authorize(actor, 'manage clients')`.
 * Errors also: `INVALID_INPUT`, `CLIENT_NOT_FOUND`, `STORAGE_FAILED`. Nothing is written.
 */
export function requestClientMaterialUpload(actor: Actor, input: unknown): Promise<Result<PresignedClientMaterial>> {
  return makeRequestClientMaterialUpload(clientMaterialDeps())(actor, input);
}

/**
 * Records an uploaded client file after re-checking the stored object (size, type,
 * and for images the real pixels: short side ≥1600 px, no side over 8000 px): input
 * `{ clientId, assetId, contentType }`; returns the listed file with the position
 * the database chose. Call only after `authorize(actor, 'manage clients')`. Errors:
 * `INVALID_INPUT`, `FILE_TYPE_NOT_ALLOWED`, `UPLOAD_NOT_FOUND`, `UPLOAD_REJECTED`,
 * `CLIENT_MATERIAL_LIMIT`, `ASSET_ALREADY_CONFIRMED`, `CLIENT_NOT_FOUND`,
 * `STORAGE_FAILED`, `CLIENT_WRITE_FAILED`; no row is written on any of them.
 */
export function confirmClientMaterialUpload(actor: Actor, input: unknown): Promise<Result<ListedClientAsset>> {
  return makeConfirmClientMaterialUpload(clientMaterialDeps())(actor, input);
}

/**
 * A client's files (`{ clientId }`), in position order, images with a signed
 * thumbnail URL (≤15 minutes) or null. Call only after `authorize(actor, 'manage clients')`.
 * Errors: `INVALID_INPUT`, `CLIENT_NOT_FOUND`, `CLIENT_LOOKUP_FAILED`.
 */
export function listClientMaterial(input: unknown): Promise<Result<ListedClientAsset[]>> {
  return makeListClientMaterial(createSupabaseClientRepository(), clientMaterialStorage())(input);
}

/**
 * Removes one client file at once, with no undo: input `{ clientId, assetId }`. Its
 * row and object are deleted; a failed object delete is logged and never fails the
 * removal. Call only after `authorize(actor, 'manage clients')`. Errors:
 * `INVALID_INPUT`, `NOT_FOUND` (unknown file, or another client's), `CLIENT_WRITE_FAILED`.
 */
export function removeClientMaterial(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRemoveClientMaterial(clientMaterialDeps())(actor, input);
}

/**
 * The current client info for a case: `{ clientId, name, industries, description,
 * logoId, brief }`, always the client's current values (client info is live, owner
 * 2026-10-16). Epic 3 reads it at render time, not at enqueue. Unknown, malformed
 * or soft-deleted case ids are `NOT_FOUND`.
 */
export function getClientInfoForCase(caseId: unknown): Promise<Result<CaseClientInfo>> {
  return makeGetClientInfoForCase(createSupabaseClientRepository())(caseId);
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
