import { z } from "zod";
import { getFormat, isFormatId, type FormatId } from "@/modules/rendering/domain/formats";

/**
 * Exports (Story 5.3): one format of a case's live approved revision as a file. The
 * `export` table and `exports/{contentHash}/{format}.{ext}` belong to this module; the
 * key is built only in its storage adapter.
 */

/** The case has no approved revision: nothing is exported (the guardrail, NFR1). */
export const NOT_APPROVED = "NOT_APPROVED" as const;
/** A format that does not export yet: Video stays *In arrivo* (Story 5.3). */
export const FORMAT_NOT_EXPORTABLE = "FORMAT_NOT_EXPORTABLE" as const;
/** The content changed between the request and the render: ask again. */
export const EXPORT_STALE = "EXPORT_STALE" as const;
/** The rendered file is larger than the `rendering` bucket accepts: asking again draws the same file. */
export const EXPORT_TOO_LARGE = "EXPORT_TOO_LARGE" as const;

/** The `rendering` bucket's per-object limit (`20261105140000_rendering_export.sql`): 50 MB. */
export const EXPORT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * The version of how an export is drawn: the export HTML, the inline fonts and media, the
 * print and screenshot settings. It is part of every content hash, so **bump it whenever
 * export rendering changes** (anything that would make the same content give another
 * file): stored exports are then drawn again instead of being reused.
 */
export const EXPORT_RENDER_VERSION = 1;

/** The formats that export today, in the picker's order. */
export const EXPORT_FORMAT_IDS = ["presentazione_16_9", "carosello_1_1"] as const satisfies readonly FormatId[];
export type ExportFormatId = (typeof EXPORT_FORMAT_IDS)[number];
export const exportFormatIdSchema = z.enum(EXPORT_FORMAT_IDS);

export const isExportFormatId = (value: unknown): value is ExportFormatId =>
  typeof value === "string" && (EXPORT_FORMAT_IDS as readonly string[]).includes(value);

/**
 * Several formats of one case in one ZIP (Story 5.4): the `export` row's format. Its file
 * is `exports/{hash}/bundle.zip`; it holds each ticked format's own stored export.
 */
export const EXPORT_BUNDLE = "bundle" as const;

/** What an `export` row holds: one format's file, or a bundle of several. */
export const EXPORT_RECORD_FORMATS = [...EXPORT_FORMAT_IDS, EXPORT_BUNDLE] as const;
export type ExportRecordFormat = (typeof EXPORT_RECORD_FORMATS)[number];

/** The file each export makes: a PDF, a ZIP of one PNG per slide, or (a bundle) a ZIP of those files. */
export const EXPORT_FILES: Readonly<
  Record<ExportRecordFormat, { extension: "pdf" | "zip"; contentType: "application/pdf" | "application/zip" }>
> = Object.freeze({
  presentazione_16_9: Object.freeze({ extension: "pdf", contentType: "application/pdf" }),
  carosello_1_1: Object.freeze({ extension: "zip", contentType: "application/zip" }),
  bundle: Object.freeze({ extension: "zip", contentType: "application/zip" }),
});

/** A case as a part of an export (Story 5.3). */
export const caseSubjectSchema = z.object({ kind: z.literal("case"), id: z.uuid() });
/** A client's intro document as a part of its pack (Story 5.9a): the intro's own id. */
export const introSubjectSchema = z.object({ kind: z.literal("client_intro"), id: z.uuid() });

/** What one part of an export is made of: a case, or a client's intro (5.10 adds collections). */
export const exportSubjectSchema = z.discriminatedUnion("kind", [caseSubjectSchema, introSubjectSchema]);
export type ExportSubject = z.infer<typeof exportSubjectSchema>;

/** One part of an export: a subject and the approved revision drawn. */
export const exportPartSchema = z.object({ subject: exportSubjectSchema, revisionId: z.uuid() });
export type ExportPart = z.infer<typeof exportPartSchema>;

/** A case's export has exactly one part, its case (Stories 5.3, 5.4). */
const casePartSchema = z.object({ subject: caseSubjectSchema, revisionId: z.uuid() });

/**
 * A client pack's subject (Story 5.9a): the client whose pack it is. Its parts are the
 * client's approved intro (when there is one) and its approved cases, in the client's order.
 */
export const clientSubjectSchema = z.object({ kind: z.literal("client"), id: z.uuid() }).strict();
export type ClientSubject = z.infer<typeof clientSubjectSchema>;

/** The most parts an export holds (the `export.parts` check: 1–200). */
export const EXPORT_MAX_PARTS = 200;

/** A bundle's formats: two or more distinct export formats, sorted (the order the hash takes them in). */
export const bundleFormatsSchema = z
  .array(exportFormatIdSchema)
  .min(2)
  .refine((formats) => new Set(formats).size === formats.length, "formats must be distinct")
  .refine((formats) => formats.every((f, i) => i === 0 || formats[i - 1] < f), "formats must be sorted");

/** A client pack's parts, in order: 1 to `EXPORT_MAX_PARTS`. */
const packPartsSchema = z.array(exportPartSchema).min(1).max(EXPORT_MAX_PARTS);

