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
  /** `ok(null)` when no revision has this id; `err` only when the lookup itself fails. Documents as stored. */
  findById(id: string): Promise<Result<Revision | null>>;
}
