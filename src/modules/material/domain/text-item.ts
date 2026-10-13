import { z } from "zod";

/** Title bounds after trimming (the `text_item_title_check` matches). */
export const MAX_TEXT_TITLE_CHARS = 200;

/** Body upper bound in characters (code points, like Postgres `char_length`). */
export const MAX_TEXT_BODY_CHARS = 200_000;

/** A `text_item` row as the material module sees it. */
export const textItemSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  title: z.string(),
  body: z.string(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type TextItem = z.infer<typeof textItemSchema>;

/** At most `max` characters counted as code points (like Postgres `char_length`); cheap when the UTF-16 length is already within it. */
function withinCodePoints(value: string, max: number): boolean {
  if (value.length <= max) return true;
  if (value.length > max * 2) return false;
  return Array.from(value).length <= max;
}

/** Postgres text cannot hold U+0000. */
const hasNoNul = (value: string) => !value.includes("\u0000");
const NUL_MESSAGE = "Must not contain the NUL character.";

const titleSchema = z
  .string()
  .trim()
  .min(1, "Required.")
  .refine(hasNoNul, NUL_MESSAGE)
  .refine((title) => withinCodePoints(title, MAX_TEXT_TITLE_CHARS), `Must be at most ${MAX_TEXT_TITLE_CHARS} characters.`);

/** The body is stored as given; emptiness (`TEXT_EMPTY`) is checked by the use case after parsing. */
const bodySchema = z
  .string()
  .refine(hasNoNul, NUL_MESSAGE)
  .refine(
    (body) => withinCodePoints(body, MAX_TEXT_BODY_CHARS),
    `Must be at most ${MAX_TEXT_BODY_CHARS.toLocaleString("en")} characters.`,
  );

/** True when the body has at least one non-whitespace character (the `text_item_body_check` matches). */
export function hasText(body: string): boolean {
  return /\S/.test(body);
}

export const addTextInputSchema = z.object({
  caseId: z.uuid(),
  title: titleSchema,
  body: bodySchema,
});
export type AddTextInput = z.infer<typeof addTextInputSchema>;

export const editTextInputSchema = z.object({
  caseId: z.uuid(),
  textItemId: z.uuid(),
  title: titleSchema,
  body: bodySchema,
});
export type EditTextInput = z.infer<typeof editTextInputSchema>;

/** Identifies one text item of one case (remove, restore). */
export const textItemRefInputSchema = z.object({
  caseId: z.uuid(),
  textItemId: z.uuid(),
});
export type TextItemRefInput = z.infer<typeof textItemRefInputSchema>;

/** The case whose material is checked by `hasMaterial`. */
export const caseIdSchema = z.uuid();

/** Event types recorded through `case-study.recordEvent`, each with `{ textItemId }` (never title or body). */
export const TEXT_ADDED = "text_added";
export const TEXT_EDITED = "text_edited";
export const TEXT_REMOVED = "text_removed";
export const TEXT_RESTORED = "text_restored";

export const textEmpty = () => ({ code: "TEXT_EMPTY" as const, message: "The text is empty." });
