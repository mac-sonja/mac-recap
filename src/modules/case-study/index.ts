// Public surface of the case-study module. Code outside this module imports only this file.
// The module owns `case_study`, `client`, `client_sector`, `client_logo`, `client_brief`, `client_asset`,
// `case_number_counter`, `case_event`, `client_intro`, `client_event`, `client_case_order` and `revision`, and the `material` bucket's
// `clients/{clientId}/logos/**` and `clients/{clientId}/material/**` (AD-1, AD-22):
// nobody else writes them.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@/modules/access";
import { listActivityOfCase, listScopeActivity } from "@/modules/case-study/adapters/supabase/case-activity";
import { ACTIVITY_LIMIT, type CaseActivity } from "@/modules/case-study/domain/case-activity";
import { listScopeSchema } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import { createSupabaseCaseStudyRepository } from "@/modules/case-study/adapters/supabase/case-study-repository";
import { createSupabaseClientRepository } from "@/modules/case-study/adapters/supabase/client-repository";
import { createSupabaseClientSectorRepository } from "@/modules/case-study/adapters/supabase/client-sector-repository";
import { makeAddClientSector, makeListClientSectors } from "@/modules/case-study/application/client-sectors";
import { createSupabaseClientMaterialStorage } from "@/modules/case-study/adapters/supabase/client-material-storage";
import { createSupabaseLogoStorage } from "@/modules/case-study/adapters/supabase/logo-storage";
import type { ClientMaterialDeps } from "@/modules/case-study/application/client-material-deps";
import { makeConfirmClientMaterialUpload } from "@/modules/case-study/application/confirm-client-material-upload";
import { makeGetClientAsset, makeListClientMaterial } from "@/modules/case-study/application/list-client-material";
import { makeRemoveClientMaterial } from "@/modules/case-study/application/remove-client-material";
import {
  makeRequestClientMaterialUpload,
  type PresignedClientMaterial,
} from "@/modules/case-study/application/request-client-material-upload";
import { makeConfirmClientLogoUpload } from "@/modules/case-study/application/confirm-client-logo-upload";
import { makeCreateCaseStudy } from "@/modules/case-study/application/create-case-study";
import { makeCreateClient } from "@/modules/case-study/application/create-client";
import { makeDeleteClient, type ClientDeleted } from "@/modules/case-study/application/delete-client";
import { makeGetCaseStudy } from "@/modules/case-study/application/get-case-study";
import { makeGetClient } from "@/modules/case-study/application/get-client";
import { makeGetClientInfoForCase } from "@/modules/case-study/application/get-client-info-for-case";
import { makeListCaseStudies } from "@/modules/case-study/application/list-case-studies";
import { makeListClientSummaries } from "@/modules/case-study/application/list-client-summaries";
import { makeListClients } from "@/modules/case-study/application/list-clients";
import { makeListReadyDrafts } from "@/modules/case-study/application/list-ready-drafts";
import { makeReadClientLogo, type ClientLogoFile } from "@/modules/case-study/application/read-client-logo";
import { makeRecordEvent } from "@/modules/case-study/application/record-event";
import { makeGetClientCaseOrder, makeListClientCasesInOrder, makeSetClientCaseOrder } from "@/modules/case-study/application/client-case-order";
import { createSupabaseClientCaseOrderRepository } from "@/modules/case-study/adapters/supabase/client-case-order-repository";
import type { ClientCaseOrder } from "@/modules/case-study/domain/client-case-order";
import {
  makeApprove,
  makeApproveIntro,
  makeCreateWorkingRevision,
  makeDiscardHead,
  makeDiscardIntroHead,
  makeForkHead,
  makeForkIntroHead,
  makeGetEditableRevision,
  makeGetLiveRevision,
  makeSaveIntroRevisionDoc,
  makeSaveRevisionDoc,
  type CaseAssetIds,
  type CaseStudyRevision,
} from "@/modules/case-study/application/revisions";
import { createSupabaseRevisionRepository } from "@/modules/case-study/adapters/supabase/revision-repository";
import { createSupabaseClientIntroRepository } from "@/modules/case-study/adapters/supabase/client-intro-repository";
import {
  makeCreateIntroWorkingRevision,
  makeGetClientIntro,
  makeGetClientIntroById,
  makeStartClientIntro,
  makeTransitionIntro,
  type EnqueueGenerate,
} from "@/modules/case-study/application/client-intro";
import {
  makeSaveClientBriefField,
  makeSaveClientResults,
  makeSaveClientTestimonial,
  type ClientBriefFieldSaved,
  type ClientResultsSaved,
  type ClientTestimonialSaved,
} from "@/modules/case-study/application/save-client-brief-field";
import type { LogoDeps } from "@/modules/case-study/application/logo-deps";
import {
  makeRequestClientLogoUpload,
  type PresignedClientLogoUpload,
} from "@/modules/case-study/application/request-client-logo-upload";
import { makeTransition } from "@/modules/case-study/application/transition";
import { makeDeleteCaseStudy } from "@/modules/case-study/application/delete-case-study";
import { makeUpdateCaseFields } from "@/modules/case-study/application/update-case-fields";
import { makeUpdateCaseStudyDetails } from "@/modules/case-study/application/update-case-study-details";
import { makeUpdateClient } from "@/modules/case-study/application/update-client";
import type { CaseEvent } from "@/modules/case-study/domain/case-event";
import type {
  CaseStudy,
  Client,
  ClientDetail,
  ClientRef,
  ClientSector,
  CaseClientInfo,
  ClientSummary,
  ListedCaseStudy,
  ListScope,
} from "@/modules/case-study/domain/case-study";
import type { ClientAsset, ListedClientAsset, StoredClientAsset } from "@/modules/case-study/domain/client-material";
import type { ReadyDraft } from "@/modules/case-study/domain/ready-draft";
import type { ClientIntro, ClientIntroStart } from "@/modules/case-study/domain/client-intro";
import type { ForkedHead } from "@/modules/case-study/domain/revision";
import type { ClientMaterialStorage } from "@/modules/case-study/ports/client-material-storage";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import type { Result } from "@/shared/result";

