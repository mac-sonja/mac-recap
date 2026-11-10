import type { ClientIntro } from "@/modules/case-study/domain/client-intro";
import type { ReadyDraft } from "@/modules/case-study/domain/ready-draft";
import type { Revision, RevisionManifest, RevisionMeta } from "@/modules/case-study/domain/revision";
import type { TransitionEvent } from "@/modules/case-study/domain/transition";
import type { CaseStatus } from "@/shared/case-status";
import type { Result } from "@/shared/result";

export interface IntroStatusChange {
  clientIntroId: string;
  event: TransitionEvent;
  from: CaseStatus;
  to: CaseStatus;
  actorId: string;
}

export interface IntroDocSave {
  revisionId: string;
  /** Already validated by `generation.validateNewDocument`, of kind `client_intro`. */
  doc: object;
  expectedVersion: number;
  actorId: string;
}

export interface IntroApproval {
  clientIntroId: string;
  revisionId: string;
  expectedRevisionVersion: number;
  expectedHeadVersion: number;
  actorId: string;
}

/** Story 4.11b: the approved intro whose head is forked, and the `head_version` it was read at. */
export interface IntroHeadFork {
  clientIntroId: string;
  expectedHeadVersion: number;
  actorId: string;
}

/** Story 4.11b: the approved intro's working copy to discard, and the `head_version` it was read at. */
export interface IntroHeadDiscard {
  clientIntroId: string;
  revisionId: string;
  expectedHeadVersion: number;
  actorId: string;
}

export interface NewIntroWorkingRevision {
  clientIntroId: string;
  /** Already validated by `generation.validateNewDocument`, of kind `client_intro`. */
  doc: object;
  manifest: RevisionManifest;
  meta: RevisionMeta;
  expectedHeadVersion: number;
  actorId: string;
}

/**
 * Reads and writes `client_intro` and `client_event` (Story 3.11), and creates intro
 * revisions. Implemented by `adapters/supabase/client-intro-repository.ts`. An intro whose
 * client is deleted is ignored by every read and refused by every write.
 */
export interface ClientIntroRepository {
  /** `ok(null)` when no intro of a non-deleted client has this id; `err` only when the lookup fails. */
  findById(id: string): Promise<Result<ClientIntro | null>>;
  /** The intro of a non-deleted client, `ok(null)` when it has none; `err` only when the lookup fails. */
  findByClientId(clientId: string): Promise<Result<ClientIntro | null>>;
  /**
   * The client's intro, created (Bozza, with one `client_intro_created` event) when it has
   * none, atomically; concurrent calls create one. `err CLIENT_NOT_FOUND` (unknown or
   * deleted client), otherwise `err` only when the write fails.
   */
  getOrCreate(clientId: string, actorId: string): Promise<Result<ClientIntro>>;
  /**
   * Compare-and-set: moves an intro from `from` to `to` and appends its `transition` client
   * event `{ event, from, to }` atomically. `err NOT_FOUND`, `err STALE_STATUS`, otherwise
   * `err` only when the write fails. Nothing is written on any `err`.
   */
  transition(change: IntroStatusChange): Promise<Result<ClientIntro>>;
  /**
   * Inserts a `working` revision of the intro (`generated_doc = doc`), makes it the head by
   * compare-and-set on `head_version`, supersedes a previous `working` head and writes one
   * `revision_created` client event, atomically. `err NOT_FOUND`, `err STALE_HEAD`, otherwise
   * `err` only when the write fails. Nothing is written on any `err`.
   */
  createWorkingRevision(input: NewIntroWorkingRevision): Promise<Result<Revision>>;
  /**
   * Story 4.11a: writes `doc` to the `working` head revision of an `in_review` intro (or,
   * Story 4.11b, of an approved intro's working copy) by compare-and-set on `version` (then
   * incremented), with one `revision_saved` client event, atomically. `err NOT_FOUND`,
   * `STALE_HEAD` (no longer the head), `CASE_NOT_EDITABLE` (the intro is neither `in_review`
   * nor approved with a working copy), `REVISION_NOT_WRITABLE` (not `working`), `STALE_REVISION`
   * (`version` moved), otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  saveDoc(input: IntroDocSave): Promise<Result<Revision>>;
  /**
   * Story 4.11a: approves the `working` head of an `in_review` intro by compare-and-set on
   * `version` and `head_version`: the revision `approved`, the intro `approved` with
   * `approved_revision_id`, a `transition` and a `revision_approved` client event, atomically.
   * `err NOT_FOUND`, `STALE_HEAD`, `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE`,
   * `STALE_REVISION`, otherwise `err` only when the write fails. Nothing is written on any `err`.
   */
  approve(input: IntroApproval): Promise<Result<Revision>>;
  /**
   * Story 4.11b (**Aggiorna la versione approvata**): makes the `working` copy, the head of an
   * approved intro, its approved revision by compare-and-set on `version` and `head_version`;
   * the previous approved revision becomes `superseded`, the intro stays `approved`, with one
   * `approved_version_updated` client event, atomically. `err NOT_FOUND`, `STALE_HEAD`,
   * `CASE_NOT_APPROVABLE`, `REVISION_NOT_WRITABLE`, `STALE_REVISION`, otherwise `err` only when
   * the write fails. Nothing is written on any `err`.
   */
  updateApproved(input: IntroApproval): Promise<Result<Revision>>;
  /**
   * Story 4.11b: forks the head of an approved intro (a `working` copy of the approved
   * revision, made the head by compare-and-set on `head_version`, with one `revision_forked`
   * client event), or returns the copy that already exists with nothing written. `err
   * NOT_FOUND`, `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE`, `STALE_HEAD`, otherwise `err`
   * only when the write fails.
   */
  forkHead(input: IntroHeadFork): Promise<Result<{ revision: Revision; headVersion: number }>>;
  /**
   * Story 4.11b: supersedes an approved intro's working copy and points the head back at the
   * approved revision by compare-and-set on `head_version`, with one `revision_discarded`
   * client event, atomically; returns the approved revision. `err NOT_FOUND`, `STALE_HEAD`,
   * `CASE_NOT_EDITABLE`, `REVISION_NOT_WRITABLE`, otherwise `err` only when the write fails.
   */
  discardHead(input: IntroHeadDiscard): Promise<Result<Revision>>;
  /**
   * Story 3.8 for intros: the intros Da approvare of non-deleted clients with a
   * `generation_succeeded` transition after `since` that follows their latest `generate`,
   * made by `actorId`. One entry per intro (kind `client_intro`, the client's id and name),
   * oldest first. `err` only when a read fails.
   */
  listReadyIntros(actorId: string, since: string): Promise<Result<ReadyDraft[]>>;
}
