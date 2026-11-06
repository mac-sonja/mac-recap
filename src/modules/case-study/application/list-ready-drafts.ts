import type { Actor } from "@/modules/access";
import { clampReadySince, listReadyDraftsInputSchema, type ReadyDraft } from "@/modules/case-study/domain/ready-draft";
import { parseInput } from "@/modules/case-study/domain/validation";
import { ok, type Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientIntroRepository } from "@/modules/case-study/ports/client-intro-repository";

/**
 * Story 3.8: the drafts that became ready for `actor` since `since` (the start of their
 * page session): cases Da approvare, not deleted, with a `generation_succeeded` after
 * `since` that follows their latest `generate`, the actor's; Story 3.11: client intros the
 * same way. Cases and intros together, oldest first. `since` is clamped to no earlier than
 * 24 hours before `now`, so a client can't ask for an unbounded history. A malformed input
 * is `INVALID_INPUT` and queries nothing.
 */
export function makeListReadyDrafts(
  cases: Pick<CaseStudyRepository, "listReadyDrafts">,
  intros: Pick<ClientIntroRepository, "listReadyIntros">,
  now: () => Date = () => new Date(),
) {
  return async function listReadyDrafts(actor: Actor, input: unknown): Promise<Result<ReadyDraft[]>> {
    const parsed = parseInput(listReadyDraftsInputSchema, input);
    if (!parsed.ok) return parsed;
    const since = clampReadySince(parsed.value.since, now());
    const [ofCases, ofIntros] = await Promise.all([cases.listReadyDrafts(actor.id, since), intros.listReadyIntros(actor.id, since)]);
    if (!ofCases.ok) return ofCases;
    if (!ofIntros.ok) return ofIntros;
    return ok([...ofCases.value, ...ofIntros.value].sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt)));
  };
}