/**
 * An `export` job's payload: the ordered parts, the format and who asked (the row's
 * `created_by`). A bundle (Story 5.4) names its formats; one job renders each that has
 * no export yet, then zips them. A client pack (Story 5.9a) names its client as
 * `subject` and holds all of the pack's parts, in order.
 */
export const exportPayloadSchema = z.union([
  z.object({ parts: z.array(casePartSchema).length(1), format: exportFormatIdSchema, requestedBy: z.uuid() }).strict(),
  z
    .object({ parts: z.array(casePartSchema).length(1), format: z.literal(EXPORT_BUNDLE), formats: bundleFormatsSchema, requestedBy: z.uuid() })
    .strict(),
  z.object({ subject: clientSubjectSchema, parts: packPartsSchema, format: exportFormatIdSchema, requestedBy: z.uuid() }).strict(),
  z
    .object({
      subject: clientSubjectSchema,
      parts: packPartsSchema,
      format: z.literal(EXPORT_BUNDLE),
      formats: bundleFormatsSchema,
      requestedBy: z.uuid(),
    })
    .strict(),
]);
export type ExportPayload = z.infer<typeof exportPayloadSchema>;

/**
 * What a person asks for: one case in one format (`format`, Story 5.3) or in one or more
 * (`formats`, Story 5.4). The ids are checked against the registry afterwards.
 */
export const requestOneExportInputSchema = z.object({ caseId: z.uuid(), format: z.string().min(1).max(64) });
export const requestExportsInputSchema = z.object({ caseId: z.uuid(), formats: z.array(z.string().min(1).max(64)).min(1).max(8) });
export type RequestExportInput = z.infer<typeof requestOneExportInputSchema> | z.infer<typeof requestExportsInputSchema>;

/** The schema an input is read with: `formats` when it has that key, else `format`. */
export const requestExportInputSchema = (input: unknown) =>
  typeof input === "object" && input !== null && Object.hasOwn(input, "formats") ? requestExportsInputSchema : requestOneExportInputSchema;

/** What a person asks for a client's pack (Story 5.9a): the client in one or more formats, as for a case. */
export const requestOnePackInputSchema = z.object({ clientId: z.uuid(), format: z.string().min(1).max(64) });
export const requestPacksInputSchema = z.object({ clientId: z.uuid(), formats: z.array(z.string().min(1).max(64)).min(1).max(8) });

/** The schema a pack input is read with: `formats` when it has that key, else `format`. */
export const requestPackInputSchema = (input: unknown) =>
  typeof input === "object" && input !== null && Object.hasOwn(input, "formats") ? requestPacksInputSchema : requestOnePackInputSchema;

/** The state of a pack request (Story 5.9a): by the job it enqueued, or by the export it found. */
export const packStatusInputSchema = z.union([
  z.object({ clientId: z.uuid(), jobId: z.uuid() }).strict(),
  z.object({ clientId: z.uuid(), exportId: z.uuid() }).strict(),
]);

/** The state of a request: by the job it enqueued, or by the export it found. */
export const exportStatusInputSchema = z.union([
  z.object({ caseId: z.uuid(), jobId: z.uuid() }).strict(),
  z.object({ caseId: z.uuid(), exportId: z.uuid() }).strict(),
]);
export type ExportStatusInput = z.infer<typeof exportStatusInputSchema>;

