import type { Actor } from "@/modules/access";
import { editTextInputSchema, hasText, TEXT_EDITED, textEmpty, type TextItem } from "@/modules/material/domain/text-item";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Replaces the title and body of one live text item (same validation as add)
 * and records `text_edited { textItemId }`; `updated_at` follows. A removed or
 * unknown item is `NOT_FOUND`. If the event write fails the previous title and
 * body are put back and the error returned. The caller has already authorized `upload`.
 */
export function makeEditTextItem({ texts, cases }: MaterialDeps) {
  return async function editTextItem(actor: Actor, input: unknown): Promise<Result<TextItem>> {
    const parsed = parseInput(editTextInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, textItemId, title, body } = parsed.value;
    if (!hasText(body)) return err(textEmpty());

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const notFound = () => err({ code: "NOT_FOUND", message: "No such text.", details: { caseId, textItemId } });
    const previous = await texts.getLive(caseId, textItemId);
    if (!previous.ok) return previous;
    if (previous.value === null) return notFound();

    const updated = await texts.update(caseId, textItemId, { title, body });
    if (!updated.ok) return updated;
    if (updated.value === null) return notFound();

    const event = await cases.recordEvent(actor, { caseId, type: TEXT_EDITED, data: { textItemId } });
    if (!event.ok) {
      const { title: oldTitle, body: oldBody } = previous.value;
      const undone = await texts.update(caseId, textItemId, { title: oldTitle, body: oldBody });
      if (!undone.ok || undone.value === null) {
        log.error("text item edited without its text_edited event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok(updated.value);
  };
}
