import type { Actor } from "@/modules/access";
import {
  FIELD_INVALID,
  FIELD_TOO_LONG,
  isClientBriefField,
  saveClientBriefFieldInputSchema,
  type ClientBriefField,
} from "@/modules/case-study/domain/case-study";
import { parseClientInput } from "@/modules/case-study/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

/** What `saveClientBriefField` stored: the field and its text now. */
export interface ClientBriefFieldSaved {
  field: ClientBriefField;
  text: string;
}

/**
 * Saves one brief text of a client (`{ clientId, field, text }`; `""` clears it
 * while editing). The text is stored as given, at most 5000 characters after
 * trimming. The other fields are untouched; the row is created on the first save,
 * and saving the stored text again writes nothing. Client edits are not case
 * events. The caller has already authorized `manage clients`. Errors:
 * `INVALID_INPUT`, `UNKNOWN_FIELD`, `CLIENT_FIELD_TOO_LONG` (naming the field),
 * `CLIENT_NOT_FOUND`; nothing is written on any of them.
 */
export function makeSaveClientBriefField(clients: ClientRepository) {
  return async function saveClientBriefField(actor: Actor, input: unknown): Promise<Result<ClientBriefFieldSaved>> {
    const parsed = parseClientInput(saveClientBriefFieldInputSchema, input, { tooLong: FIELD_TOO_LONG, invalid: FIELD_INVALID });
    if (!parsed.ok) {
      // The length error names the brief field, not the `text` key.
      const field = (input as { field?: unknown } | null)?.field;
      if (parsed.error.code === "CLIENT_FIELD_TOO_LONG" && isClientBriefField(field)) {
        return err({ ...parsed.error, message: `Too long: ${field}.`, details: { fields: [field] } });
      }
      return parsed;
    }
    const { clientId, field, text } = parsed.value;
    if (!isClientBriefField(field)) {
      return err({ code: "UNKNOWN_FIELD", message: "Unknown field.", details: { field: [...field].slice(0, 64).join("") } });
    }
    const saved = await clients.saveBriefField(clientId, field, text, actor.id);
    if (!saved.ok) return saved;
    return ok({ field, text });
  };
}