/** An `export` row. Immutable once written. */
export const exportRecordSchema = z.object({
  id: z.uuid(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  format: z.enum(EXPORT_RECORD_FORMATS),
  parts: z.array(exportPartSchema).min(1),
  path: z.string().min(1),
  contentType: z.enum(["application/pdf", "application/zip"]),
  sizeBytes: z.number().int().positive(),
  createdBy: z.uuid(),
  createdAt: z.string(),
});
export type ExportRecord = z.infer<typeof exportRecordSchema>;

/** A row to write; the database gives it its id and time. */
export type NewExport = Omit<ExportRecord, "id" | "createdAt">;

/** A result row or a testimonial as the pages bind it. */
interface ResultRow {
  label: string;
  value: string;
}
interface Testimonial {
  quote: string;
  author: string;
}

/**
 * Everything of one part that its pages draw besides the revision: the client's current
 * info (client info is live) and the case's bound fields. Two exports with the same
 * content hash draw the same file.
 */
export interface ExportPartContent {
  part: ExportPart;
  /** The revision document's template ref (`mac-case@1`): another template draws another file. */
  template: string;
  client: {
    name: string;
    sector: string;
    description: string;
    logoId: string | null;
    results: readonly ResultRow[];
    testimonial: Testimonial | null;
  };
  case: {
    year: number | null;
    /** Business line keys, in the case's order. */
    services: readonly string[];
    results: readonly ResultRow[];
    testimonial: Testimonial | null;
  };
}

const rows = (list: readonly ResultRow[]) => list.map((r) => [r.label, r.value]);
const quote = (t: Testimonial | null) => (t === null ? null : [t.quote, t.author]);

/**
 * The canonical text the content hash is taken of: the ordered parts (subject and
 * revision id), each part's client info (name, sector, description, logo id, and the
 * client's results and testimonial, which pages also draw), the case's bound fields
 * (year, services, results, testimonial), each part's template, the format and
 * `EXPORT_RENDER_VERSION`. Arrays, never objects, so key order can't change it. `v1`
 * versions the shape.
 */
export function contentHashInput(parts: readonly ExportPartContent[], format: ExportFormatId): string {
  return JSON.stringify(["export.v1", EXPORT_RENDER_VERSION, format, partRows(parts)]);
}

/** Each part's canonical row: its subject, revision, template, client info and bound case fields. */
function partRows(parts: readonly ExportPartContent[]) {
  return parts.map(({ part, template, client, case: c }) => [
    part.subject.kind,
    part.subject.id.toLowerCase(),
    part.revisionId.toLowerCase(),
    template,
    [client.name, client.sector, client.description, client.logoId?.toLowerCase() ?? null, rows(client.results), quote(client.testimonial)],
    [c.year, [...c.services], rows(c.results), quote(c.testimonial)],
  ]);
}

/** The client a pack is named from and whose fields it draws (Story 5.9a). */
export interface PackClient {
  id: string;
  code: string;
  name: string;
}

/**
 * The canonical text a client pack's content hash is taken of (Story 5.9a): the client
 * (id, code and name, which also name the file), then every part as `contentHashInput`
 * takes it (subject, approved revision, template, the client's info and the bound case
 * fields; an intro part binds no case), in the pack's order, the format and
 * `EXPORT_RENDER_VERSION`. `export.pack.v1` keeps it apart from any case's hash, so a
 * case's own exports and their hashes are unchanged.
 */
export function packHashInput(client: PackClient, parts: readonly ExportPartContent[], format: ExportFormatId): string {
  return JSON.stringify(["export.pack.v1", EXPORT_RENDER_VERSION, format, [client.id.toLowerCase(), client.code, client.name], partRows(parts)]);
}

/**
 * The canonical text a bundle's content hash is taken of (Story 5.4): its formats, sorted,
 * each with its own 5.3 content hash, and the names of the files inside (they carry the
 * case's code and name, which the formats' hashes don't cover). Any change to a format
 * gives a new bundle; the same formats with nothing changed give the same one back.
 */
export function bundleHashInput(formats: readonly { format: ExportFormatId; contentHash: string }[], entryNames: readonly string[]): string {
  const sorted = [...formats].sort((a, b) => (a.format < b.format ? -1 : a.format > b.format ? 1 : 0));
  return JSON.stringify([
    "export.bundle.v1",
    EXPORT_RENDER_VERSION,
    sorted.map(({ format, contentHash }) => [format, contentHash.toLowerCase()]),
    [...entryNames].sort(),
  ]);
}

/** Characters a file name can't hold on common systems, and control characters. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const UNSAFE_IN_FILE_NAME = /[\u0000-\u001f\u007f/\\:*?"<>|]+/g;

/**
 * The downloaded file's name: `{code} {name} – {Format}.{ext}`, e.g.
 * `LUM-2026-01 Rebrand Lumen – Presentazione.pdf`. Characters a file system refuses
 * become a space; runs of spaces collapse; the name part is cut to 120 characters.
 */
export function exportFileName(code: string, name: string, format: ExportFormatId): string {
  return `${fileHead(code, name)} – ${getFormat(format).name}.${EXPORT_FILES[format].extension}`;
}

const cleanName = (text: string) => text.replace(UNSAFE_IN_FILE_NAME, " ").replace(/\s+/g, " ").trim();

/** `{code} {name}`, made safe for a file system; the name part cut to 120 characters. */
function fileHead(code: string, name: string): string {
  const shortName = Array.from(cleanName(name)).slice(0, 120).join("").trim();
  return [cleanName(code), shortName].filter(Boolean).join(" ");
}

/** A bundle's downloaded name (Story 5.4): `{code} {name}.zip`, cleaned as `exportFileName`. */
export function bundleFileName(code: string, name: string): string {
  return `${fileHead(code, name)}.zip`;
}

/** The downloaded name of any export row's file: a format's (`exportFileName`) or a bundle's. */
export function recordFileName(code: string, name: string, format: ExportRecordFormat): string {
  return format === EXPORT_BUNDLE ? bundleFileName(code, name) : exportFileName(code, name, format);
}

/**
 * Where each format's file sits inside a bundle (Story 5.4): a PDF at the root under its
 * 5.3 name, a ZIP of PNGs unpacked into a folder named after the format (`Carosello/01.png`…).
 * Returns the PDF's file name or the folder with a trailing `/`.
 */
export function bundleEntryName(code: string, name: string, format: ExportFormatId): string {
  return EXPORT_FILES[format].extension === "pdf" ? exportFileName(code, name, format) : `${cleanName(getFormat(format).name)}/`;
}

/** `FORMAT_NOT_EXPORTABLE` for a registry format that does not export yet; `null` for an export format or an unknown id. */
export function notExportable(format: string) {
  if (!isFormatId(format) || isExportFormatId(format)) return null;
  return { code: FORMAT_NOT_EXPORTABLE, message: "This format can't be exported yet.", details: { formatId: format } };
}
