import type { Actor } from "@/modules/access";
import {
  DETAILS_SAVED,
  isFormField,
  saveDetailsFieldInputSchema,
  unknownField,
  type DetailsFieldSaved,
} from "@/modules/material/domain/details-form";
import { parseInput } from "@/modules/material/domain/validation";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Saves one details-form field (`{ caseId, field, text }`; `""` clears it) and
 * records `details_saved { field }` (never the text). The other fields are
 * untouched; the row is created on the first save. Saving the stored text again
 * writes nothing and records no event. Errors: `INVALID_INPUT` (naming `text`
 * when over 5,000 characters), `UNKNOWN_FIELD`, `NOT_FOUND`. If the event write
 * fails the previous text is put back and the error returned. Any case status;
 * status never changes. Needs no storage. The caller has already authorized `fill details`.
 */
export function makeSaveDetailsField({ form, cases }: Pick<MaterialDeps, "form" | "cases">) {
  return async function saveDetailsField(actor: Actor, input: unknown): Promise<Result<DetailsFieldSaved>> {
    const parsed = parseInput(saveDetailsFieldInputSchema, input);
    if (!parsed.ok) return parsed;
    const { caseId, field, text } = parsed.value;
    if (!isFormField(field)) return err(unknownField(field));

    const found = await cases.get(caseId);
    if (!found.ok) return found;

    const previous = await form.saveField(caseId, field, text, actor.id);
    if (!previous.ok) return previous;
    if (previous.value === text) return ok({ field, text });

    const event = await cases.recordEvent(actor, { caseId, type: DETAILS_SAVED, data: { field } });
    if (!event.ok) {
      const undone = await form.saveField(caseId, field, previous.value, actor.id);
      if (!undone.ok) {
        log.error("details saved without its details_saved event: compensation failed", { caseId, actorId: actor.id });
      }
      return event;
    }
    return ok({ field, text });
  };
}