export { CASE_CREATED, CASE_DELETED, CASE_DETAILS_UPDATED, CASE_EXPORTED, TRANSITION } from "@/modules/case-study/domain/case-event";
export type { CaseEvent, RecordEventInput } from "@/modules/case-study/domain/case-event";
export { ACTIVITY_TYPES } from "@/modules/case-study/domain/case-activity";
export type { ActivityType, CaseActivity } from "@/modules/case-study/domain/case-activity";
export {
  BUSINESS_LINES,
  CLIENT_BRIEF_FIELDS,
  CLIENT_BRIEF_MAX,
  CLIENT_DESCRIPTION_MAX,
  CLIENT_NAME_MAX,
  CLIENT_RESULT_LABEL_MAX,
  CLIENT_RESULT_VALUE_MAX,
  CLIENT_RESULTS_MAX,
  CLIENT_SECTOR_LABEL_MAX,
  CLIENT_SECTOR_LABEL_MIN,
  CLIENT_TESTIMONIAL_AUTHOR_MAX,
  CLIENT_TESTIMONIAL_QUOTE_MAX,
  isClientComplete,
  LOCALES,
  sectorLabelKey,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  LOGO_MIN_SHORT_SIDE_PX,
  YEAR_MAX,
  YEAR_MIN,
} from "@/modules/case-study/domain/case-study";
export type {
  BusinessLine,
  CaseStudy,
  ListedCaseStudy,
  Client,
  ClientBrief,
  ClientBriefField,
  ClientDetail,
  ClientRef,
  ClientResult,
  ClientSector,
  CaseClientInfo,
  ClientSummary,
  AddClientSectorInput,
  CreateCaseStudyInput,
  CreateClientInput,
  DeleteClientInput,
  ListScope,
  Locale,
  LogoContentType,
  UpdateCaseFieldsInput,
  UpdateCaseStudyDetailsInput,
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
  StoredClientAsset,
} from "@/modules/case-study/domain/client-material";
export type { PresignedClientMaterial } from "@/modules/case-study/application/request-client-material-upload";
export type { PresignedClientLogoUpload } from "@/modules/case-study/application/request-client-logo-upload";
export type {
  ClientBriefFieldSaved,
  ClientResultsSaved,
  ClientTestimonialSaved,
} from "@/modules/case-study/application/save-client-brief-field";
export type { ClientDeleted } from "@/modules/case-study/application/delete-client";
export type { ClientLogoFile } from "@/modules/case-study/application/read-client-logo";
export { TRANSITION_EVENTS } from "@/modules/case-study/domain/transition";
export {
  APPROVED_VERSION_UPDATED,
  REVISION_CREATED,
  REVISION_DISCARDED,
  REVISION_FORKED,
  REVISION_SAVED,
  REVISION_STATUSES,
} from "@/modules/case-study/domain/revision";
export type {
  CreateWorkingRevisionInput,
  DiscardHeadInput,
  ForkedHead,
  ForkHeadInput,
  RevisionManifest,
  RevisionMeta,
  RevisionStatus,
  RevisionSubject,
  SaveRevisionDocInput,
} from "@/modules/case-study/domain/revision";
export type { CaseAssetIds, CaseStudyRevision } from "@/modules/case-study/application/revisions";
/** Every asset id a document references, as `saveRevisionDoc` checks it (pure; Story 4.4c's image pool). */
export { referencedAssetIds } from "@/modules/case-study/application/revisions";
export type { TransitionEvent } from "@/modules/case-study/domain/transition";
export { READY_DRAFT_KINDS } from "@/modules/case-study/domain/ready-draft";
export type { ListReadyDraftsInput, ReadyDraft } from "@/modules/case-study/domain/ready-draft";
export { CLIENT_INTRO_CREATED } from "@/modules/case-study/domain/client-intro";
export type {
  ClientIntro,
  ClientIntroStart,
  CreateIntroWorkingRevisionInput,
  DiscardIntroHeadInput,
  ForkIntroHeadInput,
} from "@/modules/case-study/domain/client-intro";
export type { EnqueueGenerate } from "@/modules/case-study/application/client-intro";
export type { FieldIssue } from "@/modules/case-study/domain/validation";
export { CLIENT_CASE_ORDER_MAX, orderClientCases } from "@/modules/case-study/domain/client-case-order";
export type { ClientCaseOrder } from "@/modules/case-study/domain/client-case-order";

/**
 * Creates a case study (status `draft`, permanent DB-generated id, and the next
 * readable code for its client and year, e.g. `LUM-2026-01`) and its
 * `case_created` event in one transaction. Input `{ name, clientId, year, locale?, businessLines? }`
 * (`businessLines` from `BUSINESS_LINES`, none by default).
 * Call only after `authorize(actor, 'create case')`. `INVALID_INPUT` names each
 * failing field in `details.fields`; `CLIENT_NOT_FOUND` for an unknown client.
 * Nothing is written on any error.
 */
export function create(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
  return makeCreateCaseStudy(createSupabaseCaseStudyRepository())(actor, input);
}

/**
 * Saves a draft's details (Story 2.17): input `{ caseId, name, clientId, year, locale, businessLines }`,
 * every field as it should be after the save. The client never changes; a year change renumbers the draft in the new year (next number for its client, new code; owner 2026-10-20).
 * A changed save writes one `case_details_updated` event with the actor in the same
 * transaction; an unchanged one writes nothing. Call only after
 * `authorize(actor, 'create case')`. `INVALID_INPUT` (naming each field), `NOT_FOUND`
 * (unknown or deleted), `STALE_STATUS` (no longer a draft); nothing is written on any error.
 */
