import type { Actor } from "@/modules/access";
import {
  FIELD_INVALID,
  FIELD_TOO_LONG,
  isClientBriefField,
  saveClientBriefFieldInputSchema,
  saveClientResultsInputSchema,
  saveClientTestimonialInputSchema,
  type ClientBriefField,
  type ClientResult,
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
 * Saves one brief text of a client, Contesto or Soluzione (`{ clientId, field, text }`; `""` clears it
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

/** What `saveClientResults` stored: the client's results now, the filled rows top to bottom. */
export interface ClientResultsSaved {
  results: ClientResult[];
}

/**
 * Replaces a client's results (`{ clientId, results }`): at most 3 rows, each a
 * label (≤ 80 characters) and a value (≤ 20), both trimmed and required; `[]` clears
 * them. Saving the stored list again writes nothing. The caller has already authorized
 * `manage clients`. Errors: `INVALID_INPUT`, `CLIENT_FIELD_INVALID` / `CLIENT_FIELD_TOO_LONG`
 * (naming `results`), `CLIENT_NOT_FOUND`; nothing is written on any of them.
 */
export function makeSaveClientResults(clients: ClientRepository) {
  return async function saveClientResults(actor: Actor, input: unknown): Promise<Result<ClientResultsSaved>> {
    const parsed = parseClientInput(saveClientResultsInputSchema, input, { tooLong: FIELD_TOO_LONG, invalid: FIELD_INVALID });
    if (!parsed.ok) return parsed;
    const { clientId, results } = parsed.value;
    const saved = await clients.saveResults(clientId, results, actor.id);
    if (!saved.ok) return saved;
    return ok({ results });
  };
}

/** What `saveClientTestimonial` stored: the quote and its author now, trimmed. */
export interface ClientTestimonialSaved {
  quote: string;
  author: string;
}

/**
 * Replaces a client's testimonial (`{ clientId, quote, author }`, trimmed; quote
 * ≤ 600 characters, author ≤ 120; `""` and `""` clear it). An author without a quote
 * is `CLIENT_FIELD_INVALID` on `quote`. Saving the stored pair again writes nothing.
 * The caller has already authorized `manage clients`. Errors: `INVALID_INPUT`,
 * `CLIENT_FIELD_INVALID`, `CLIENT_FIELD_TOO_LONG` (naming the field), `CLIENT_NOT_FOUND`;
 * nothing is written on any of them.
 */
export function makeSaveClientTestimonial(clients: ClientRepository) {
  return async function saveClientTestimonial(actor: Actor, input: unknown): Promise<Result<ClientTestimonialSaved>> {
    const parsed = parseClientInput(saveClientTestimonialInputSchema, input, { tooLong: FIELD_TOO_LONG, invalid: FIELD_INVALID });
    if (!parsed.ok) return parsed;
    const { clientId, quote, author } = parsed.value;
    const saved = await clients.saveTestimonial(clientId, quote, author, actor.id);
    if (!saved.ok) return saved;
    return ok({ quote, author });
  };
}
