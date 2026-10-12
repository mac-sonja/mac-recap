import type { Actor } from "@/modules/access";
import { recordEventInputSchema, type CaseEvent } from "@/modules/case-study/domain/case-event";
import { parseInput } from "@/modules/case-study/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Appends one `case_event` row with its actor. The log is append-only: there is
 * no update or delete. An unknown case is `NOT_FOUND`.
 */
export function makeRecordEvent(cases: CaseStudyRepository) {
  return async function recordEvent(actor: Actor, input: unknown): Promise<Result<CaseEvent>> {
    const parsed = parseInput(recordEventInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, type, revisionId, data } = parsed.value;
    const written = await cases.appendEvent({ caseId, actorId: actor.id, type, revisionId, data });
    if (!written.ok) return written;
    if (written.value === null) {
      return err({ code: "NOT_FOUND", message: "No case study with this id.", details: { id: caseId } });
    }
    return ok(written.value);
  };
}