export function updateDetails(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
  return makeUpdateCaseStudyDetails(createSupabaseCaseStudyRepository())(actor, input);
}

/**
 * Saves a Da approvare case's year and services from the configurator (Story 4.3d, owner
 * 2026-11-03): input `{ caseId, year, businessLines }`, both as they should be after the
 * save (year 1900–2100, at least one business line from `BUSINESS_LINES`). The code and
 * number never change, even when the year does. A changed save writes one
 * `case_details_updated` event `{ year, businessLines }` with the actor in the same
 * transaction; an unchanged one writes nothing. Call only after
 * `authorize(actor, 'fill details')`. `INVALID_INPUT` (naming each field), `NOT_FOUND`
 * (unknown or deleted), `STALE_STATUS` (not Da approvare); nothing is written on any error.
 */
export function updateCaseFields(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
  return makeUpdateCaseFields(createSupabaseCaseStudyRepository())(actor, input);
}

/**
 * Deletes a draft or an approved case (Stories 4.1, 5.2; AR3 amended 2026-10-28): input
 * `{ caseId, status }`, `status` being `draft` or `approved`, the status the person
 * confirmed. The case gets `deleted_at` and one `case_deleted` event (reason
 * `{status}_deleted`) with the actor, in one transaction; it then disappears from every
 * list and read. Nothing is hard-deleted: rows, material, events and its number stay.
 * Call only after `authorize(actor, 'delete case', { status })`. `INVALID_INPUT`, `NOT_FOUND` (unknown or
 * already deleted), `CASE_NOT_DELETABLE` (no longer in `status`); nothing is written on
 * any error.
 */
export function deleteCaseStudy(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeDeleteCaseStudy(createSupabaseCaseStudyRepository())(actor, input);
}

/** One case study by id; unknown, malformed or soft-deleted ids are `NOT_FOUND`. */
export function get(id: unknown): Promise<Result<CaseStudy>> {
  return makeGetCaseStudy(createSupabaseCaseStudyRepository())(id);
}

/**
 * The non-deleted case studies within exactly `scope`, newest `updated_at` first,
 * each Da approvare case with `inReviewSince` (when it entered that status) and each
 * Approvato case with `approvedAt` (Story 5.1, when it was approved):
 * `{}` lists every status, `{ status: "approved" }` approved only; `clientId`
 * limits it to that client's cases. Derive the status scope
 * from the `list cases` policy and authorize it first, so no scope the policy
 * denies is ever queried. A malformed scope is `INVALID_INPUT`.
 */
export function list(scope: ListScope): Promise<Result<ListedCaseStudy[]>> {
  return makeListCaseStudies(createSupabaseCaseStudyRepository())(scope);
}

/**
 * The drafts that became ready for `actor` (Story 3.8): input `{ since }`, an ISO
 * timestamp with an offset (the start of the person's page session), clamped to no
 * earlier than 24 hours ago. Returns `{ id, name, readyAt }` for each non-deleted case
 * now Da approvare with a `generation_succeeded` transition after `since` that follows its
 * latest `generate`, made by `actor` (a failed generation never counts), oldest first,
 * one per case. Story 3.11: client intros the same way, from `client_event` (`kind:
 * "client_intro"`, `id` and `name` the client's). Each entry has `kind` (`case` or
 * `client_intro`); cases and intros together, oldest first. Call only after
 * `authorize(actor, 'generate')`. `INVALID_INPUT`, `CASE_STUDY_LOOKUP_FAILED`.
 */
export function listReadyDrafts(actor: Actor, input: unknown): Promise<Result<ReadyDraft[]>> {
  return makeListReadyDrafts(createSupabaseCaseStudyRepository(), createSupabaseClientIntroRepository())(actor, input);
}

/**
 * The Dashboard's *Attività*: the newest events of the cases within `scope` (the
 * same scope as `list`, derived and authorized the same way), each with who did it
 * and which case. A malformed scope is `INVALID_INPUT`.
 */
export async function listActivity(scope: ListScope): Promise<Result<CaseActivity[]>> {
  const parsed = parseInput(listScopeSchema, scope);
  if (!parsed.ok) return parsed;
  return listScopeActivity(parsed.value, ACTIVITY_LIMIT);
}

/**
 * The approved case page's *Attività*: the newest events of the case `caseId`, read
 * as `listActivity` reads them; nothing for a deleted case. Call only after the page
 * authorized `view` for the case. A malformed id is `INVALID_INPUT`.
 */
export async function listCaseActivity(caseId: string): Promise<Result<CaseActivity[]>> {
  const parsed = parseInput(z.uuid(), caseId);
  if (!parsed.ok) return parsed;
  return listActivityOfCase(parsed.value, ACTIVITY_LIMIT);
}

/**
 * Every non-deleted client (`{ id, name, code }`), sorted by name. Call only after
 * `authorize(actor, 'list clients')`.
 */
export function listClients(): Promise<Result<ClientRef[]>> {
  return makeListClients(createSupabaseClientRepository())();
}

/**
 * Every non-deleted client with its count of non-deleted case studies and whether every
 * required field is filled (`{ id, name, code, caseCount, complete, logoUrl }`), sorted by name. `logoUrl` is a
 * signed GET of the current logo valid 10 minutes, or null when the client has none or it
 * could not be signed (never failing the list). Call only after `authorize(actor, 'list clients')`.
 */
