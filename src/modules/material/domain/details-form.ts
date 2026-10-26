import { z } from "zod";
import { hasNoNul, NUL_MESSAGE, withinCodePoints } from "@/modules/material/domain/validation";

/**
 * The details form's text field keys (the `save_context_field` check and the `context_form`
 * text columns match). Risultati and Testimonial are structured and save through their
 * own calls (`saveCaseResults`, `saveCaseTestimonial`; Story 2.21).
 */
export const FORM_FIELDS = ["context", "solution"] as const;
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

/** One of a case's results: what is measured ("Candidature ricevute") and the number ("+180%"), both trimmed and filled. */
export const caseResultSchema = z.object({ label: z.string(), value: z.string() });
export type CaseResult = z.infer<typeof caseResultSchema>;

/** A case's testimonial: a quote and its author (an author never comes without a quote). */
export interface CaseTestimonial {
  quote: string;
  author: string;
}

/**
 * The whole form; a text never saved (or a case with no row) is `""`, no results is
 * `[]`. `results` are the filled rows, top to bottom (Story 2.21).
 */
export const detailsFormSchema = z.object({
  context: z.string(),
  solution: z.string(),
  results: z.array(caseResultSchema),
  testimonialQuote: z.string(),
  testimonialAuthor: z.string(),
});
export type DetailsForm = z.infer<typeof detailsFormSchema>;

export const emptyDetailsForm = (): DetailsForm => ({
  context: "",
  solution: "",
  results: [],
  testimonialQuote: "",
  testimonialAuthor: "",
});

/**
 * The limits of a case's results and testimonial: the client's (the same SQL checks,
 * `client_brief_results_valid`). index.ts passes the case-study module's constants;
 * the domain stays pure, so it takes them as a value.
 */
export interface CaseStoryLimits {
  /** Rows, at most. */
  resultsMax: number;
  /** A result's label, in characters (code points) after trimming. */
  resultLabelMax: number;
  /** A result's value, in characters (code points) after trimming. */
  resultValueMax: number;
  /** The testimonial's quote, in characters (code points) after trimming. */
  testimonialQuoteMax: number;
  /** The testimonial's author, in characters (code points) after trimming. */
  testimonialAuthorMax: number;
}

/** The length message for a story text over `max` characters. */
export const storyTooLongMessage = (max: number) => `Must be at most ${max.toLocaleString("en")} characters.`;

/** An optional story text (result part, testimonial): trimmed, at most `max` code points, no U+0000 or lone surrogate. */
const storyTextSchema = (max: number) =>
  z
    .string()
    .refine(hasNoNul, NUL_MESSAGE)
    .refine((text) => text.isWellFormed(), "Must be well-formed Unicode (no lone surrogates).")
    .transform((text) => text.trim())
    .refine((text) => withinCodePoints(text, max), storyTooLongMessage(max));

const REQUIRED_PART = "Required: a result needs both its label and its value.";

/**
 * Replaces a case's results (`{ caseId, results }`): the filled rows, top to bottom, at
 * most `resultsMax`; `[]` clears them. Each row's label and value are trimmed and both
 * required (a half row is never sent); any other key is dropped.
 */
export const saveCaseResultsInputSchema = (limits: CaseStoryLimits) =>
  z.object({
    caseId: z.uuid(),
    results: z
      .array(
        z.object({
          label: storyTextSchema(limits.resultLabelMax).refine((text) => text !== "", REQUIRED_PART),
          value: storyTextSchema(limits.resultValueMax).refine((text) => text !== "", REQUIRED_PART),
        }),
      )
      .max(limits.resultsMax, `At most ${limits.resultsMax} results.`),
  });

/** The message when an author comes without a quote. */
export const AUTHOR_WITHOUT_QUOTE = "Required: an author needs a quote.";

/**
 * Replaces a case's testimonial (`{ caseId, quote, author }`, both trimmed; `""` and
 * `""` clear it). An author without a quote fails on `quote`.
 */
export const saveCaseTestimonialInputSchema = (limits: CaseStoryLimits) =>
  z
    .object({
      caseId: z.uuid(),
      quote: storyTextSchema(limits.testimonialQuoteMax),
      author: storyTextSchema(limits.testimonialAuthorMax),
    })
    .refine((input) => input.quote !== "" || input.author === "", { message: AUTHOR_WITHOUT_QUOTE, path: ["quote"] });

/** Whether two results lists hold the same rows in the same order. */
export const sameResults = (a: readonly CaseResult[], b: readonly CaseResult[]) =>
  a.length === b.length && a.every((row, index) => row.label === b[index]?.label && row.value === b[index]?.value);

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

/** What `saveCaseResults` stored: the case's results now, the filled rows top to bottom. */
export interface CaseResultsSaved {
  results: CaseResult[];
}

/** What `saveCaseTestimonial` stored: the quote and its author now, trimmed. */
export type CaseTestimonialSaved = CaseTestimonial;

/**
 * Recorded through `case-study.recordEvent` with `{ field }` only (never the text):
 * a FORM_FIELDS key, `results` or `testimonial`.
 */
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
