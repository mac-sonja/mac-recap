import type { CaseResult, CaseTestimonial, DetailsForm, FormField } from "@/modules/material/domain/details-form";
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
  /**
   * Replaces a live case's results through `save_case_results` (the row is created on
   * the first change; other fields untouched) and returns the previous list (`[]` when
   * never saved). Saving the stored list again writes nothing. `err NOT_FOUND`, or
   * `err INVALID_INPUT` naming `results` when the table check refuses it; nothing changes then.
   */
  saveResults(caseId: string, results: readonly CaseResult[], actorId: string): Promise<Result<CaseResult[]>>;
  /**
   * Replaces a live case's testimonial through `save_case_testimonial` and returns the
   * previous pair (both `""` when never saved), like `saveResults`. `err NOT_FOUND`, or
   * `err INVALID_INPUT` naming `quote` or `author` when a table check refuses it.
   */
  saveTestimonial(caseId: string, quote: string, author: string, actorId: string): Promise<Result<CaseTestimonial>>;
  /** The case's form; every text `""` and no results when the case has no row. Does not check the case. */
  read(caseId: string): Promise<Result<DetailsForm>>;
}