export function listClientSummaries(): Promise<Result<ClientSummary[]>> {
  return makeListClientSummaries(createSupabaseClientRepository(), logoStorage())();
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
 * Every client sector (`{ key, label }`) in display order: the four seeded ones, then
 * the ones people added, as they were added. Call only after `authorize(actor, 'list clients')`.
 */
export function listClientSectors(): Promise<Result<ClientSector[]>> {
  return makeListClientSectors(createSupabaseClientSectorRepository())();
}

/**
 * Adds a sector to the shared list, seen by everybody from then on: input `{ label }`
 * (whitespace collapsed and trimmed, 2–40 characters). When a sector with the same name
 * exists (case, accents and extra spaces aside) that one is returned and nothing is
 * written. It needs no client. Call only after `authorize(actor, 'manage clients')`.
 * `SECTOR_LABEL_INVALID` (naming `label`), `INVALID_INPUT`; nothing is written on any error.
 */
export function addClientSector(actor: Actor, input: unknown): Promise<Result<ClientSector>> {
  return makeAddClientSector(createSupabaseClientSectorRepository())(actor, input);
}

/**
 * Adds a client: input `{ name, industry, description }` (name 1–120, `industry` one
 * sector key from `listClientSectors`, description 1–400 characters after trimming);
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
 * Edits a client: input `{ clientId, name, industry, description, logoId }`, every
 * field required and as it should be after the save (a logo is replaced, never cleared). The client
 * code and every case history code stay the same. Client info is live: every case
 * history shows the new values. A replaced or removed logo is deleted (row and
 * object); a failed delete never fails the save. Call only
 * after `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `CLIENT_FIELD_INVALID`,
 * `CLIENT_FIELD_TOO_LONG`, `CLIENT_NOT_FOUND`, `CLIENT_NAME_TAKEN`, `CLIENT_LOGO_INVALID` (unknown logo, or
 * another client's); nothing is written on any error. A deleted client is `CLIENT_NOT_FOUND`.
 */
export function updateClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeUpdateClient(createSupabaseClientRepository(), logoStorage())(actor, input);
}

/**
 * Deletes a client and all its case histories, approved ones included (owner,
 * 2026-10-19): input `{ clientId, confirmName }`, where `confirmName` must equal the
 * client's name once trimmed with inner whitespace collapsed. Everything is
 * soft-deleted in one transaction, with one `case_deleted` case event per case; returns
 * `{ deletedCases }`. Afterwards the client is absent from every read and every
 * client write is `CLIENT_NOT_FOUND`; its name may be reused, its code never is.
 * Call only after `authorize(actor, 'manage clients')`. `INVALID_INPUT`,
 * `CLIENT_NOT_FOUND`, `CLIENT_DELETE_NAME_MISMATCH`; nothing is written on any error.
 */
export function deleteClient(actor: Actor, input: unknown): Promise<Result<ClientDeleted>> {
  return makeDeleteClient(createSupabaseClientRepository())(actor, input);
}

/**
 * Saves one brief text of a client: input `{ clientId, field, text }` (`field` one of
 * context, solution; `text` at most 5000 characters after trimming, `""`
 * clears it). Saving the stored text again writes nothing. Call only after
 * `authorize(actor, 'manage clients')`. `INVALID_INPUT`, `UNKNOWN_FIELD`,
 * `CLIENT_FIELD_TOO_LONG`, `CLIENT_NOT_FOUND`; nothing is written on any error.
 */
export function saveClientBriefField(actor: Actor, input: unknown): Promise<Result<ClientBriefFieldSaved>> {
  return makeSaveClientBriefField(createSupabaseClientRepository())(actor, input);
}

/**
 * Replaces a client's results (optional): input `{ clientId, results: [{ label, value }] }`,
 * the filled rows top to bottom, at most 3; label ≤ 80 and value ≤ 20 characters
 * after trimming, both required in each row; `[]` clears them. Returns `{ results }`
 * as stored (trimmed). Call only after `authorize(actor, 'manage clients')`.
 * `INVALID_INPUT`, `CLIENT_FIELD_INVALID`, `CLIENT_FIELD_TOO_LONG` (naming `results`),
 * `CLIENT_NOT_FOUND`; nothing is written on any error.
 */
export function saveClientResults(actor: Actor, input: unknown): Promise<Result<ClientResultsSaved>> {
  return makeSaveClientResults(createSupabaseClientRepository())(actor, input);
}

/**
 * Replaces a client's testimonial (optional): input `{ clientId, quote, author }`,
 * trimmed; quote ≤ 600 and author ≤ 120 characters; an author needs a quote
 * (`CLIENT_FIELD_INVALID` on `quote`); `""` and `""` clear it. Returns `{ quote, author }`
 * as stored. Call only after `authorize(actor, 'manage clients')`. `INVALID_INPUT`,
 * `CLIENT_FIELD_INVALID`, `CLIENT_FIELD_TOO_LONG`, `CLIENT_NOT_FOUND`; nothing is written on any error.
 */
export function saveClientTestimonial(actor: Actor, input: unknown): Promise<Result<ClientTestimonialSaved>> {
  return makeSaveClientTestimonial(createSupabaseClientRepository())(actor, input);
}

/**
 * A signed upload for a new logo: input `{ clientId, contentType, sizeBytes }`;
 * returns `{ logoId, url, method: "PUT", headers }`. PNG, JPEG, WebP or SVG, 1 B–5 MB,
 * else `CLIENT_LOGO_INVALID`. Call only after `authorize(actor, 'manage clients')`.
 * Errors: `INVALID_INPUT`, `CLIENT_LOGO_INVALID`, `CLIENT_NOT_FOUND`, `STORAGE_FAILED`.
 */
export function requestClientLogoUpload(actor: Actor, input: unknown): Promise<Result<PresignedClientLogoUpload>> {
  return makeRequestClientLogoUpload(logoDeps())(actor, input);
}

/**
 * Records an uploaded logo after re-checking the stored object (size, type and real
 * pixels, short side ≥400 px; an SVG passes the SVG safety scan instead): input `{ clientId, logoId, contentType }`; returns
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
 * Removes one client file at once, with no undo: input `{ clientId, assetId }`. A soft
 * delete (Story 4.5c-2): the file leaves every list and frees its slot, its object and
 * renditions stay, and a revision still referencing it reports `MATERIAL_MISSING` at
 * approval. Call only after `authorize(actor, 'manage clients')`. Errors:
 * `INVALID_INPUT`, `NOT_FOUND` (unknown or removed file, or another client's),
 * `CLIENT_NOT_FOUND`, `CLIENT_WRITE_FAILED`.
 */
