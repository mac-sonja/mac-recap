import type { Revision, RevisionManifest, RevisionMeta } from "@/modules/case-study/domain/revision";
import type { Result } from "@/shared/result";

export interface NewWorkingRevision {
  caseId: string;
  /** Already validated by `generation.validateNewDocument`. */
  doc: object;
  manifest: RevisionManifest;
  meta: RevisionMeta;
  expectedHeadVersion: number;
  actorId: string;
}

export interface RevisionDocSave {
  revisionId: string;
  /** Already validated by `generation.validateNewDocument`. */
  doc: object;
  expectedVersion: number;
  actorId: string;
}

export interface RevisionApproval {
  caseId: string;
  revisionId: string;
  expectedRevisionVersion: number;
  expectedHeadVersion: number;
  actorId: string;
}

export interface HeadFork {
  caseId: string;
  expectedHeadVersion: number;
  actorId: string;
}

export interface HeadDiscard {
  caseId: string;
  revisionId: string;
  expectedHeadVersion: number;
  actorId: string;
}

/** Reads and writes `revision`. Implemented by `adapters/supabase/revision-repository.ts`. */
export interface RevisionRepository {
  /**
   * Inserts a `working` revision (`generated_doc = doc`), makes it the case's head by
   * compare-and-set on `head_version`, supersedes a previous `working` head and writes
   * one `revision_created` event, atomically. `err NOT_FOUND` (unknown or soft-deleted
   * case), `err STALE_HEAD` (`head_version` is no longer `expectedHeadVersion`),
   * otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  createWorking(input: NewWorkingRevision): Promise<Result<Revision>>;
  /**
   * Writes `doc` to the `working` head revision of an `in_review` case, or of an `approved`
   * case's fork (Story 4.9), by compare-and-set on `version` (then incremented), with one
   * `revision_saved` event, atomically. `err NOT_FOUND`, `STALE_HEAD` (no longer the head),
   * `CASE_NOT_EDITABLE` (case neither `in_review` nor an approved case's fork), `REVISION_NOT_WRITABLE` (not `working`), `STALE_REVISION` (`version`
   * moved), otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  saveDoc(input: RevisionDocSave): Promise<Result<Revision>>;
  /**
   * Approves the `working` head of an `in_review` case (Story 4.8) by compare-and-set on
   * `version` and `head_version`: the revision `approved`, the case `approved` with
   * `approved_revision_id`, a `transition` and a `revision_approved` event, atomically.
   * `err NOT_FOUND`, `STALE_HEAD`, `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE`,
   * `STALE_REVISION`, otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  approve(input: RevisionApproval): Promise<Result<Revision>>;
  /**
   * Makes the `working` fork of an `approved` case the approved revision (Story 4.9) by
   * compare-and-set on `version` and `head_version`: the fork `approved`, the previous
   * approved revision `superseded`, `approved_revision_id` the fork, one
   * `approved_version_updated` event, atomically. The case stays `approved`.
   * `err NOT_FOUND`, `STALE_HEAD`, `CASE_NOT_APPROVABLE` (not `approved`),
   * `REVISION_NOT_WRITABLE` (not a working fork), `STALE_REVISION`, otherwise `err` only when
   * the write fails. Nothing is written on any `err`.
   */
  updateApproved(input: RevisionApproval): Promise<Result<Revision>>;
  /**
   * Forks the head of an `approved` case (Story 4.9): a `working` copy of the approved
   * revision made the head by compare-and-set on `head_version` (then incremented), with one
   * `revision_forked` event, atomically; or the existing working copy, writing nothing.
   * Returns it with the case's `headVersion` after the call. `err NOT_FOUND`,
   * `CASE_NOT_EDITABLE` (not `approved`), `REVISION_NOT_WRITABLE`, `STALE_HEAD`, otherwise
   * `err` only when the write fails. Nothing is written on any `err`.
   */
  forkHead(input: HeadFork): Promise<Result<{ revision: Revision; headVersion: number }>>;
  /**
   * Drops the working fork of an `approved` case (Story 4.9): the fork `superseded`, the head
   * back on the approved revision by compare-and-set on `head_version` (then incremented), one
   * `revision_discarded` event, atomically. Returns the approved revision. `err NOT_FOUND`,
   * `STALE_HEAD`, `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE`, otherwise `err` only when the
   * write fails. Nothing is written on any `err`.
   */
  discardHead(input: HeadDiscard): Promise<Result<Revision>>;
  /** `ok(null)` when no revision has this id; `err` only when the lookup itself fails. Documents as stored. */
  findById(id: string): Promise<Result<Revision | null>>;
}
