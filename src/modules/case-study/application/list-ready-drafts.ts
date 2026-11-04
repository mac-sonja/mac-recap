import type { Actor } from "@/modules/access";
import { listReadyDraftsInputSchema, type ReadyDraft } from "@/modules/case-study/domain/ready-draft";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

/**
 * Story 3.8: the drafts that became ready for `actor` since `since` (the start of their
 * page session): non-deleted cases with a `generation_succeeded` transition after
 * `since` whose latest `generate` was the actor's. A malformed input is `INVALID_INPUT`
 * and queries nothing.
 */
export function makeListReadyDrafts(cases: CaseStudyRepository) {
  return async function listReadyDrafts(actor: Actor, input: unknown): Promise<Result<ReadyDraft[]>> {
    const parsed = parseInput(listReadyDraftsInputSchema, input);
    if (!parsed.ok) return parsed;
    return cases.listReadyDrafts(actor.id, parsed.value.since);
  };
}