export function removeClientMaterial(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRemoveClientMaterial(clientMaterialDeps())(actor, input);
}

/**
 * One client file by id, removed or not (`deletedAt` set when it or its client is
 * deleted), or null (Story 4.5c-2). Module-only: the material module's rendition worker
 * and `getClientRendition` read it; no authorization of its own, so call only after the
 * caller's own. Errors: `INVALID_INPUT`, `CLIENT_LOOKUP_FAILED`, `CLIENT_INVALID`.
 */
export function getClientAsset(assetId: unknown): Promise<Result<StoredClientAsset | null>> {
  return makeGetClientAsset(createSupabaseClientRepository())(assetId);
}

/**
 * One page of the non-deleted images and videos of non-deleted clients, by id (at most
 * `limit`, after `afterId`). Dev tooling only: the renditions backfill (Story 4.5c-2).
 * Errors: `CLIENT_LOOKUP_FAILED`, `CLIENT_INVALID`.
 */
export function listLiveClientMediaPage(afterId: string | null, limit: number): Promise<Result<ClientAsset[]>> {
  return createSupabaseClientRepository().listLiveMediaPage(afterId, limit);
}

/**
 * The current client info for a case: `{ clientId, name, industry, description,
 * logoId, brief }` (`industry`: the sector's `{ key, label }`, or null), always the client's current values (client info is live, owner
 * 2026-10-16). Epic 3 reads it at render time, not at enqueue. Unknown, malformed
 * or soft-deleted case ids are `NOT_FOUND`.
 */
export function getClientInfoForCase(caseId: unknown): Promise<Result<CaseClientInfo>> {
  return makeGetClientInfoForCase(createSupabaseClientRepository())(caseId);
}

/**
 * The bytes and type of a client's current logo, or null when it has none or its file is
 * missing (Story 5.3: exports draw the logo inline). Module-only: the rendering worker reads
 * it; no authorization of its own, so call only after the caller's own. Errors:
 * `CLIENT_NOT_FOUND` (unknown, malformed or deleted), the lookup and `STORAGE_FAILED`.
 */
export function readClientLogo(clientId: unknown): Promise<Result<ClientLogoFile | null>> {
  return makeReadClientLogo(createSupabaseClientRepository(), logoStorage())(clientId);
}

/**
 * Appends one `case_event` row (`{ caseId, type, revisionId?, data? }`) with the actor.
 * Every mutation logs through here; an unknown case is `NOT_FOUND`, an unknown
 * revision `REVISION_NOT_FOUND`.
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

function revisionDeps() {
  return { cases: createSupabaseCaseStudyRepository(), revisions: createSupabaseRevisionRepository(), intros: createSupabaseClientIntroRepository() };
}

/**
 * The one write that creates a revision (Story 3.3); every later writer (test
 * draft, generator, Epic 4) uses it. Input `{ caseId, doc, manifest?, meta?,
 * expectedHeadVersion }`, `meta` being `{ model, fellBack, promptVersion }` (strings
 * 1–200 characters or null) and `expectedHeadVersion` the `headVersion` read
 * (0–2147483647). `doc` must pass `generation.validateNewDocument` (one entry for
 * exactly each registry format) before anything is written. Inserts a `working`
 * revision with `generatedDoc = doc`, makes it the head only if `headVersion` still
 * equals `expectedHeadVersion` (then increments it), supersedes a previous `working`
 * head, and writes one `revision_created` case event with the revision id, in one
 * transaction. `doc` holds no client values (the schema refuses them); callers must
 * not put client values in the manifest either (its refs-and-hashes shape arrives
 * with Story 3.7). Call only with an already-authorized actor.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `DOCUMENT_INVALID`,
 * `DOCUMENT_SCHEMA_UNSUPPORTED`, `FORMAT_NOT_IN_REVISION`, `NOT_FOUND` (unknown or
 * soft-deleted case), `STALE_HEAD`. `REVISION_WRITE_FAILED`, and `REVISION_INVALID`,
 * `DOCUMENT_INVALID` or `DOCUMENT_SCHEMA_UNSUPPORTED` on the returned row, can
 * come after the call reached the database, so the write may have committed:
 * re-read the head (`getEditableRevision`) rather than retry.
 */
export function createWorkingRevision(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
  return makeCreateWorkingRevision(revisionDeps())(actor, input);
}

/**
 * Saves the edited document of a case's head revision (Story 4.3a, the configurator's
 * autosave): input `{ caseId, revisionId, doc, expectedVersion }`, `doc` the whole
 * document as it should be and `expectedVersion` the revision `version` it was based
 * on. Writes `doc` (never `generatedDoc`) by compare-and-set on `version`, increments
 * it and records one `revision_saved` case event `{ version }`, in one transaction;
 * returns the saved revision. Call only after `authorize(actor, 'edit')`; the write
 * itself refuses a case that is not `in_review` (or, Story 4.9, an approved case whose head is
 * not a working copy from `forkHead`) and a revision of another case.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `DOCUMENT_INVALID`,
 * `DOCUMENT_SCHEMA_UNSUPPORTED`, `FORMAT_NOT_IN_REVISION`, `NOT_FOUND` (unknown
 * revision, another case's, or the case unknown or deleted), `ASSET_NOT_ALLOWED` (the
 * media guardrail, Story 4.5a: a newly referenced asset that is neither a non-deleted file
 * of this case, by `caseAssetIds` (pass `material.liveAssetIds`), nor a file of its client;
 * references the stored `doc` or `generatedDoc` already has are kept), the asset lookup errors, `STALE_HEAD` (no longer the head),
 * `CASE_NOT_EDITABLE` (neither `in_review` nor an approved case's copy), `REVISION_NOT_WRITABLE` (not
 * `working`), `STALE_REVISION` (saved by someone else since it was read).
 * `REVISION_WRITE_FAILED` may come after the write committed: re-read the head.
 */
