import type { DeliverableKind, DeliverableLinks, TaxonomyTerm, TermKind } from "@/modules/material/domain/taxonomy";
import type { Result } from "@/shared/result";

export interface TermsTarget {
  caseId: string;
  refKind: DeliverableKind;
  refId: string;
  kind: TermKind;
  /** Distinct keys; `[]` clears that kind. */
  keys: string[];
}

/** Reads `taxonomy_term` and reads/writes `material_term`. Implemented by `adapters/supabase/taxonomy-repository.ts`. */
export interface TaxonomyRepository {
  /** Every term, ordered by label then key; `[]` when nothing is seeded. */
  listTerms(): Promise<Result<TaxonomyTerm[]>>;
  /**
   * Replaces the deliverable's terms of `kind` with `keys` in one transaction and
   * returns the keys of that kind it had before. `err NOT_FOUND` (case or live
   * deliverable missing) or `err UNKNOWN_TERM` (naming the key); nothing changes then.
   */
  setTerms(target: TermsTarget): Promise<Result<string[]>>;
  /** The links of every live deliverable of a live case (untagged ones with `terms: []`). */
  caseTerms(caseId: string): Promise<Result<DeliverableLinks[]>>;
}
