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
  status: string;
  deletedAt: string | null;
}

/** The oldest session start the server accepts: an older `since` is clamped to now minus this. */
export const READY_DRAFTS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How long before `since` a `generate` may have been pressed and still lead to a draft ready after it. */
export const READY_DRAFTS_GENERATE_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** The most rows each ready-drafts read returns. */
export const READY_DRAFTS_LIMIT = 100;

/** `since`, no earlier than `now` minus `READY_DRAFTS_MAX_AGE_MS` (ISO). */
export function clampReadySince(since: string, now: Date): string {
  const floor = now.getTime() - READY_DRAFTS_MAX_AGE_MS;
  return Date.parse(since) < floor ? new Date(floor).toISOString() : since;
}

/**
 * The ready drafts of `actorId` (pure; the adapter feeds it the rows). `transitions` holds
 * the `generation_succeeded` events already read as after the session start (the query's
 * `at > since`; no time filter here) and the cases' `generate` events. A case counts when it
 * is Da approvare and not deleted, its latest `generate` was made by `actorId`, and it has
 * a `generation_succeeded` after that `generate` (an older success, from before a
 * regeneration, does not count). The worker records `generation_succeeded` as the system
 * actor, so whose draft it is comes from `generate`. One entry per case, `readyAt` its
 * newest `generation_succeeded`, oldest first.
 */
export function selectReadyDrafts(
  transitions: readonly TransitionRecord[],
  cases: readonly ReadyDraftCase[],
  actorId: string,
): ReadyDraft[] {
  const readyAt = new Map<string, { at: string; ms: number }>();
  const latestGenerate = new Map<string, { actorId: string; ms: number }>();
  for (const t of transitions) {
    const ms = Date.parse(t.at);
    if (t.event === "generation_succeeded") {
      const seen = readyAt.get(t.caseId);
      if (seen === undefined || ms > seen.ms) readyAt.set(t.caseId, { at: t.at, ms });
    } else if (t.event === "generate") {
      const seen = latestGenerate.get(t.caseId);
      if (seen === undefined || ms > seen.ms) latestGenerate.set(t.caseId, { actorId: t.actorId, ms });
    }
  }
  const waiting = new Map(cases.filter((c) => c.deletedAt === null && c.status === "in_review").map((c) => [c.id, c.name]));
  const drafts: (ReadyDraft & { ms: number })[] = [];
  for (const [caseId, ready] of readyAt) {
    const name = waiting.get(caseId);
    const generate = latestGenerate.get(caseId);
    if (name === undefined || generate === undefined || generate.actorId !== actorId) continue;
    // Timestamps are read to the millisecond; a success never shares one with the press before it.
    if (ready.ms < generate.ms) continue;
    drafts.push({ id: caseId, name, readyAt: ready.at, ms: ready.ms });
  }
  return drafts.sort((a, b) => a.ms - b.ms).map(({ id, name, readyAt: at }) => ({ id, name, readyAt: at }));
}