export function saveRevisionDoc(actor: Actor, input: unknown, caseAssetIds: CaseAssetIds): Promise<Result<CaseStudyRevision>> {
  return makeSaveRevisionDoc({ ...revisionDeps(), clients: createSupabaseClientRepository(), caseAssetIds })(actor, input);
}

/**
 * Approves a case (Story 4.8): input `{ caseId, revisionId, expectedRevisionVersion,
 * expectedHeadVersion, overflow }`, `overflow` being each format of that revision version
 * as measured in the person's browser (`true` = a page overflows). The only way a case
 * becomes `approved`: a person's call, never in bulk or automatically. Authorize `approve`
 * first; pass `material.liveAssetIds` as `caseAssetIds`.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `NOT_FOUND`, `OVERFLOW_NOT_CLEARED`
 * (a format missing or overflowing), `MATERIAL_MISSING` (`details.assetIds`: referenced
 * files no longer there), the asset lookup errors, `STALE_HEAD`, `CASE_NOT_APPROVABLE`
 * (not `in_review`), `REVISION_NOT_WRITABLE`, `STALE_REVISION`. `REVISION_WRITE_FAILED`
 * may come after the write committed: re-read the case.
 *
 * Story 4.9 (**Aggiorna la versione approvata**): on an approved case, `revisionId` is its
 * working copy (the head, from `forkHead`); after the same checks it becomes the approved
 * revision and the previous one `superseded`, with one `approved_version_updated` event. The
 * case stays approved. `CASE_NOT_APPROVABLE` there means the case is not approved any more,
 * `REVISION_NOT_WRITABLE` that the head is the approved revision itself (nothing to update).
 */
export function approve(actor: Actor, input: unknown, caseAssetIds: CaseAssetIds): Promise<Result<CaseStudyRevision>> {
  return makeApprove({ ...revisionDeps(), clients: createSupabaseClientRepository(), caseAssetIds })(actor, input);
}

/**
 * The live revision of a subject (`{ kind: "case", id }`, or `{ kind: "client_intro", id }`
 * with the intro's id, Story 3.11): the approved one, or `null` when none is approved.
 * Documents are upgraded to the current schema in memory, never written back. Errors:
 * `INVALID_INPUT` (malformed subject), `NOT_FOUND` (unknown or soft-deleted case, or
 * unknown intro or one of a deleted client), `REVISION_POINTER_INVALID` (the pointed
 * revision is missing, another subject's, or not `approved`; logged), `CASE_STUDY_LOOKUP_FAILED`,
 * `CASE_STUDY_INVALID`, `CLIENT_INTRO_LOOKUP_FAILED`, `CLIENT_INTRO_INVALID`,
 * `REVISION_LOOKUP_FAILED`, `REVISION_INVALID` (the row),
 * `DOCUMENT_INVALID` and `DOCUMENT_SCHEMA_UNSUPPORTED` (a stored document that does
 * not upgrade).
 */
export function getLiveRevision(subject: unknown): Promise<Result<CaseStudyRevision | null>> {
  return makeGetLiveRevision(revisionDeps())(subject);
}

/**
 * The editable revision of a subject (`{ kind: "case", id }` or `{ kind: "client_intro",
 * id }`): the head, or `null` when it has none. Same upgrade and errors as
 * `getLiveRevision`, except that the head may have any status (`REVISION_POINTER_INVALID`
 * only when it is missing or another subject's).
 */
export function getEditableRevision(subject: unknown): Promise<Result<CaseStudyRevision | null>> {
  return makeGetEditableRevision(revisionDeps())(subject);
}

/**
 * Forks an approved case's head (Story 4.9), on its first edit: input `{ caseId,
 * expectedHeadVersion }`. Creates one `working` copy of the approved revision (`doc` and
 * `generatedDoc`), makes it the head by compare-and-set on `headVersion` (then incremented)
 * and writes one `revision_forked` case event, in one transaction; when the head already is a
 * working copy, returns it and writes nothing (idempotent). Live reads (`getLiveRevision`)
 * keep returning the approved revision until `approve` updates it. Returns `{ revisionId,
 * version, headVersion }`. Call only after `authorize(actor, 'edit')`.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `NOT_FOUND` (unknown or soft-deleted case),
 * `CASE_NOT_EDITABLE` (not approved), `REVISION_NOT_WRITABLE`, `STALE_HEAD` (the head moved).
 * `REVISION_WRITE_FAILED` may come after the write committed: call it again (it is idempotent).
 */
export function forkHead(actor: Actor, input: unknown): Promise<Result<ForkedHead>> {
  return makeForkHead(revisionDeps())(actor, input);
}

/**
 * **Scarta le modifiche** (Story 4.9): input `{ caseId, revisionId, expectedHeadVersion }`,
 * `revisionId` the approved case's working copy (its head). The copy becomes `superseded` and
 * the head points back at the approved revision (compare-and-set on `headVersion`, then
 * incremented), with one `revision_discarded` case event, in one transaction. The case stays
 * approved. Returns the approved revision. Call only after `authorize(actor, 'discard')`.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `NOT_FOUND`, `STALE_HEAD`,
 * `CASE_NOT_EDITABLE` (not approved), `REVISION_NOT_WRITABLE` (no copy to discard).
 * `REVISION_WRITE_FAILED` may come after the write committed: re-read the case.
 */
export function discardHead(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
  return makeDiscardHead(revisionDeps())(actor, input);
}

// ---------------------------------------------------------------------------
// Client intros (Story 3.11)
// ---------------------------------------------------------------------------

