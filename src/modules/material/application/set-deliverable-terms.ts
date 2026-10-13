import type { Actor } from "@/modules/access";
import { isTermKey, setTermsInputSchema, TERMS_SET, unknownTerm, type TermsSet } from "@/modules/material/domain/taxonomy";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Replaces one live deliverable's terms of one kind (`{ caseId, refKind, refId,
 * kind, keys }`; duplicates ignored, keys sorted, `[]` clears that kind) and records
 * `terms_set { refKind, refId, kind, keys }` (keys only). The other kinds are
 * untouched. Errors: `INVALID_INPUT`, `UNKNOWN_TERM` (naming the key: unknown,
 * malformed or of another kind), `NOT_FOUND` (case, or live deliverable of that
 * case). If the event write fails the previous keys are put back and the error
 * returned. Any case status; status never changes. Needs no storage. The caller
 * has already authorized `tag`.
 */
export function makeSetDeliverableTerms({ taxonomy, cases }: Pick<MaterialDeps, "taxonomy" | "cases">) {
  return async function setDeliverableTerms(actor: Actor, input: unknown): Promise<Result<TermsSet>> {
    const parsed = parseInput(setTermsInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, refKind, refId, kind } = parsed.value;
    // Sorted bytewise, matching the previous keys `set_material_terms` returns.
    const keys = [...new Set(parsed.value.keys)].sort();
    const malformed = keys.find((key) => !isTermKey(key));
    if (malformed !== undefined) return err(unknownTerm(malformed));

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const previous = await taxonomy.setTerms({ caseId, refKind, refId, kind, keys });
    if (!previous.ok) return previous;

    const event = await cases.recordEvent(actor, { caseId, type: TERMS_SET, data: { refKind, refId, kind, keys } });
    if (!event.ok) {
      const undone = await taxonomy.setTerms({ caseId, refKind, refId, kind, keys: previous.value });
      if (!undone.ok) {
        log.error("terms set without its terms_set event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok({ refKind, refId, kind, keys });
  };
}
