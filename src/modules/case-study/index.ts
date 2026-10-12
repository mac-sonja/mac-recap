// Public surface of the case-study module. Code outside this module imports only this file.
// The module owns `case_study` and `case_event` (AD-11): nobody else writes them.
import type { Actor } from "@/modules/access";
import { createSupabaseCaseStudyRepository } from "@/modules/case-study/adapters/supabase/case-study-repository";
import { makeCreateCaseStudy } from "@/modules/case-study/application/create-case-study";
import { makeGetCaseStudy } from "@/modules/case-study/application/get-case-study";
import { makeRecordEvent } from "@/modules/case-study/application/record-event";
import type { CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

export { CASE_CREATED } from "@/modules/case-study/domain/case-event";
export type { CaseEvent, RecordEventInput } from "@/modules/case-study/domain/case-event";
export { LOCALES, YEAR_MAX, YEAR_MIN } from "@/modules/case-study/domain/case-study";
export type { CaseStudy, CreateCaseStudyInput, Locale } from "@/modules/case-study/domain/case-study";
export type { FieldIssue } from "@/modules/case-study/domain/validation";

/**
 * Creates a case study (status `draft`, permanent DB-generated id) and its
 * `case_created` event in one transaction. Call only after `authorize(actor, 'create case')`.
 * `INVALID_INPUT` names each failing field in `details.fields`.
 */
export function create(actor: Actor, input: unknown): Promise<Result<CaseStudy>> {
  return makeCreateCaseStudy(createSupabaseCaseStudyRepository())(actor, input);
}

/** One case study by id; unknown, malformed or soft-deleted ids are `NOT_FOUND`. */
export function get(id: unknown): Promise<Result<CaseStudy>> {
  return makeGetCaseStudy(createSupabaseCaseStudyRepository())(id);
}

/**
 * Appends one `case_event` row (`{ caseId, type, revisionId?, data? }`) with the actor.
 * Every mutation logs through here; an unknown case is `NOT_FOUND`.
 */
export function recordEvent(actor: Actor, input: unknown): Promise<Result<CaseEvent>> {
  return makeRecordEvent(createSupabaseCaseStudyRepository())(actor, input);
}
