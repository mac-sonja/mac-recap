// Public surface of the case-study module. Code outside this module imports only this file.
// The module owns `case_study`, `client`, `case_number_counter` and `case_event` (AD-1):
// nobody else writes them.
import type { Actor } from "@/modules/access";
import { createSupabaseCaseStudyRepository } from "@/modules/case-study/adapters/supabase/case-study-repository";
import { createSupabaseClientRepository } from "@/modules/case-study/adapters/supabase/client-repository";
import { makeCreateCaseStudy } from "@/modules/case-study/application/create-case-study";
import { makeCreateClient } from "@/modules/case-study/application/create-client";
import { makeGetCaseStudy } from "@/modules/case-study/application/get-case-study";
import { makeGetClient } from "@/modules/case-study/application/get-client";
import { makeListCaseStudies } from "@/modules/case-study/application/list-case-studies";
import { makeListClientSummaries } from "@/modules/case-study/application/list-client-summaries";
import { makeListClients } from "@/modules/case-study/application/list-clients";
import { makeRecordEvent } from "@/modules/case-study/application/record-event";
import { makeRenameClient } from "@/modules/case-study/application/rename-client";
import { makeTransition } from "@/modules/case-study/application/transition";
import type { CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStudy, Client, ClientSummary, ListScope } from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

export { CASE_CREATED, TRANSITION } from "@/modules/case-study/domain/case-event";
export type { CaseEvent, RecordEventInput } from "@/modules/case-study/domain/case-event";
export { CLIENT_NAME_MAX, LOCALES, YEAR_MAX, YEAR_MIN } from "@/modules/case-study/domain/case-study";
export type {
  CaseStudy,
  Client,
  ClientSummary,
  CreateCaseStudyInput,
  CreateClientInput,
  ListScope,
  Locale,
  RenameClientInput,
} from "@/modules/case-study/domain/case-study";
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
export function listClients(): Promise<Result<Client[]>> {
  return makeListClients(createSupabaseClientRepository())();
}

/**
 * Every client with its count of non-deleted case studies (`{ id, name, code,
 * caseCount }`), sorted by name. Call only after `authorize(actor, 'list clients')`.
 */
export function listClientSummaries(): Promise<Result<ClientSummary[]>> {
  return makeListClientSummaries(createSupabaseClientRepository())();
}

/**
 * One client by id; unknown or malformed ids are `CLIENT_NOT_FOUND`. Call only
 * after `authorize(actor, 'list clients')`.
 */
export function getClient(id: unknown): Promise<Result<Client>> {
  return makeGetClient(createSupabaseClientRepository())(id);
}

/**
 * Adds a client: input `{ name }` (1–120 characters after trimming); the code is
 * assigned automatically (AD-21). Call only after `authorize(actor, 'manage clients')`.
 * `INVALID_INPUT`, `CLIENT_NAME_TAKEN`, `CLIENT_CODE_EXHAUSTED`; nothing is written on any error.
 */
export function createClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeCreateClient(createSupabaseClientRepository())(actor, input);
}

/**
 * Renames a client: input `{ clientId, name }`. The client code and every case
 * history code stay the same. Call only after `authorize(actor, 'manage clients')`.
 * `INVALID_INPUT`, `CLIENT_NOT_FOUND`, `CLIENT_NAME_TAKEN`; nothing is written on any error.
 * Clients are never deleted: there is no delete.
 */
export function renameClient(actor: Actor, input: unknown): Promise<Result<Client>> {
  return makeRenameClient(createSupabaseClientRepository())(actor, input);
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
