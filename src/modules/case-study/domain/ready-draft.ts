import { z } from "zod";

/**
 * Story 3.8: a case whose draft became ready to review (its `generation_succeeded`
 * transition) for the person who pressed Generate. `readyAt` is when that transition
 * was recorded.
 */
export const readyDraftSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  readyAt: z.string(),
});
export type ReadyDraft = z.infer<typeof readyDraftSchema>;

/** `listReadyDrafts` input: the start of the person's page session, an ISO timestamp with an offset. */
export const listReadyDraftsInputSchema = z.strictObject({
  since: z.iso.datetime({ offset: true }),
});
export type ListReadyDraftsInput = z.infer<typeof listReadyDraftsInputSchema>;

/** One `transition` case event, as `selectReadyDrafts` reads it. */
export interface TransitionRecord {
  caseId: string;
  actorId: string;
  /** `data.event`, one of `TRANSITION_EVENTS`. */
  event: string;
  at: string;
}

/** A case as `selectReadyDrafts` reads it. */
export interface ReadyDraftCase {
  id: string;
  name: string;
  deletedAt: string | null;
}

/**
 * The ready drafts of `actorId` (pure; the adapter feeds it the rows): each case with a
 * `generation_succeeded` transition strictly after `since` whose latest `generate`
 * transition was made by `actorId`, and which is not deleted. The worker records
 * `generation_succeeded` as the system actor, so whose draft it is comes from `generate`.
 * One entry per case, `readyAt` its newest `generation_succeeded`, oldest first.
 */
export function selectReadyDrafts(
  transitions: readonly TransitionRecord[],
  cases: readonly ReadyDraftCase[],
  actorId: string,
  since: string,
): ReadyDraft[] {
  const sinceMs = Date.parse(since);
  const readyAt = new Map<string, { at: string; ms: number }>();
  const latestGenerate = new Map<string, { actorId: string; ms: number }>();
  for (const t of transitions) {
    const ms = Date.parse(t.at);
    if (t.event === "generation_succeeded" && ms > sinceMs) {
      const seen = readyAt.get(t.caseId);
      if (seen === undefined || ms > seen.ms) readyAt.set(t.caseId, { at: t.at, ms });
    } else if (t.event === "generate") {
      const seen = latestGenerate.get(t.caseId);
      if (seen === undefined || ms > seen.ms) latestGenerate.set(t.caseId, { actorId: t.actorId, ms });
    }
  }
  const live = new Map(cases.filter((c) => c.deletedAt === null).map((c) => [c.id, c.name]));
  const drafts: (ReadyDraft & { ms: number })[] = [];
  for (const [caseId, ready] of readyAt) {
    const name = live.get(caseId);
    if (name === undefined || latestGenerate.get(caseId)?.actorId !== actorId) continue;
    drafts.push({ id: caseId, name, readyAt: ready.at, ms: ready.ms });
  }
  return drafts.sort((a, b) => a.ms - b.ms).map(({ id, name, readyAt: at }) => ({ id, name, readyAt: at }));
}
