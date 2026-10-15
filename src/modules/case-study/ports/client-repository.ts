import type { Client, ClientSummary } from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

/** Reads and writes `client`. Implemented by `adapters/supabase/client-repository.ts`. There is no delete (AD-21). */
export interface ClientRepository {
  /** Every client, ordered by name; `err` only when the read fails or a row fails validation. */
  list(): Promise<Result<Client[]>>;
  /**
   * Every client with the number of its non-deleted case studies, ordered by name;
   * `err` only when the read fails or a row fails validation.
   */
  listWithCaseCounts(): Promise<Result<ClientSummary[]>>;
  /** `ok(null)` when no client has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<Client | null>>;
  /**
   * Adds a client through `create_client`, which assigns the code (AD-21).
   * `err CLIENT_NAME_TAKEN` / `CLIENT_CODE_EXHAUSTED`, otherwise `err` only when the
   * write fails. Nothing is written on any `err`.
   */
  create(name: string, actorId: string): Promise<Result<Client>>;
  /**
   * Renames a client through `rename_client`; the code never changes.
   * `err CLIENT_NOT_FOUND` / `CLIENT_NAME_TAKEN`, otherwise `err` only when the write
   * fails. Nothing is written on any `err`.
   */
  rename(id: string, name: string, actorId: string): Promise<Result<Client>>;
}
