import type { ClientSector } from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

/**
 * Reads and adds to the shared sector list (`client_sector`). Implemented by
 * `adapters/supabase/client-sector-repository.ts`. Sectors are never renamed or deleted.
 */
export interface ClientSectorRepository {
  /** Every sector, in display order (the seeded four first, then the added ones as added); `err` only when the read fails. */
  list(): Promise<Result<ClientSector[]>>;
  /**
   * Adds a sector through `add_client_sector` (label already normalized), or returns
   * the one with the same name (case, accents and spaces aside), writing nothing.
   * `err SECTOR_LABEL_INVALID`, otherwise `err` only when the write fails.
   */
  add(label: string, actorId: string): Promise<Result<ClientSector>>;
}
