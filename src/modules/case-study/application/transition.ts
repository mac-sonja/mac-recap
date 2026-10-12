import { z } from "zod";
import type { Actor } from "@/modules/access";
import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import { nextStatus, transitionEventSchema } from "@/modules/case-study/domain/transition";
import { err, type Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

const notFound = (id: unknown) =>
  err({ code: "NOT_FOUND", message: "No case study with this id.", details: { id } });

/**
 * The only way `case_study.status` changes (AD-3): reads the case, computes the
 * next status from the domain transition table, then compare-and-sets it and
 * appends a `transition` event `{ event, from, to }` with the actor, in one
 * transaction. The caller has already authorized the actor (AR11).
 * `NOT_FOUND` (unknown, malformed or soft-deleted id), `INVALID_TRANSITION`
 * (pair not in the table, or unknown event), `STALE_STATUS` (status moved
 * since the read); nothing is written on any of them.
 */
export function makeTransition(cases: CaseStudyRepository) {
  return async function transition(caseId: unknown, event: unknown, actor: Actor): Promise<Result<CaseStudy>> {
    const id = z.uuid().safeParse(caseId);
    if (!id.success) return notFound(caseId);
    const found = await cases.findById(id.data);
    if (!found.ok) return found;
    if (found.value === null) return notFound(id.data);

    const from = found.value.status;
    const to = nextStatus(from, event);
    if (!to.ok) return to;
    return cases.transition({
      caseId: id.data,
      // nextStatus accepted it, so it is a known event.
      event: transitionEventSchema.parse(event),
      from,
      to: to.value,
      actorId: actor.id,
    });
  };
}
