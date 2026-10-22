import { z } from "zod";
import { normalizeClientConfirmName } from "@/shared/client-name";
import { CASE_STATUSES } from "@/shared/case-status";

/** Narrative locales (per case, default `it`). The `case_study.locale` check lists exactly these. */
export const LOCALES = ["it", "en"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const DEFAULT_LOCALE: Locale = "it";

export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/** Accepted client name length after trimming (AD-21 rule 7; the DB only checks non-blank). */
export const CLIENT_NAME_MAX = 120;

/** Accepted client description length, in characters (code points) after trimming (AD-22; the DB checks it too). */
export const CLIENT_DESCRIPTION_MAX = 400;

/**
 * The fixed industry list (SCP 2026-10-19), in display order. The
 * `client_industries_check` lists exactly these; the Italian labels live in
 * `it.clients.industries`. A client has at least one.
 */
export const CLIENT_INDUSTRIES = ["interior_design", "energia", "risorse_umane", "lusso"] as const;
export type ClientIndustry = (typeof CLIENT_INDUSTRIES)[number];

export function isClientIndustry(value: unknown): value is ClientIndustry {
  return typeof value === "string" && (CLIENT_INDUSTRIES as readonly string[]).includes(value);
}

/**
 * The fixed business line list ("Servizi"; owner, 2026-10-20; Sviluppo added at the 2.18 review), in display
 * order. The `case_study_business_lines_check` lists exactly these; the Italian labels live in
 * `it.businessLines`. A case has any number of them (multi-select, owner 2026-10-21); a new
 * one has none until Dettagli.
 */
export const BUSINESS_LINES = ["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"] as const;
export type BusinessLine = (typeof BUSINESS_LINES)[number];
export const businessLineSchema = z.enum(BUSINESS_LINES);

export function isBusinessLine(value: unknown): value is BusinessLine {
  return typeof value === "string" && (BUSINESS_LINES as readonly string[]).includes(value);
}

/**
 * A case's business lines: each one of `BUSINESS_LINES`, kept in display order without
 * repeats, so equal choices always compare equal. A value outside the list fails the
 * whole field (`businessLines`), not one item.
 */
export const businessLinesSchema = z
  .array(z.string())
  .refine((lines) => lines.every(isBusinessLine), "Invalid option.")
  .transform((lines) => BUSINESS_LINES.filter((line) => lines.includes(line)));

/**
 * The client brief's texts, in display order, saved one at a time through
 * `saveClientBriefField` (the `client_brief` columns and `save_client_brief_field`
 * match). Both are needed for a complete client; the results and the testimonial
 * are optional and saved through `saveClientResults` / `saveClientTestimonial`.
 */
export const CLIENT_BRIEF_FIELDS = ["context", "solution"] as const;
export type ClientBriefField = (typeof CLIENT_BRIEF_FIELDS)[number];

export function isClientBriefField(value: unknown): value is ClientBriefField {
  return typeof value === "string" && (CLIENT_BRIEF_FIELDS as readonly string[]).includes(value);
}

/** Each brief text's upper bound, in characters (code points) after trimming (the `client_brief_*_check` match). */
export const CLIENT_BRIEF_MAX = 5000;

/** A client's results: at most 3 label + value pairs (`client_brief_results_valid` checks the same limits). */
export const CLIENT_RESULTS_MAX = 3;
/** A result's label, in characters (code points) after trimming. */
export const CLIENT_RESULT_LABEL_MAX = 80;
/** A result's value ("+180%"), in characters (code points) after trimming. */
export const CLIENT_RESULT_VALUE_MAX = 20;
/** The testimonial's quote, in characters (code points) after trimming (`client_brief_testimonial_quote_check`). */
export const CLIENT_TESTIMONIAL_QUOTE_MAX = 600;
/** The testimonial's author, in characters (code points) after trimming (`client_brief_testimonial_author_check`). */
export const CLIENT_TESTIMONIAL_AUTHOR_MAX = 120;

/**
 * Logo files (AD-8, AD-22): content type → stored extension. The `client_logo.mime_type`
 * check lists exactly these. An SVG is accepted only when `isSafeSvg` (`@/shared/svg-safety`)
 * passes, in the browser at pick and again at confirm; it is always shown through `<img>`.
 */
export const LOGO_FILE_TYPES = {
  "image/png": { ext: "png" },
  "image/jpeg": { ext: "jpg" },
  "image/webp": { ext: "webp" },
  "image/svg+xml": { ext: "svg" },
} as const;
export type LogoContentType = keyof typeof LOGO_FILE_TYPES;
export const LOGO_CONTENT_TYPES = Object.keys(LOGO_FILE_TYPES) as LogoContentType[];
/** Upper size bound of a logo, in bytes (5 MB; the bucket-wide 50 MB limit is not the logo's). */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
/** Lower size bound of a logo, in bytes. */
export const LOGO_MIN_BYTES = 1;
/** A PNG, JPEG or WebP logo's shorter side is at least this many pixels (not checked for SVG). */
export const LOGO_MIN_SHORT_SIDE_PX = 400;

export function isLogoContentType(value: unknown): value is LogoContentType {
  return typeof value === "string" && Object.hasOwn(LOGO_FILE_TYPES, value);
}

/** The vector logo type: checked by the SVG safety scan, never by the pixel rules. */
export const LOGO_SVG_TYPE = "image/svg+xml" satisfies LogoContentType;

/** Whether a logo type is SVG (scanned, no pixel rules) rather than PNG, JPEG or WebP. */
export function isSvgLogoType(contentType: LogoContentType): contentType is typeof LOGO_SVG_TYPE {
  return contentType === LOGO_SVG_TYPE;
}

export function logoExtensionFor(contentType: LogoContentType): string {
  return LOGO_FILE_TYPES[contentType].ext;
}

/** Whether a PNG, JPEG or WebP logo of `width` × `height` pixels is large enough (short side ≥ `LOGO_MIN_SHORT_SIDE_PX`). */
export function isLogoLargeEnough(width: number, height: number): boolean {
  return Math.min(width, height) >= LOGO_MIN_SHORT_SIDE_PX;
}

/** No side of a PNG, JPEG or WebP logo is longer than this: a tiny file claiming a huge size is refused (not checked for SVG). */
export const LOGO_MAX_SIDE_PX = 8000;

/** Whether no side of a logo exceeds `LOGO_MAX_SIDE_PX`. */
export function isLogoWithinMaxSide(width: number, height: number): boolean {
  return Math.max(width, height) <= LOGO_MAX_SIDE_PX;
}

/** Whether a logo of `sizeBytes` is within 1 B–5 MB. */
export function isLogoSizeAllowed(sizeBytes: number): boolean {
  return Number.isInteger(sizeBytes) && sizeBytes >= LOGO_MIN_BYTES && sizeBytes <= LOGO_MAX_BYTES;
}

/** Length in characters (code points), so an emoji counts as one, as Postgres `char_length` counts it. */
export function charCount(text: string): number {
  return [...text].length;
}

/**
 * The message of a too-long description or brief text issue: `parseClientInput`
 * turns those into `CLIENT_FIELD_TOO_LONG`.
 */
export const FIELD_TOO_LONG = "Too long.";
/**
 * The message of a missing or invalid required client field (industries outside the
 * list or none, a blank description, no logo): `parseClientInput` turns those into
 * `CLIENT_FIELD_INVALID`.
 */
export const FIELD_INVALID = "Invalid.";

/** Postgres text can't hold U+0000: refused as a field error, never a generic write failure. */
const NO_NUL = (value: string) => !value.includes("\u0000");
export const INVALID_CHARACTER = "Invalid character.";

/** A required plain-text client field: trimmed, not blank, at most `max` characters, no U+0000. */
const requiredClientText = (max: number) =>
  z
    .string({ error: FIELD_INVALID })
    .refine(NO_NUL, { message: INVALID_CHARACTER })
    .transform((value) => value.trim())
    .refine((value) => value !== "", { message: FIELD_INVALID })
    .refine((value) => charCount(value) <= max, { message: FIELD_TOO_LONG });

/**
 * The client's industries: one or more values of `CLIENT_INDUSTRIES`, deduplicated
 * and put in list order. Anything else (an unknown value, none, not a list) is `FIELD_INVALID`.
 */
export const industriesSchema = z
  .array(z.string({ error: FIELD_INVALID }), { error: FIELD_INVALID })
  .refine((values) => values.length > 0 && values.every(isClientIndustry), { message: FIELD_INVALID })
  .transform((values) => CLIENT_INDUSTRIES.filter((industry) => values.includes(industry)));

/** The client's own words: industries (≥1 from the list) and description (≤400), both required. */
export const clientInfoSchema = z.object({
  industries: industriesSchema,
  description: requiredClientText(CLIENT_DESCRIPTION_MAX),
});
export type ClientInfo = z.infer<typeof clientInfoSchema>;

/**
 * A client as other records embed it (a case study's client, the client lists):
 * `code` is automatic and fixed (AD-21): it is computed only in SQL, never here.
 */
export const clientRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string(),
});
export type ClientRef = z.infer<typeof clientRefSchema>;

