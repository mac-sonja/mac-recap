import type { Client } from "@/modules/case-study/domain/case-study";
import type { Result } from "@/shared/result";

/** Reads `client`. Implemented by `adapters/supabase/client-repository.ts`. */
export interface ClientRepository {
  /** Every client, ordered by name; `err` only when the read fails or a row fails validation. */
  list(): Promise<Result<Client[]>>;
}
