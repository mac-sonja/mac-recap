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

/** The formats that export today, in the picker's order. */
export const EXPORT_FORMAT_IDS = ["presentazione_16_9", "carosello_1_1"] as const satisfies readonly FormatId[];
export type ExportFormatId = (typeof EXPORT_FORMAT_IDS)[number];
export const exportFormatIdSchema = z.enum(EXPORT_FORMAT_IDS);

export const isExportFormatId = (value: unknown): value is ExportFormatId =>
  typeof value === "string" && (EXPORT_FORMAT_IDS as readonly string[]).includes(value);

/** The file each export format makes: a PDF, or a ZIP of one PNG per slide. */
export const EXPORT_FILES: Readonly<Record<ExportFormatId, { extension: "pdf" | "zip"; contentType: "application/pdf" | "application/zip" }>> =
  Object.freeze({
    presentazione_16_9: Object.freeze({ extension: "pdf", contentType: "application/pdf" }),
    carosello_1_1: Object.freeze({ extension: "zip", contentType: "application/zip" }),
  });

/** What an export is made of (5.3: a case; 5.9 and 5.10 add client intros and collections). */
export const exportSubjectSchema = z.object({ kind: z.literal("case"), id: z.uuid() });
export type ExportSubject = z.infer<typeof exportSubjectSchema>;

/** One part of an export: a subject and the approved revision drawn. */
export const exportPartSchema = z.object({ subject: exportSubjectSchema, revisionId: z.uuid() });
export type ExportPart = z.infer<typeof exportPartSchema>;

/** An `export` job's payload: the ordered parts, the format and who asked (the row's `created_by`). */
export const exportPayloadSchema = z.object({
  parts: z.array(exportPartSchema).length(1),
  format: exportFormatIdSchema,
  requestedBy: z.uuid(),
});
export type ExportPayload = z.infer<typeof exportPayloadSchema>;

/** What a person asks for: one case in one format (`format` is checked against the registry afterwards). */
export const requestExportInputSchema = z.object({ caseId: z.uuid(), format: z.string().min(1).max(64) });
export type RequestExportInput = z.infer<typeof requestExportInputSchema>;

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
  format: exportFormatIdSchema,
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
 * (year, services, results, testimonial) and the format. Arrays, never objects, so key
 * order can't change it. `v1` versions the shape.
 */
export function contentHashInput(parts: readonly ExportPartContent[], format: ExportFormatId): string {
  return JSON.stringify([
    "export.v1",
    format,
    parts.map(({ part, client, case: c }) => [
      part.subject.kind,
      part.subject.id.toLowerCase(),
      part.revisionId.toLowerCase(),
      [client.name, client.sector, client.description, client.logoId?.toLowerCase() ?? null, rows(client.results), quote(client.testimonial)],
      [c.year, [...c.services], rows(c.results), quote(c.testimonial)],
    ]),
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
  const clean = (text: string) => text.replace(UNSAFE_IN_FILE_NAME, " ").replace(/\s+/g, " ").trim();
  const shortName = Array.from(clean(name)).slice(0, 120).join("").trim();
  const head = [clean(code), shortName].filter(Boolean).join(" ");
  return `${head} – ${getFormat(format).name}.${EXPORT_FILES[format].extension}`;
}

/** `FORMAT_NOT_EXPORTABLE` for a registry format that does not export yet; `null` for an export format or an unknown id. */
export function notExportable(format: string) {
  if (!isFormatId(format) || isExportFormatId(format)) return null;
  return { code: FORMAT_NOT_EXPORTABLE, message: "This format can't be exported yet.", details: { formatId: format } };
}