/** One of a client's results: what is measured ("Candidature ricevute") and the number ("+180%"), both trimmed and filled. */
export const clientResultSchema = z.object({ label: z.string(), value: z.string() });
export type ClientResult = z.infer<typeof clientResultSchema>;

/**
 * The client brief; a text never saved (or a client with no row) is `""`, no results
 * is `[]`. `results` are the filled rows, top to bottom; a testimonial is a quote
 * (and optionally its author): an author never comes without a quote.
 */
export const clientBriefSchema = z.object({
  context: z.string(),
  solution: z.string(),
  results: z.array(clientResultSchema).max(CLIENT_RESULTS_MAX),
  testimonialQuote: z.string(),
  testimonialAuthor: z.string(),
});
export type ClientBrief = z.infer<typeof clientBriefSchema>;

export const emptyClientBrief = (): ClientBrief => ({ context: "", solution: "", results: [], testimonialQuote: "", testimonialAuthor: "" });

/**
 * A client with its info (AD-22). `industries` is empty and `description` and
 * `logoId` are null only for a client made before every field was required
 * (Story 2.14): such a client is unfinished. `logoId` is the current `client_logo` row.
 */
export const clientSchema = clientRefSchema.extend({
  industries: z.array(z.enum(CLIENT_INDUSTRIES)),
  description: z.string().nullable(),
  logoId: z.uuid().nullable(),
});
export type Client = z.infer<typeof clientSchema>;

