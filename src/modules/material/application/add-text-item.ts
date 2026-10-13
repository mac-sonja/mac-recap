import type { Actor } from "@/modules/access";
import { addTextInputSchema, hasText, TEXT_ADDED, textEmpty, type TextItem } from "@/modules/material/domain/text-item";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Stores pasted text as a text item of a non-deleted case (any status) and
 * records `text_added { textItemId }`. Text items never count toward the file
 * cap and need no storage. Errors: `INVALID_INPUT` (title, body length),
 * `TEXT_EMPTY`, `NOT_FOUND`. If the event write fails the new item is
 * soft-deleted again and the error returned. Case status never changes. The
 * caller has already authorized `upload`.
 */
export function makeAddTextItem({ texts, cases }: MaterialDeps) {
  return async function addTextItem(actor: Actor, input: unknown): Promise<Result<TextItem>> {
    const parsed = parseInput(addTextInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, title, body } = parsed.value;
    if (!hasText(body)) return err(textEmpty());

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const created = await texts.create({ caseId, title, body, createdBy: actor.id });
    if (!created.ok) return created;
    const textItemId = created.value.id;

    const event = await cases.recordEvent(actor, { caseId, type: TEXT_ADDED, data: { textItemId } });
    if (!event.ok) {
      const undone = await texts.softDelete(caseId, textItemId);
      if (!undone.ok || !undone.value) {
        log.error("text item left without its text_added event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(created.value);
  };
}