function introDeps() {
  return { intros: createSupabaseClientIntroRepository() };
}

/**
 * The client's intro-and-outro document (`{ id, clientId, status, headRevisionId,
 * approvedRevisionId, headVersion, ... }`), or `null` when it has none yet. Errors:
 * `CLIENT_NOT_FOUND` (malformed id), `CLIENT_INTRO_LOOKUP_FAILED`, `CLIENT_INTRO_INVALID`.
 * Call only after `authorize(actor, 'list clients')`.
 */
export function getClientIntro(clientId: unknown): Promise<Result<ClientIntro | null>> {
  return makeGetClientIntro(introDeps())(clientId);
}

/**
 * One intro by its own id (the worker reads it). Module-only: no authorization of its own,
 * so call only after the caller's. Errors: `NOT_FOUND` (unknown, malformed, or its client
 * deleted), `CLIENT_INTRO_LOOKUP_FAILED`, `CLIENT_INTRO_INVALID`.
 */
export function getClientIntroById(introId: unknown): Promise<Result<ClientIntro>> {
  return makeGetClientIntroById(introDeps())(introId);
}

/**
 * The only way a client intro's status changes (AD-3): the case transition table and
 * events, compare-and-set, with one `transition` client event `{ event, from, to }` and the
 * actor, in one transaction. `approve` is refused: an intro is approved only through
 * `approveIntro` (Story 4.11a), which checks overflow and material.
 * Call only with an already-authorized actor. Errors: `NOT_FOUND`, `INVALID_TRANSITION`,
 * `STALE_STATUS`; nothing is written on any of them.
 */
export function transitionIntro(introId: unknown, event: unknown, actor: Actor): Promise<Result<ClientIntro>> {
  return makeTransitionIntro(introDeps())(introId, event, actor);
}

/**
 * Creates a `working` revision of a client intro (Story 3.11): input `{ clientIntroId, doc,
 * manifest?, meta?, expectedHeadVersion }`, as `createWorkingRevision` takes for a case.
 * `doc` must pass `generation.validateNewDocument` and be of kind `client_intro`. The
 * revision becomes the intro's head by compare-and-set on its `headVersion`, a previous
 * working head is superseded, and one `revision_created` client event is written, in one
 * transaction. Call only with an already-authorized actor. Errors, with nothing written:
 * `INVALID_INPUT`, `DOCUMENT_INVALID`, `DOCUMENT_SCHEMA_UNSUPPORTED`, `FORMAT_NOT_IN_REVISION`,
 * `NOT_FOUND`, `STALE_HEAD`. `REVISION_WRITE_FAILED` may come after the write committed:
 * re-read the intro.
 */
export function createIntroWorkingRevision(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
  return makeCreateIntroWorkingRevision(introDeps())(actor, input);
}

function introRevisionDeps(caseAssetIds: CaseAssetIds) {
  return {
    revisions: createSupabaseRevisionRepository(),
    intros: createSupabaseClientIntroRepository(),
    cases: createSupabaseCaseStudyRepository(),
    clients: createSupabaseClientRepository(),
    caseAssetIds,
  };
}

/**
 * Saves the edited document of a client intro's head revision (Story 4.11a, the
 * configurator's autosave in client mode): input `{ clientIntroId, revisionId, doc,
 * expectedVersion }`, as `saveRevisionDoc` takes for a case. Writes `doc` by compare-and-set
 * on `version` with one `revision_saved` client event (never a case event), in one
 * transaction. The media guardrail allows the client's files and the live files of the
 * client's non-deleted cases (pass `material.liveAssetIds` as `caseAssetIds`). Call only
 * after `authorize(actor, 'edit')`.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `DOCUMENT_INVALID` (also a document not of
 * kind `client_intro`), `DOCUMENT_SCHEMA_UNSUPPORTED`, `FORMAT_NOT_IN_REVISION`, `NOT_FOUND`,
 * `ASSET_NOT_ALLOWED`, the asset lookup errors, `STALE_HEAD`, `CASE_NOT_EDITABLE` (the intro
 * is neither `in_review` nor approved with a working copy from `forkIntroHead`),
 * `REVISION_NOT_WRITABLE`, `STALE_REVISION`. `REVISION_WRITE_FAILED` may
 * come after the write committed: re-read the head.
 */
export function saveIntroRevisionDoc(actor: Actor, input: unknown, caseAssetIds: CaseAssetIds): Promise<Result<CaseStudyRevision>> {
  return makeSaveIntroRevisionDoc(introRevisionDeps(caseAssetIds))(actor, input);
}

/**
 * Approves a client intro (Story 4.11a, Story 4.8's rules): input `{ clientIntroId,
 * revisionId, expectedRevisionVersion, expectedHeadVersion, overflow }`. The only way an
 * intro becomes `approved`: a person's call, never in bulk or automatically. The revision
 * and the intro become `approved`, `approved_revision_id` is set, and a `transition` and a
 * `revision_approved` client event are written, in one transaction. Authorize `approve`
 * first; pass `material.liveAssetIds` as `caseAssetIds`.
 *
 * Story 4.11b (**Aggiorna la versione approvata**): on an approved intro, `revisionId` is its
 * working copy (the head, from `forkIntroHead`); after the same checks it becomes the
 * approved revision, the previous one `superseded`, with one `approved_version_updated`
 * client event. The intro stays approved.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `NOT_FOUND`, `OVERFLOW_NOT_CLEARED`,
 * `MATERIAL_MISSING` (`details.assetIds`), the asset lookup errors, `STALE_HEAD`,
 * `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE` (an approved intro with no copy),
 * `STALE_REVISION`. `REVISION_WRITE_FAILED` may come after the write committed: re-read the
 * intro.
 */
