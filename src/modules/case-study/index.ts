// Public surface of the case-study module. Code outside this module imports only this file.
// The module owns `case_study`, `client`, `client_sector`, `client_logo`, `client_brief`, `client_asset`,
// `case_number_counter`, `case_event` and `revision`, and the `material` bucket's
// `clients/{clientId}/logos/**` and `clients/{clientId}/material/**` (AD-1, AD-22):
// nobody else writes them.
import { randomUUID } from "node:crypto";
import type { Actor } from "@/modules/access";
import { listCaseActivity } from "@/modules/case-study/adapters/supabase/case-activity";
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
import { makeListClientMaterial } from "@/modules/case-study/application/list-client-material";
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
import { makeRecordEvent } from "@/modules/case-study/application/record-event";
import {
  makeCreateWorkingRevision,
  makeGetEditableRevision,
  makeGetLiveRevision,
  type CaseStudyRevision,
} from "@/modules/case-study/application/revisions";
import { createSupabaseRevisionRepository } from "@/modules/case-study/adapters/supabase/revision-repository";
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
  ListScope,
} from "@/modules/case-study/domain/case-study";
import type { ListedClientAsset } from "@/modules/case-study/domain/client-material";
import type { ClientMaterialStorage } from "@/modules/case-study/ports/client-material-storage";
import type { LogoStorage } from "@/modules/case-study/ports/logo-storage";
import type { Result } from "@/shared/result";

export { CASE_CREATED, CASE_DELETED, CASE_DETAILS_UPDATED, TRANSITION } from "@/modules/case-study/domain/case-event";
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
} from "@/modules/case-study/domain/client-material";
export type { PresignedClientMaterial } from "@/modules/case-study/application/request-client-material-upload";
export type { PresignedClientLogoUpload } from "@/modules/case-study/application/request-client-logo-upload";
export type {
  ClientBriefFieldSaved,
  ClientResultsSaved,
  ClientTestimonialSaved,
} from "@/modules/case-study/application/save-client-brief-field";
export type { ClientDeleted } from "@/modules/case-study/application/delete-client";
export { TRANSITION_EVENTS } from "@/modules/case-study/domain/transition";
export { REVISION_CREATED, REVISION_STATUSES } from "@/modules/case-study/domain/revision";
export type {
  CreateWorkingRevisionInput,
  RevisionManifest,
  RevisionMeta,
  RevisionStatus,
  RevisionSubject,
} from "@/modules/case-study/domain/revision";
export type { CaseStudyRevision } from "@/modules/case-study/application/revisions";
export type { TransitionEvent } from "@/modules/case-study/domain/transition";
export type { FieldIssue } from "@/modules/case-study/domain/validation";

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
 * Deletes a draft (Story 4.1, AR3): input `{ caseId }`. The case gets `deleted_at` and
 * one `case_deleted` event with the actor, in one transaction; it then disappears from
 * every list and read. Nothing is hard-deleted: rows, material, events and its number
 * stay. Call only after `authorize(actor, 'delete case', { status: 'draft' })`.
 * `INVALID_INPUT`, `NOT_FOUND` (unknown or already deleted), `CASE_NOT_DELETABLE` (no
 * longer a draft); nothing is written on any error.
 */
export function deleteCaseStudy(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeDeleteCaseStudy(createSupabaseCaseStudyRepository())(actor, input);
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
 * The Dashboard's *Attività*: the newest events of the cases within `scope` (the
 * same scope as `list`, derived and authorized the same way), each with who did it
 * and which case. A malformed scope is `INVALID_INPUT`.
 */
export async function listActivity(scope: ListScope): Promise<Result<CaseActivity[]>> {
  const parsed = parseInput(listScopeSchema, scope);
  if (!parsed.ok) return parsed;
  return listCaseActivity(parsed.value, ACTIVITY_LIMIT);
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
 * Removes one client file at once, with no undo: input `{ clientId, assetId }`. Its
 * row and object are deleted; a failed object delete is logged and never fails the
 * removal. Call only after `authorize(actor, 'manage clients')`. Errors:
 * `INVALID_INPUT`, `NOT_FOUND` (unknown file, or another client's), `CLIENT_NOT_FOUND`, `CLIENT_WRITE_FAILED`.
 */
export function removeClientMaterial(actor: Actor, input: unknown): Promise<Result<void>> {
  return makeRemoveClientMaterial(clientMaterialDeps())(actor, input);
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
  return { cases: createSupabaseCaseStudyRepository(), revisions: createSupabaseRevisionRepository() };
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
 * The live revision of a subject (`{ kind: "case", id }`): the approved one, or
 * `null` when none is approved. Documents are upgraded to the current schema in
 * memory, never written back. Errors: `INVALID_INPUT` (malformed subject),
 * `SUBJECT_NOT_SUPPORTED` (`{ kind: "client_intro" }`, until Story 3.9), `NOT_FOUND`
 * (unknown or soft-deleted case), `REVISION_POINTER_INVALID` (the pointed revision is
 * missing, another case's, or not `approved`; logged), `CASE_STUDY_LOOKUP_FAILED`,
 * `CASE_STUDY_INVALID`, `REVISION_LOOKUP_FAILED`, `REVISION_INVALID` (the row),
 * `DOCUMENT_INVALID` and `DOCUMENT_SCHEMA_UNSUPPORTED` (a stored document that does
 * not upgrade).
 */
export function getLiveRevision(subject: unknown): Promise<Result<CaseStudyRevision | null>> {
  return makeGetLiveRevision(revisionDeps())(subject);
}

/**
 * The editable revision of a subject (`{ kind: "case", id }`): the head, or
 * `null` when it has none. Same upgrade and errors as `getLiveRevision`, except
 * that the head may have any status (`REVISION_POINTER_INVALID` only when it is
 * missing or another case's).
 */
export function getEditableRevision(subject: unknown): Promise<Result<CaseStudyRevision | null>> {
  return makeGetEditableRevision(revisionDeps())(subject);
}
