import type { DocumentReader } from "@/modules/generation/ports/narrative-generator";
import { log } from "@/shared/log";

/** The request's material budget: base64 bytes of files plus UTF-8 bytes of text, under the API's 32 MB request limit. */
export const REQUEST_BUDGET_BYTES = 30 * 1024 * 1024;
/**
 * PDF pages sent whole, all PDFs together. The API reads up to 600 per request, but each page
 * costs its text plus a page image (about 1,500–3,000 tokens), so 200 keeps the request well
 * inside the 1M-token context; further PDFs go as their text.
 */
export const MAX_PDF_PAGES = 200;
/** Characters of extracted text sent at most, all documents together; the rest is cut and logged. */
export const MAX_EXTRACTED_CHARS = 600_000;

/** A document of an AI request: a PDF as it is, or extracted text. */
export type RequestDocument = { assetId: string; kind: "pdf"; bytes: Uint8Array } | { assetId: string; kind: "text"; text: string };

/** The base64 size of `n` bytes. */
export const base64Size = (n: number) => Math.ceil(n / 3) * 4;
const utf8Size = (text: string) => Buffer.byteLength(text, "utf8");

/**
 * The documents of one AI request and its budget (Story 3.6's rules, shared by the case and the
 * client intro, Story 3.9): text cut at the extracted-text limit; PDFs whole while they fit the
 * byte budget and the 200-page limit, else as their extracted text; an unreadable PDF skipped.
 * `logIds` go on every log line (ids only, never text).
 */
export function requestDocuments(reader: DocumentReader, logIds: Record<string, string>) {
  const documents: RequestDocument[] = [];
  let budget = REQUEST_BUDGET_BYTES;
  let pdfPages = 0;
  let extractedChars = 0;

  /** Adds extracted text, cut to what is left of the extracted-text limit (nothing when it is reached). */
  const addText = (assetId: string, raw: string) => {
    const room = MAX_EXTRACTED_CHARS - extractedChars;
    if (room <= 0) {
      log.warn(`generate leaves out the text of ${assetId}: the extracted-text limit is reached`, logIds);
      return;
    }
    const text = raw.length > room ? raw.slice(0, room) : raw;
    if (text.length < raw.length) log.warn(`generate cuts the text of ${assetId} to the extracted-text limit`, logIds);
    extractedChars += text.length;
    budget -= utf8Size(text);
    documents.push({ assetId, kind: "text", text });
  };

  /** Adds a PDF whole while it fits, else its text; a PDF the reader cannot read is skipped and logged. */
  const addPdf = async (assetId: string, bytes: Uint8Array) => {
    try {
      const pages = await reader.pdfPageCount(bytes);
      const size = base64Size(bytes.byteLength);
      if (pdfPages + pages <= MAX_PDF_PAGES && size <= budget) {
        pdfPages += pages;
        budget -= size;
        documents.push({ assetId, kind: "pdf", bytes });
      } else {
        log.info(`generate sends the PDF ${assetId} as text (${pages} pages, ${bytes.byteLength} bytes)`, logIds);
        addText(assetId, await reader.pdfText(bytes));
      }
    } catch (error) {
      log.warn(`generate skips an unreadable PDF ${assetId} (${error instanceof Error ? error.name : typeof error})`, logIds);
    }
  };

  return {
    documents,
    addText,
    addPdf,
    /** Bytes left in the request budget. */
    remaining: () => budget,
    /** Spends `bytes` of the budget (an image). */
    spend: (bytes: number) => {
      budget -= bytes;
    },
  };
}