export function approveIntro(actor: Actor, input: unknown, caseAssetIds: CaseAssetIds): Promise<Result<CaseStudyRevision>> {
  return makeApproveIntro(introRevisionDeps(caseAssetIds))(actor, input);
}

/**
 * Forks an approved client intro's head (Story 4.11b), on its first edit: input
 * `{ clientIntroId, expectedHeadVersion }`. Creates one `working` copy of the approved
 * revision, makes it the head by compare-and-set on `headVersion` (then incremented) and
 * writes one `revision_forked` client event, in one transaction; when the head already is a
 * working copy, returns it and writes nothing (idempotent). Live reads (`getLiveRevision`)
 * keep returning the approved revision until `approveIntro` updates it. Returns
 * `{ revisionId, version, headVersion }`. Call only after `authorize(actor, 'edit')`.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `NOT_FOUND`, `CASE_NOT_EDITABLE` (not
 * approved), `REVISION_NOT_WRITABLE`, `STALE_HEAD`. `REVISION_WRITE_FAILED` may come after the
 * write committed: call it again (it is idempotent).
 */
export function forkIntroHead(actor: Actor, input: unknown): Promise<Result<ForkedHead>> {
  return makeForkIntroHead(introDeps())(actor, input);
}

/**
 * **Scarta le modifiche** for a client intro (Story 4.11b): input `{ clientIntroId,
 * revisionId, expectedHeadVersion }`, `revisionId` the approved intro's working copy (its
 * head). The copy becomes `superseded` and the head points back at the approved revision
 * (compare-and-set on `headVersion`, then incremented), with one `revision_discarded` client
 * event, in one transaction. The intro stays approved. Returns the approved revision. Call
 * only after `authorize(actor, 'discard')`.
 *
 * Errors, with nothing written: `INVALID_INPUT`, `NOT_FOUND`, `STALE_HEAD`,
 * `CASE_NOT_EDITABLE` (not approved), `REVISION_NOT_WRITABLE` (no copy to discard).
 * `REVISION_WRITE_FAILED` may come after the write committed: re-read the intro.
 */
export function discardIntroHead(actor: Actor, input: unknown): Promise<Result<CaseStudyRevision>> {
  return makeDiscardIntroHead(introDeps())(actor, input);
}

/**
 * Starts a client's intro-and-outro draft after its save (Story 3.11, **Aggiungi** and
 * **Salva**): input `{ clientId }`; `enqueue` is `jobs.enqueue` (passed in: jobs imports
 * this module). A client with no intro, or whose intro is in Bozza, needs at least 2
 * images (`NO_CLIENT_IMAGES`: no intro, no job); then its intro is created if needed, one
 * `generate` job is enqueued (idempotent: a double click gets the same live job) and the
 * intro moves to `generating`. Returns `{ outcome: "started", introId, jobId }`, or
 * `{ outcome: "unchanged", introId, status }` for an intro in any other status (nothing
 * written). Call only after `authorize(actor, 'manage clients')`. Errors: `INVALID_INPUT`,
 * `CLIENT_NOT_FOUND`, `NO_CLIENT_IMAGES`, the lookups', the enqueue's and the transition's.
 */
export function startClientIntro(actor: Actor, input: unknown, enqueue: EnqueueGenerate): Promise<Result<ClientIntroStart>> {
  return makeStartClientIntro({ ...introDeps(), clients: createSupabaseClientRepository(), enqueue })(actor, input);
}

/**
 * A client's non-deleted files in position order, with no signed URLs. Module-only: the
 * generate worker reads the intro's images; no authorization of its own, so call only
 * after the caller's. Errors: `INVALID_INPUT`, `CLIENT_LOOKUP_FAILED`, `CLIENT_INVALID`.
 */
export async function listClientAssets(clientId: unknown): Promise<Result<ClientAsset[]>> {
  const parsed = parseInput(z.uuid(), clientId);
  if (!parsed.ok) return parsed;
  return createSupabaseClientRepository().listAssets(parsed.value);
}

/**
 * Saves the order of a client's cases (Story 4.12b): input `{ clientId, caseIds }`, the case
 * ids in the order wanted, each once; any saved order is replaced. Every id must be one of the
 * client's own non-deleted cases. The client's file and its pack (B5) then list its approved
 * cases in that order (`listClientCasesInOrder`). Changes no case, intro or revision. Call only
 * after `authorize(actor, 'manage clients')`. `INVALID_INPUT` (also a foreign, unknown, deleted
 * or repeated id), `CLIENT_NOT_FOUND`; nothing is written on any error.
 */
export function setClientCaseOrder(actor: Actor, input: unknown): Promise<Result<ClientCaseOrder>> {
  return makeSetClientCaseOrder(createSupabaseClientCaseOrderRepository())(actor, input);
}

/**
 * A client's approved, non-deleted cases in the client's order (Story 4.12b, `orderClientCases`):
 * its saved order, then any approved case not in it (approved later), newest created first;
 * with no saved order, newest created first. Saved ids no longer approved or gone are skipped.
 * For the client's file now and its pack (B5). A saved order that can't be read is logged and
 * left out (newest created first). `INVALID_INPUT` for a malformed id; otherwise `err` only when
 * the cases' read fails.
 */
export function listClientCasesInOrder(clientId: unknown): Promise<Result<ListedCaseStudy[]>> {
  return makeListClientCasesInOrder(createSupabaseCaseStudyRepository(), createSupabaseClientCaseOrderRepository())(clientId);
}

/**
 * The client's saved case order as stored (case ids, gone or no-longer-approved ones included),
 * or null when it has none (Story 4.12b): what a reorder in the client's file keeps the cases it
 * doesn't show in. `INVALID_INPUT` for a malformed id; otherwise `err` only when the read fails.
 */
export function getClientCaseOrder(clientId: unknown): Promise<Result<string[] | null>> {
  return makeGetClientCaseOrder(createSupabaseClientCaseOrderRepository())(clientId);
}