/**
 * A client on its page or in its wizard: with its brief and a signed URL for its
 * logo, or null (no logo, or it could not be signed).
 */
export type ClientDetail = Client & { brief: ClientBrief; logoUrl: string | null };

/**
 * Whether every required client field is filled: name, at least one industry,
 * description, logo, Contesto and Soluzione (each non-blank after trimming). The
 * results and the testimonial are optional. A client missing any of them is unfinished.
 */
export function isClientComplete(client: Pick<Client, "name" | "industries" | "description" | "logoId">, brief: ClientBrief): boolean {
  const filled = (text: string | null) => text !== null && text.trim() !== "";
  return (
    filled(client.name) &&
    client.industries.length > 0 &&
    filled(client.description) &&
    client.logoId !== null &&
    CLIENT_BRIEF_FIELDS.every((field) => filled(brief[field]))
  );
}

/**
 * A case's client info, always the client's current values: client info is live
 * (owner, 2026-10-16), so nothing is copied per case or per revision. Epic 3 reads
 * it at render time, not at enqueue.
 */
export const caseClientInfoSchema = z.object({
  clientId: z.uuid(),
  name: z.string(),
  industries: z.array(z.enum(CLIENT_INDUSTRIES)),
  description: z.string().nullable(),
  logoId: z.uuid().nullable(),
  brief: clientBriefSchema,
});
export type CaseClientInfo = z.infer<typeof caseClientInfoSchema>;

/** A client name a person supplies: trimmed, 1–120 characters. */
export const clientNameSchema = z.string().trim().min(1, "Required.").max(CLIENT_NAME_MAX);

/**
 * What a person supplies to add a client (wizard step 1): name, industries and
 * description, all required; the code is assigned in SQL, the logo is linked
 * afterwards through `updateClient` and the brief saved through
 * `saveClientBriefField`. Any other key is dropped.
 */
export const createClientInputSchema = clientInfoSchema.extend({ name: clientNameSchema });
export type CreateClientInput = z.infer<typeof createClientInputSchema>;

/**
 * What a person supplies to edit a client: every field, as it should be after the
 * save. All are required: `logoId` is a confirmed logo of this client (a
 * `client_logo` row); it can be replaced but not cleared. The code never changes.
 */
