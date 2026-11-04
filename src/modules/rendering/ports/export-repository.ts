import type { ExportRecord, NewExport } from "@/modules/rendering/domain/export";
import type { Result } from "@/shared/result";

/**
 * The `export` table (Story 5.3). Implemented by `adapters/supabase/export-repository.ts`.
 * Rows are immutable: there is no update or delete. `err` means the call itself failed.
 */
export interface ExportRepository {
  /** The export with this content hash, or `null`. */
  findByHash(contentHash: string): Promise<Result<ExportRecord | null>>;
  /** The export with this id, or `null`. */
  findById(id: string): Promise<Result<ExportRecord | null>>;
  /** Writes a new row; when a row with the same content hash exists, that one is returned and nothing is written. */
  insert(row: NewExport): Promise<Result<ExportRecord>>;
}
