import { z } from "zod";
import { err, ok, type Result } from "@/shared/result";

/**
 * The format registry (Story 3.3): the only list of output formats anywhere. No
 * other type carries a canvas ratio; everything that needs a format's size, page
 * model or file type reads it here. Every format is static (no motion) in the MVP.
 */
export const FORMAT_IDS = ["deck_16_9", "social_carousel_4_5", "pdf_a4"] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

export const formatIdSchema = z.enum(FORMAT_IDS);

/** `pages`: a paged document (A4); `slides`: one canvas per slide (deck, carousel). */
export const PAGE_MODELS = ["pages", "slides"] as const;
export type PageModel = (typeof PAGE_MODELS)[number];

/** `pdf`: one PDF file; `zip_png`: a ZIP of one PNG per slide. */
export const FILE_TYPES = ["pdf", "zip_png"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export interface Format {
  id: FormatId;
  /** The format's name as people see it. */
  name: string;
  /** Width to height, e.g. `16:9`. */
  ratio: string;
  /** The canvas in pixels. */
  pixelSize: { width: number; height: number };
  pageModel: PageModel;
  fileType: FileType;
  static: true;
}

export const FORMATS: readonly Format[] = Object.freeze([
  Object.freeze({
    id: "deck_16_9",
    name: "Deck 16:9",
    ratio: "16:9",
    pixelSize: Object.freeze({ width: 1920, height: 1080 }),
    pageModel: "slides",
    fileType: "pdf",
    static: true,
  }),
  Object.freeze({
    id: "social_carousel_4_5",
    name: "Carosello social 4:5",
    ratio: "4:5",
    pixelSize: Object.freeze({ width: 1080, height: 1350 }),
    pageModel: "slides",
    fileType: "zip_png",
    static: true,
  }),
  // A4 portrait at 300 dpi.
  Object.freeze({
    id: "pdf_a4",
    name: "PDF A4",
    ratio: "210:297",
    pixelSize: Object.freeze({ width: 2480, height: 3508 }),
    pageModel: "pages",
    fileType: "pdf",
    static: true,
  }),
] satisfies Format[]);

export const isFormatId = (value: unknown): value is FormatId =>
  typeof value === "string" && (FORMAT_IDS as readonly string[]).includes(value);

/** The registry entry of `id`. */
export function getFormat(id: FormatId): Format {
  const format = FORMATS.find((f) => f.id === id);
  // FORMATS lists every FormatId (tested), so this never happens.
  if (format === undefined) throw new Error(`format ${id} is not in the registry`);
  return format;
}

export const FORMAT_NOT_IN_REVISION = "FORMAT_NOT_IN_REVISION" as const;

/** `FORMAT_NOT_IN_REVISION` naming the format (cut, since it may be arbitrary input). */
export const formatNotInRevision = (formatId: unknown) => ({
  code: FORMAT_NOT_IN_REVISION,
  message: "This format is not part of the revision.",
  details: { formatId: typeof formatId === "string" ? Array.from(formatId).slice(0, 64).join("") : null },
});

/**
 * The per-format entry of a revision's document for `formatId`. A revision's
 * formats are fixed when it is created, so any later operation on a format the
 * revision lacks (or an id outside the registry) is `FORMAT_NOT_IN_REVISION`.
 */
export function requireFormat<Entry>(
  revision: { doc: { formats: Readonly<Record<string, Entry | undefined>> } },
  formatId: unknown,
): Result<Entry> {
  if (!isFormatId(formatId) || !Object.hasOwn(revision.doc.formats, formatId)) return err(formatNotInRevision(formatId));
  const entry = revision.doc.formats[formatId];
  return entry === undefined ? err(formatNotInRevision(formatId)) : ok(entry);
}
