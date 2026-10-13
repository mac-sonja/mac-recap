import type { DetailsForm, FormField } from "@/modules/material/domain/details-form";
import type { Result } from "@/shared/result";

/** Reads and writes `context_form`. Implemented by `adapters/supabase/details-form-repository.ts`. */
export interface DetailsFormRepository {
  /**
   * Saves one field of a live case's form (creating the row on the first save
   * that changes something; other fields untouched) and returns its previous
   * text (`""` when never saved). Saving the stored text again writes nothing.
   * `err NOT_FOUND` (case unknown or soft-deleted) or `err UNKNOWN_FIELD`; nothing changes then.
   */
  saveField(caseId: string, field: FormField, text: string, actorId: string): Promise<Result<string>>;
  /** The case's form; every field `""` when the case has no row. Does not check the case. */
  read(caseId: string): Promise<Result<DetailsForm>>;
}
