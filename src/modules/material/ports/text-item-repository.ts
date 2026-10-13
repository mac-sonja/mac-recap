import type { TextItem } from "@/modules/material/domain/text-item";
import type { Result } from "@/shared/result";

export interface NewTextItem {
  caseId: string;
  title: string;
  body: string;
  createdBy: string;
}

export interface TextItemContent {
  title: string;
  body: string;
}

/** Reads and writes `text_item` (and answers `has_material`). Implemented by `adapters/supabase/text-item-repository.ts`. */
export interface TextItemRepository {
  /** Inserts a live text item with a DB-generated id. `err TEXT_EMPTY` if the DB rejects the body. */
  create(item: NewTextItem): Promise<Result<TextItem>>;
  /** The live text item of the case, or `ok(null)` when there is none (unknown, other case, or removed). */
  getLive(caseId: string, textItemId: string): Promise<Result<TextItem | null>>;
  /** Replaces title and body of a live text item; `ok(null)` when there is none. */
  update(caseId: string, textItemId: string, content: TextItemContent): Promise<Result<TextItem | null>>;
  /** Sets `deleted_at` on a live text item of the case; `ok(false)` when there is none. */
  softDelete(caseId: string, textItemId: string): Promise<Result<boolean>>;
  /**
   * Clears `deleted_at`: `ok(true)` restored, `ok(false)` it was already live
   * (nothing written), `err NOT_FOUND` when the case has no such text item.
   */
  restore(caseId: string, textItemId: string): Promise<Result<boolean>>;
  /** `has_material`: a live asset or a live, non-empty text item exists for the case. */
  hasMaterial(caseId: string): Promise<Result<boolean>>;
}
