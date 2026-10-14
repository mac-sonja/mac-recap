import type { Actor } from "@/modules/access";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { DetailsFormRepository } from "@/modules/material/ports/details-form-repository";
import type { ObjectStorage } from "@/modules/material/ports/object-storage";
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

export interface MaterialDeps {
  assets: AssetRepository;
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
