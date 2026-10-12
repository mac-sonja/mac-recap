import { z } from "zod";
import type { CaseStatus } from "@/shared/case-status";
import { err, ok, type Result } from "@/shared/result";

/** Lifecycle events (AD-3). Fork, update approved version and discard do not change status, so they are not here. */
export const TRANSITION_EVENTS = ["generate", "generation_succeeded", "generation_failed", "approve"] as const;
export const transitionEventSchema = z.enum(TRANSITION_EVENTS);
export type TransitionEvent = z.infer<typeof transitionEventSchema>;

/**
 * The AD-3 transition table: the single definition. `generation_failed` covers
 * both a failed job and a discarded result. `approved` has no outgoing transition.
 */
export const TRANSITIONS: Readonly<Record<TransitionEvent, { from: CaseStatus; to: CaseStatus }>> = {
  generate: { from: "draft", to: "generating" },
  generation_succeeded: { from: "generating", to: "in_review" },
  generation_failed: { from: "generating", to: "draft" },
  approve: { from: "in_review", to: "approved" },
};

/** The status `event` moves a case in `from` to; any other pair (or an unknown event) is `INVALID_TRANSITION`. */
export function nextStatus(from: CaseStatus, event: unknown): Result<CaseStatus> {
  const parsed = transitionEventSchema.safeParse(event);
  const edge = parsed.success ? TRANSITIONS[parsed.data] : undefined;
  if (!edge || edge.from !== from) {
    return err({
      code: "INVALID_TRANSITION",
      message: `No transition from ${from} on this event.`,
      details: { from, event: parsed.success ? parsed.data : typeof event === "string" ? event : typeof event },
    });
  }
  return ok(edge.to);
}
