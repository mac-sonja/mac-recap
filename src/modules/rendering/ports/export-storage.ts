import type { ExportRecordFormat } from "@/modules/rendering/domain/export";
import type { Result } from "@/shared/result";

/**
 * Export files in the private `rendering` bucket, at `exports/{contentHash}/{format}.{ext}`
 * (a bundle of several formats, Story 5.4: `exports/{contentHash}/bundle.zip`).
 * Implemented by `adapters/supabase/export-storage.ts`, the only place that key is built.
 */
export interface ExportStorage {
  /** Stores the file of `{ contentHash, format }` (replacing a partial earlier attempt) and returns its path. */
  upload(target: { contentHash: string; format: ExportRecordFormat }, bytes: Uint8Array): Promise<Result<{ path: string }>>;
  /** The bytes of a stored export (Story 5.4: a bundle zips the formats' stored files). */
  read(path: string): Promise<Result<Uint8Array>>;
  /** A signed GET of a stored export, valid `ttlSeconds` (at most 15 minutes), that downloads as `fileName`. */
  presignDownload(path: string, ttlSeconds: number, fileName: string): Promise<Result<string>>;
}
