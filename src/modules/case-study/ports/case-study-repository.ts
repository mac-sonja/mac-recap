import type { CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStudy, CreateCaseStudyInput, ListScope, UpdateCaseStudyDetailsInput } from "@/modules/case-study/domain/case-study";
import type { TransitionEvent } from "@/modules/case-study/domain/transition";
import type { CaseStatus } from "@/shared/case-status";
import type { Result } from "@/shared/result";

export interface NewCaseEvent {
  caseId: string;
  actorId: string;
  type: string;
  revisionId: string | null;
  data: CaseEvent["data"];
}

/** Reads and writes `case_study` and `case_event`. Implemented by `adapters/supabase/case-study-repository.ts`. */
export interface CaseStudyRepository {
  /** Inserts the case and its `case_created` event atomically; `err` only when the write fails. */
  create(input: CreateCaseStudyInput, actorId: string): Promise<Result<CaseStudy>>;
  /**
   * Saves a draft's name, year, locale and business line, with a `case_details_updated`
   * event when something changed, atomically. A year change takes the next number for
   * (client, new year) and a new code; the old number is never reused. `err NOT_FOUND` (unknown or soft-deleted),
   * `err STALE_STATUS` (no longer a draft), otherwise `err` only when the write fails.
   * Nothing is written on any `err`.
   */
  updateDetails(input: UpdateCaseStudyDetailsInput, actorId: string): Promise<Result<CaseStudy>>;
  /** `ok(null)` when no non-deleted case has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<CaseStudy | null>>;
  /**
   * Every non-deleted case within `scope` (only `scope.status` when given), newest
   * `updated_at` first; `err` only when the read fails or a row fails validation.
   */
  list(scope: ListScope): Promise<Result<CaseStudy[]>>;
  /** Appends one event; `ok(null)` when no case has `caseId`; `err REVISION_NOT_FOUND` for an unknown `revisionId`; otherwise `err` only when the write fails. */
  appendEvent(event: NewCaseEvent): Promise<Result<CaseEvent | null>>;
  /**
   * Compare-and-set: moves a non-deleted case from `from` to `to` and appends its
   * `transition` event `{ event, from, to }` atomically. `err NOT_FOUND` (unknown or
   * soft-deleted), `err STALE_STATUS` (status is no longer `from`), otherwise `err`
   * only when the write fails. Nothing is written on any `err`.
   */
  transition(change: StatusChange): Promise<Result<CaseStudy>>;
  /**
   * Soft-deletes a non-deleted draft (`deleted_at`) and appends its `case_deleted` event
   * atomically. `err NOT_FOUND` (unknown or already deleted), `err CASE_NOT_DELETABLE`
   * (no longer a draft), otherwise `err` only when the write fails. Nothing is written
   * on any `err`; no row or object is ever removed.
   */
  softDelete(caseId: string, actorId: string): Promise<Result<void>>;
  /**
   * When each of `caseIds` last entered `in_review`: the `at` of its newest
   * `transition` event whose `data.to` is `in_review`, keyed by case id. A case with
   * no such event is absent. `err` only when the read fails (logged).
   */
  reviewSince(caseIds: readonly string[]): Promise<Result<Map<string, string>>>;
}

export interface StatusChange {
  caseId: string;
  event: TransitionEvent;
  from: CaseStatus;
  to: CaseStatus;
  actorId: string;
}
