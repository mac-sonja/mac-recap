import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { DocumentReader } from "@/modules/generation/ports/narrative-generator";

/** Collapses runs of blank lines and trailing spaces, so extracted text costs fewer tokens. */
const tidy = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Text out of a DOCX (mammoth, raw text: no styles, no images) and a PDF's page count and text
 * (unpdf, pdf.js without a canvas). Worker only (Story 3.6). Each call works on a copy of the
 * bytes, since pdf.js may detach the buffer it is given.
 */
export function createDocumentReader(): DocumentReader {
  return {
    async docxText(bytes) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return tidy(result.value);
    },
    async pdfPageCount(bytes) {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      try {
        return pdf.numPages;
      } finally {
        await pdf.loadingTask.destroy();
      }
    },
    async pdfText(bytes) {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      try {
        const { text } = await extractText(pdf, { mergePages: false });
        return tidy(text.map((page, i) => `[pagina ${i + 1}]\n${page}`).join("\n\n"));
      } finally {
        await pdf.loadingTask.destroy();
      }
    },
  };
}
