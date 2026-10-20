import type { Actor } from "@/modules/access";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { DetailsFormRepository } from "@/modules/material/ports/details-form-repository";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
import type { RenditionRepository } from "@/modules/material/ports/rendition-repository";
import { err, type Result } from "@/shared/result";

/** The case-study calls material needs (wired to `@/modules/case-study` in index.ts). */
export interface CaseStudies {
  /** `NOT_FOUND` for an unknown or soft-deleted case. */
  get(id: unknown): Promise<Result<unknown>>;
  /** Appends one `case_event` with the actor. */
  recordEvent(
    actor: Actor,
    input: { caseId: string; type: string; data: Record<string, string | string[]> },
  ): Promise<Result<unknown>>;
}

/** The jobs call material needs (wired to `@/modules/jobs` in index.ts). */
export interface Jobs {
  /** Idempotent enqueue of `{ kind, subjectId, inputHash, payload }`. */
  enqueue(input: { kind: "rendition"; subjectId: string; inputHash: string; payload: { caseId: string } }): Promise<Result<unknown>>;
  /** Which of the assets have a `rendition` job queued or running (one read). */
  liveSubjects(input: { kind: "rendition"; subjectIds: string[] }): Promise<Result<string[]>>;
}

export interface MaterialDeps {
  assets: AssetRepository;
  /** Display renditions of case images and videos (Story 3.2). */
  renditions: RenditionRepository;
  jobs: Jobs;
  /** The details form (never needs storage; never material). */
  form: DetailsFormRepository;
  /** `null` on the paths that never need storage (details form, refs, favourites); use cases answer `STORAGE_NOT_CONFIGURED` then. */
  storage: ObjectStorage | null;
  cases: CaseStudies;
  /** Generates asset ids at presign. */
  newId: () => string;
}

export const storageNotConfigured = () =>
  err({ code: "STORAGE_NOT_CONFIGURED", message: "File storage is not configured." });
