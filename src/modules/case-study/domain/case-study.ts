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

/** Accepted client sector length, in characters (code points) after trimming (AD-22; the DB checks it too). */
export const CLIENT_SECTOR_MAX = 60;
/** Accepted client description length, in characters (code points) after trimming (AD-22; the DB checks it too). */
export const CLIENT_DESCRIPTION_MAX = 400;

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
 * The message of a too-long sector or description issue: `parseClientInput`
 * turns those into `CLIENT_FIELD_TOO_LONG`.
 */
export const FIELD_TOO_LONG = "Too long.";

/** Postgres text can't hold U+0000: refused as a field error, never a generic write failure. */
const NO_NUL = (value: string) => !value.includes("\u0000");
export const INVALID_CHARACTER = "Invalid character.";

const trimToNull = (value: string | null | undefined) => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * An optional plain-text client field: trimmed, blank → null, at most `max`
 * characters, no U+0000. `required` (edit): the key must be present (a string or
 * null), so a missing key never erases stored text; otherwise (add) it may be absent.
 */
const clientText = (max: number, { required }: { required: boolean }) => {
  const text = z.string().refine(NO_NUL, { message: INVALID_CHARACTER });
  return (required ? text.nullable() : text.nullish())
    .transform(trimToNull)
    .refine((value) => value === null || charCount(value) <= max, { message: FIELD_TOO_LONG });
};

/** The client's own words: sector (≤60) and description (≤400), both optional. */
export const clientInfoSchema = z.object({
  sector: clientText(CLIENT_SECTOR_MAX, { required: false }),
  description: clientText(CLIENT_DESCRIPTION_MAX, { required: false }),
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

/** A client with its info (AD-22). `logoId` is the current `client_logo` row, or null. */
export const clientSchema = clientRefSchema.extend({
  sector: z.string().nullable(),
  description: z.string().nullable(),
  logoId: z.uuid().nullable(),
});
export type Client = z.infer<typeof clientSchema>;

/** A client on its page: with a signed URL for its logo, or null (no logo, or it could not be signed). */
export type ClientDetail = Client & { logoUrl: string | null };

/**
 * What `case-study` hands to `generation` (AD-22): the client's current values.
 * Epic 3 copies it into each `generate` job and revision.
 */
export const clientSnapshotSchema = z.object({
  clientId: z.uuid(),
  name: z.string(),
  sector: z.string().nullable(),
  description: z.string().nullable(),
  logoId: z.uuid().nullable(),
});
export type ClientSnapshot = z.infer<typeof clientSnapshotSchema>;

/** A client name a person supplies: trimmed, 1–120 characters. */
export const clientNameSchema = z.string().trim().min(1, "Required.").max(CLIENT_NAME_MAX);

/**
 * What a person supplies to add a client: the name and, optionally, sector and
 * description; the code is assigned in SQL and the logo is linked afterwards
 * through `updateClient`. Any other key is dropped.
 */
export const createClientInputSchema = clientInfoSchema.extend({ name: clientNameSchema });
export type CreateClientInput = z.infer<typeof createClientInputSchema>;

/**
 * What a person supplies to edit a client: every field, as it should be after the
 * save. `sector`, `description` and `logoId` are required but nullable, so a
 * missing key never erases stored data; `logoId` is a confirmed logo of this
 * client (a `client_logo` row) or null to show none.
 * The code never changes.
 */
export const updateClientInputSchema = z.object({
  clientId: z.uuid("Required."),
  name: clientNameSchema,
  sector: clientText(CLIENT_SECTOR_MAX, { required: true }),
  description: clientText(CLIENT_DESCRIPTION_MAX, { required: true }),
  logoId: z.uuid().nullable(),
});
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

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

/** A client with the number of its non-deleted case studies (the Clients page). */
export type ClientSummary = ClientRef & { caseCount: number };

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
