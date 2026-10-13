import { groupTerms, type TermsByKind } from "@/modules/material/domain/taxonomy";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Every taxonomy term grouped by kind (`{ tag, property, flag }`), each ordered
 * by label; a kind with nothing seeded is `[]`. Keys are the only identifiers;
 * labels are for display. The caller has already authorized `tag`.
 */
export function makeListTerms({ taxonomy }: Pick<MaterialDeps, "taxonomy">) {
  return async function listTerms(): Promise<Result<TermsByKind>> {
    const terms = await taxonomy.listTerms();
    if (!terms.ok) return terms;
    return ok(groupTerms(terms.value));
  };
}
