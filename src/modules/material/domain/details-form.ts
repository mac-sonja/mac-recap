import { z } from "zod";
import { hasNoNul, NUL_MESSAGE, withinCodePoints } from "@/modules/material/domain/validation";

/** The details form's stable field keys (the `save_context_field` check and the `context_form` columns match). */
export const FORM_FIELDS = ["context", "solution", "results"] as const;
export type FormField = (typeof FORM_FIELDS)[number];

/** Each field's upper bound in characters (code points, like Postgres `char_length`; the `context_form_*_check` match). */
export const MAX_FORM_FIELD_CHARS = 5_000;

/** Input bound on a field key or ref id, and the longest one echoed back in an error. */
export const MAX_KEY_CHARS = 64;
const MAX_SHOWN_KEY_CHARS = MAX_KEY_CHARS;
const keySchema = z.string().max(MAX_KEY_CHARS, `At most ${MAX_KEY_CHARS} characters.`);

/** The length message shared by the schema and the adapter's check-violation mapping. */
export const FIELD_TOO_LONG_MESSAGE = `Must be at most ${MAX_FORM_FIELD_CHARS.toLocaleString("en")} characters.`;

export const isFormField = (key: unknown): key is FormField =>
  typeof key === "string" && (FORM_FIELDS as readonly string[]).includes(key);

/** The whole form; a field never saved (or a case with no row) is `""`. */
export type DetailsForm = Record<FormField, string>;

export const emptyDetailsForm = (): DetailsForm => ({ context: "", solution: "", results: "" });

/** A `context_form` row's fields as the material module sees them. */
export const detailsFormSchema = z.object({
  context: z.string(),
  solution: z.string(),
  results: z.string(),
});

/** Optional plain text stored as given; `""` clears the field. */
const fieldTextSchema = z
  .string()
  .refine(hasNoNul, NUL_MESSAGE)
  .refine((text) => text.isWellFormed(), "Must be well-formed Unicode (no lone surrogates).")
  .refine((text) => withinCodePoints(text, MAX_FORM_FIELD_CHARS), FIELD_TOO_LONG_MESSAGE);

/**
 * Saves one field. `field` is any string here: a key other than FORM_FIELDS is
 * `UNKNOWN_FIELD` (checked by the use case), not `INVALID_INPUT`.
 */
export const saveDetailsFieldInputSchema = z.object({
  caseId: z.uuid(),
  field: keySchema,
  text: fieldTextSchema,
});

/** The case whose form is read. */
export const detailsFormInputSchema = z.object({ caseId: z.uuid() });

/** What `saveDetailsField` stored: the field and its text now. */
export interface DetailsFieldSaved {
  field: FormField;
  text: string;
}

/** Recorded through `case-study.recordEvent` with `{ field }` only (never the text). */
export const DETAILS_SAVED = "details_saved";

/** Cut by code points, so an astral character is never split. */
const shown = (key: string) => Array.from(key).slice(0, MAX_SHOWN_KEY_CHARS).join("");

/** `UNKNOWN_FIELD` naming the key (cut, since it may be arbitrary input). */
export const unknownField = (field: string) => {
  const key = shown(field);
  return {
    code: "UNKNOWN_FIELD" as const,
    message: key === "" ? "Unknown field." : `Unknown field: ${key}.`,
    details: { field: key },
  };
};

/**
 * A reference to a piece of material a claim can cite (AD-18: `MaterialRef`).
 * Only `form_field` refs (id = a FORM_FIELDS key) resolve so far; `asset` refs
 * arrive with the first Epic 3/4 story that needs them.
 */
export const MATERIAL_REF_KINDS = ["asset", "form_field"] as const;
export type MaterialRefKind = (typeof MATERIAL_REF_KINDS)[number];

export const materialRefSchema = z.object({
  kind: z.enum(MATERIAL_REF_KINDS),
  id: keySchema,
});
export type MaterialRef = z.infer<typeof materialRefSchema>;

/** Input bound on refs per resolve call. */
export const MAX_REFS_PER_RESOLVE = 100;

export const resolveRefsInputSchema = z.object({
  caseId: z.uuid(),
  refs: z.array(materialRefSchema).max(MAX_REFS_PER_RESOLVE, `At most ${MAX_REFS_PER_RESOLVE} refs.`),
});

/** One resolved ref: the ref as given and the cited content's current text. */
export interface ResolvedRef {
  ref: MaterialRef;
  text: string;
}

/** `UNKNOWN_REF` naming the ref (its id cut, since it may be arbitrary input). */
export const unknownRef = ({ kind, id }: MaterialRef) => {
  const key = shown(id);
  return {
    code: "UNKNOWN_REF" as const,
    message: key === "" ? `Unknown ${kind} ref.` : `Unknown ${kind} ref: ${key}.`,
    details: { kind, id: key },
  };
};
