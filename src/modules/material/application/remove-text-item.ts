import type { Actor } from "@/modules/access";
import { TEXT_REMOVED, textItemRefInputSchema } from "@/modules/material/domain/text-item";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Soft-deletes one live text item of a non-deleted case and records
 * `text_removed { textItemId }`. An unknown or already removed item is
 * `NOT_FOUND`. If the event write fails the item is restored and the error
 * returned. The caller has already authorized `upload`.
 */
export function makeRemoveTextItem({ texts, cases }: MaterialDeps) {
  return async function removeTextItem(actor: Actor, input: unknown): Promise<Result<void>> {
    const parsed = parseInput(textItemRefInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, textItemId } = parsed.value;

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const removed = await texts.softDelete(caseId, textItemId);
    if (!removed.ok) return removed;
    if (!removed.value) {
      return err({ code: "NOT_FOUND", message: "No such text.", details: { caseId, textItemId } });
    }

    const event = await cases.recordEvent(actor, { caseId, type: TEXT_REMOVED, data: { textItemId } });
    if (!event.ok) {
      const undone = await texts.restore(caseId, textItemId);
      if (!undone.ok || !undone.value) {
        log.error("text item removed without its text_removed event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(undefined);
  };
}
