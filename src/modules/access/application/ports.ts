import type { Profile } from "@/modules/access/domain/actor";
import type { Result } from "@/shared/result";

/** Reads `profile` rows. Implemented by `adapters/supabase/profile-repository.ts`. */
export interface ProfileRepository {
  /** `ok(null)` when no row has this id; `err` only when the lookup itself fails. */
  findById(id: string): Promise<Result<Profile | null>>;
}
