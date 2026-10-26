import type { Actor } from "@/modules/access";
import {
  DETAILS_SAVED,
  saveCaseTestimonialInputSchema,
  type CaseStoryLimits,
  type CaseTestimonialSaved,
} from "@/modules/material/domain/details-form";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Replaces a case's testimonial (`{ caseId, quote, author }`, trimmed; `""` and `""`
 * clear it; Story 2.21), within the client's limits. An author without a quote is
 * `INVALID_INPUT` on `quote`. Records `details_saved { field: 'testimonial' }` (never the
 * text); saving the stored pair again writes nothing and records no event. If the event
 * write fails the previous pair is put back and the error returned. Errors:
 * `INVALID_INPUT`, `NOT_FOUND`. Any case status; status never changes. The caller has
 * already authorized `fill details`.
 */
export function makeSaveCaseTestimonial({ form, cases }: Pick<MaterialDeps, "form" | "cases">, limits: CaseStoryLimits) {
  return async function saveCaseTestimonial(actor: Actor, input: unknown): Promise<Result<CaseTestimonialSaved>> {
    const parsed = parseInput(saveCaseTestimonialInputSchema(limits), input);
    if (!parsed.ok) return parsed;
    const { caseId, quote, author } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const previous = await form.saveTestimonial(caseId, quote, author, actor.id);
    if (!previous.ok) return previous;
    if (previous.value.quote === quote && previous.value.author === author) return ok({ quote, author });

    const event = await cases.recordEvent(actor, { caseId, type: DETAILS_SAVED, data: { field: "testimonial" } });
    if (!event.ok) {
      const undone = await form.saveTestimonial(caseId, previous.value.quote, previous.value.author, actor.id);
      if (!undone.ok) {
        log.error("testimonial saved without its details_saved event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok({ quote, author });
  };
}
