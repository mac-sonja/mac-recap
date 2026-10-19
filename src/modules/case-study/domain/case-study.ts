import { z } from "zod";
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

/** The client brief's fields, in display order (the `client_brief` columns and `save_client_brief_field` match). */
export const CLIENT_BRIEF_FIELDS = ["context", "solution", "results"] as const;
export type ClientBriefField = (typeof CLIENT_BRIEF_FIELDS)[number];

export function isClientBriefField(value: unknown): value is ClientBriefField {
  return typeof value === "string" && (CLIENT_BRIEF_FIELDS as readonly string[]).includes(value);
}

/** Each brief text's upper bound, in characters (code points) after trimming (the `client_brief_*_check` match). */
export const CLIENT_BRIEF_MAX = 5000;

/** Logo files (AD-8, AD-22): content type → stored extension. SVG is never accepted. The `client_logo.mime_type` check lists exactly these. */
export const LOGO_FILE_TYPES = {
  "image/png": { ext: "png" },
  "image/jpeg": { ext: "jpg" },
  "image/webp": { ext: "webp" },
} as const;
export type LogoContentType = keyof typeof LOGO_FILE_TYPES;
export const LOGO_CONTENT_TYPES = Object.keys(LOGO_FILE_TYPES) as LogoContentType[];
/** Upper size bound of a logo, in bytes (5 MB; the bucket-wide 50 MB limit is not the logo's). */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
/** Lower size bound of a logo, in bytes. */
export const LOGO_MIN_BYTES = 1;
/** A logo's shorter side is at least this many pixels. */
export const LOGO_MIN_SHORT_SIDE_PX = 400;

export function isLogoContentType(value: unknown): value is LogoContentType {
  return typeof value === "string" && Object.hasOwn(LOGO_FILE_TYPES, value);
}

export function logoExtensionFor(contentType: LogoContentType): string {
  return LOGO_FILE_TYPES[contentType].ext;
}

/** Whether a logo of `width` × `height` pixels is large enough (short side ≥ `LOGO_MIN_SHORT_SIDE_PX`). */
export function isLogoLargeEnough(width: number, height: number): boolean {
  return Math.min(width, height) >= LOGO_MIN_SHORT_SIDE_PX;
}

/** No side of a logo is longer than this: a tiny file claiming a huge size is refused. */
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

/** The client brief; a field never saved (or a client with no row) is `""`. */
export const clientBriefSchema = z.object({
  context: z.string(),
  solution: z.string(),
  results: z.string(),
});
export type ClientBrief = z.infer<typeof clientBriefSchema>;

export const emptyClientBrief = (): ClientBrief => ({ context: "", solution: "", results: "" });

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
 * description, logo, and the three brief texts (each non-blank after trimming).
 * A client missing any of them is unfinished: its wizard reopens at step 1.
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
 * Saves one brief text (`""` clears it while editing; the wizard needs all three
 * filled to finish). The text is stored as given; at most 5000 characters after
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
export type ClientSummary = ClientRef & { caseCount: number; complete: boolean };

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

/**
 * What a person supplies to create a case (wizard step 0). Name is trimmed and
 * required; `clientId` is a picked client's id; year is an integer in 1900–2100;
 * locale defaults to `it`. Any other key (status, code, project_order_ref, …) is dropped.
 */
export const createCaseStudyInputSchema = z.object({
  name: requiredText,
  clientId: z.uuid("Required."),
  year: z.number().int("Must be a whole number.").min(YEAR_MIN).max(YEAR_MAX),
  locale: localeSchema.default(DEFAULT_LOCALE),
});
export type CreateCaseStudyInput = z.infer<typeof createCaseStudyInputSchema>;

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