export const updateClientInputSchema = clientInfoSchema.extend({
  clientId: z.uuid("Required."),
  name: clientNameSchema,
  logoId: z.uuid({ error: FIELD_INVALID }),
});
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

/**
 * Saves one brief text, Contesto or Soluzione (`""` clears it while editing; a
 * complete client needs both). The text is stored as given; at most 5000 characters after
 * trimming. `field` is any string here: a key other than `CLIENT_BRIEF_FIELDS` is
 * `UNKNOWN_FIELD` (checked by the use case).
 */
export const saveClientBriefFieldInputSchema = z.object({
  clientId: z.uuid("Required."),
  field: z.string().max(64),
  text: z
    .string()
    .refine(NO_NUL, { message: INVALID_CHARACTER })
    .refine((text) => text.isWellFormed(), { message: INVALID_CHARACTER })
    .refine((text) => charCount(text.trim()) <= CLIENT_BRIEF_MAX, { message: FIELD_TOO_LONG }),
});
export type SaveClientBriefFieldInput = z.infer<typeof saveClientBriefFieldInputSchema>;

/** An optional client text (testimonial): trimmed, at most `max` characters, no U+0000 or lone surrogate. */
const optionalClientText = (max: number) =>
  z
    .string({ error: FIELD_INVALID })
    .refine(NO_NUL, { message: INVALID_CHARACTER })
    .refine((text) => text.isWellFormed(), { message: INVALID_CHARACTER })
    .transform((text) => text.trim())
    .refine((text) => charCount(text) <= max, { message: FIELD_TOO_LONG });

/** One result row a person supplies: label and value both filled (a half row is never sent), within their limits. */
const resultInputSchema = z.object(
  {
    label: optionalClientText(CLIENT_RESULT_LABEL_MAX).refine((text) => text !== "", { message: FIELD_INVALID }),
    value: optionalClientText(CLIENT_RESULT_VALUE_MAX).refine((text) => text !== "", { message: FIELD_INVALID }),
  },
  { error: FIELD_INVALID },
);

/**
 * Replaces a client's results (`{ clientId, results }`): the filled rows, top to
 * bottom, at most 3; `[]` clears them. Each row's label and value are trimmed and
 * both required; any other key is dropped. A failure on a row names `results`.
 */
export const saveClientResultsInputSchema = z.object({
  clientId: z.uuid("Required."),
  results: z.array(resultInputSchema, { error: FIELD_INVALID }).max(CLIENT_RESULTS_MAX, { message: FIELD_INVALID }),
});
export type SaveClientResultsInput = z.infer<typeof saveClientResultsInputSchema>;

/**
 * Replaces a client's testimonial (`{ clientId, quote, author }`, both trimmed;
 * `""` and `""` clear it). An author without a quote is `CLIENT_FIELD_INVALID` on `quote`.
 */
export const saveClientTestimonialInputSchema = z
  .object({
    clientId: z.uuid("Required."),
    quote: optionalClientText(CLIENT_TESTIMONIAL_QUOTE_MAX),
    author: optionalClientText(CLIENT_TESTIMONIAL_AUTHOR_MAX),
  })
  .refine((input) => input.quote !== "" || input.author === "", { message: FIELD_INVALID, path: ["quote"] });
export type SaveClientTestimonialInput = z.infer<typeof saveClientTestimonialInputSchema>;

/**
 * Deletes a client (owner, 2026-10-19): `confirmName` is the name the person typed;
 * it must equal the client's name after `normalizeClientConfirmName`
 * (`src/shared/client-name.ts`; checked in SQL, `CLIENT_DELETE_NAME_MISMATCH`). A
 * blank name is `INVALID_INPUT`. It is passed on as typed: SQL normalises it.
 */
export const deleteClientInputSchema = z.object({
  clientId: z.uuid("Required."),
  confirmName: z
    .string()
    .max(1000)
    .refine((text) => normalizeClientConfirmName(text).length > 0, { message: "Required." }),
});
export type DeleteClientInput = z.infer<typeof deleteClientInputSchema>;

