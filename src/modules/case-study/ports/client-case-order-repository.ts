import type { Result } from "@/shared/result";

/**
 * Reads and writes `client_case_order` (Story 4.12b): one saved order of case ids per client.
 * Implemented by `adapters/supabase/client-case-order-repository.ts`.
 */
export interface ClientCaseOrderRepository {
  /** The client's saved case ids in order; `ok(null)` when it has none. `err` only when the read fails. */
  find(clientId: string): Promise<Result<string[] | null>>;
  /**
   * Saves the client's order through `set_client_case_order`, replacing any saved one, and
   * returns it. `err INVALID_INPUT` (an id that isn't one of the client's own non-deleted
   * cases, or repeated) / `CLIENT_NOT_FOUND` (unknown or deleted client), otherwise `err` only
   * when the write fails. Nothing is written on any `err`.
   */
  set(clientId: string, caseIds: readonly string[], actorId: string): Promise<Result<string[]>>;
}
