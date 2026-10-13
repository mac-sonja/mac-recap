import type { Actor } from "@/modules/access";
import { TEXT_RESTORED, textItemRefInputSchema } from "@/modules/material/domain/text-item";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Clears `deleted_at` on one text item of a non-deleted case (no cap applies)
 * and records `text_restored { textItemId }`. An already live item is ok with no
 * event; an unknown one is `NOT_FOUND`. If the event write fails the item is
 * removed again and the error returned. The caller has already authorized `upload`.
 */
export function makeRestoreTextItem({ texts, cases }: MaterialDeps) {
  return async function restoreTextItem(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(textItemRefInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, textItemId } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const restored = await texts.restore(caseId, textItemId);
    if (!restored.ok) return restored;
    if (!restored.value) return ok(undefined);

    const event = await cases.recordEvent(actor, { caseId, type: TEXT_RESTORED, data: { textItemId } });
    if (!event.ok) {
      const undone = await texts.softDelete(caseId, textItemId);
      if (!undone.ok || !undone.value) {
        log.error("text item restored without its text_restored event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(undefined);
  };
}