/** A signed upload request for a logo: the declared type and size are checked first. */
export const requestClientLogoUploadInputSchema = z.object({
  clientId: z.uuid("Required."),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type RequestClientLogoUploadInput = z.infer<typeof requestClientLogoUploadInputSchema>;

/** Confirms an uploaded logo object; the server re-checks it before inserting the row. */
export const confirmClientLogoUploadInputSchema = z.object({
  clientId: z.uuid("Required."),
  logoId: z.uuid("Required."),
  contentType: z.string().min(1),
});
export type ConfirmClientLogoUploadInput = z.infer<typeof confirmClientLogoUploadInputSchema>;

/**
 * A client with the number of its non-deleted case studies (the Clients page) and
 * whether every required field is filled (`isClientComplete`): an unfinished
 * client's row opens its wizard.
 */
export type ClientSummary = ClientRef & {
  caseCount: number;
  complete: boolean;
  /** A signed GET of the client's current logo, or null when it has none or it could not be signed. */
  logoUrl: string | null;
};

/** A client summary as the repository reads it: the current logo's id and type instead of a URL. */
export type StoredClientSummary = Omit<ClientSummary, "logoUrl"> & {
  logo: { id: string; contentType: LogoContentType } | null;
};

/**
 * A `case_study` row with its client, as the case-study module sees it.
 * `code` (e.g. `LUM-2026-01`) is the readable display code, fixed at creation;
 * `id` stays the only key (AD-2). Timestamps are ISO strings.
 */
export const caseStudySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  number: z.number().int().positive(),
  name: z.string(),
  client: clientRefSchema,
  year: z.number().int(),
  locale: localeSchema,
  /** Empty until Dettagli (a case from the new-case dialog). */
  businessLines: businessLinesSchema,
  status: z.enum(CASE_STATUSES),
  projectOrderRef: z.string().nullable(),
  headRevisionId: z.uuid().nullable(),
  approvedRevisionId: z.uuid().nullable(),
  headVersion: z.number().int().nonnegative(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type CaseStudy = z.infer<typeof caseStudySchema>;

const requiredText = z.string().trim().min(1, "Required.");

const yearSchema = z.number().int("Must be a whole number.").min(YEAR_MIN).max(YEAR_MAX);

/**
 * What a person supplies to create a case (the wizard's new-case dialog). Name is trimmed and
 * required; `clientId` is a picked client's id; year is an integer in 1900–2100;
 * locale defaults to `it`; `businessLines` are from `BUSINESS_LINES`, none by default: a
 * case starts on Materiale and gets them in Dettagli (owner, 2026-10-21).
 * Any other key (status, code, project_order_ref, …) is dropped.
 */
export const createCaseStudyInputSchema = z.object({
  name: requiredText,
  clientId: z.uuid("Required."),
  year: yearSchema,
  locale: localeSchema.default(DEFAULT_LOCALE),
  businessLines: businessLinesSchema.default([]),
});
export type CreateCaseStudyInput = z.infer<typeof createCaseStudyInputSchema>;

/**
 * What a person supplies to edit a draft's details (wizard step Dettagli): every
 * field required and as it should be after the save. The client can change while
 * the case is a draft (owner, 2026-10-21): the code then follows the new client.
 */
export const updateCaseStudyDetailsInputSchema = z.object({
  caseId: z.uuid("Required."),
  name: requiredText,
  clientId: z.uuid("Required."),
  year: yearSchema,
  locale: localeSchema,
  /** At least one (multi-select, owner 2026-10-21). */
  businessLines: businessLinesSchema.refine((lines) => lines.length > 0, "Required."),
});
export type UpdateCaseStudyDetailsInput = z.infer<typeof updateCaseStudyDetailsInputSchema>;

/** What a person supplies to delete a draft (Story 4.1 row action): only its id. */
export const deleteCaseStudyInputSchema = z.object({
  caseId: z.uuid("Required."),
});
export type DeleteCaseStudyInput = z.infer<typeof deleteCaseStudyInputSchema>;

/**
 * The scope of a list, as authorized by `list cases`: `{}` is every status,
 * `{ status }` only that one; `clientId` further limits it to one client's cases.
 * Any other key is rejected.
 */
export const listScopeSchema = z.strictObject({
  status: z.enum(CASE_STATUSES).optional(),
  clientId: z.uuid().optional(),
});
export type ListScope = z.infer<typeof listScopeSchema>;
