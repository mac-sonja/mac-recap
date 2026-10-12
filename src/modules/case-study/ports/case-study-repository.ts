import type { CaseEvent } from "@/modules/case-study/domain/case-event";
import type { CaseStudy, CreateCaseStudyInput } from "@/modules/case-study/domain/case-study";
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
  /** `ok(null)` when no non-deleted case has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<CaseStudy | null>>;
  /** Appends one event; `ok(null)` when no case has `caseId`; `err` only when the write fails. */
  appendEvent(event: NewCaseEvent): Promise<Result<CaseEvent | null>>;
  /**
   * Compare-and-set: moves a non-deleted case from `from` to `to` and appends its
   * `transition` event `{ event, from, to }` atomically. `err NOT_FOUND` (unknown or
   * soft-deleted), `err STALE_STATUS` (status is no longer `from`), otherwise `err`
   * only when the write fails. Nothing is written on any `err`.
   */
  transition(change: StatusChange): Promise<Result<CaseStudy>>;
}

export interface StatusChange {
  caseId: string;
  event: TransitionEvent;
  from: CaseStatus;
  to: CaseStatus;
  actorId: string;
}
