import type { Actor } from "@/modules/access";
import {
  DETAILS_SAVED,
  sameResults,
  saveCaseResultsInputSchema,
  type CaseResultsSaved,
  type CaseStoryLimits,
} from "@/modules/material/domain/details-form";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Replaces a case's results (`{ caseId, results }`; Story 2.21): at most 3 rows, each a
 * label and a value, trimmed and both required, within the client's limits; `[]` clears
 * them. Records `details_saved { field: 'results' }` (never the text). The row is created
 * on the first change; saving the stored list again writes nothing and records no event.
 * If the event write fails the previous list is put back and the error returned. Errors:
 * `INVALID_INPUT` (naming `results.N.label` / `results.N.value` / `results`), `NOT_FOUND`.
 * Any case status; status never changes. Never material. The caller has already authorized `fill details`.
 */
export function makeSaveCaseResults({ form, cases }: Pick<MaterialDeps, "form" | "cases">, limits: CaseStoryLimits) {
  return async function saveCaseResults(actor: Actor, input: unknown): Promise<Result<CaseResultsSaved>> {
    const parsed = parseInput(saveCaseResultsInputSchema(limits), input);
    if (!parsed.ok) return parsed;
    const { caseId, results } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const previous = await form.saveResults(caseId, results, actor.id);
    if (!previous.ok) return previous;
    if (sameResults(previous.value, results)) return ok({ results });

    const event = await cases.recordEvent(actor, { caseId, type: DETAILS_SAVED, data: { field: "results" } });
    if (!event.ok) {
      const undone = await form.saveResults(caseId, previous.value, actor.id);
      if (!undone.ok) {
        log.error("results saved without their details_saved event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok({ results });
  };
}
