import { describe, expect, it } from "vitest";
import { createDocumentReader } from "@/modules/generation/adapters/documents/document-reader";

/** A two-page PDF with one line of text per page, offsets computed so pdf.js reads it without repair. */
function tinyPdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const fontId = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

describe("document reader (unpdf)", () => {
  it("counts a PDF's pages and extracts its text page by page, leaving the input bytes usable", async () => {
    const reader = createDocumentReader();
    const pdf = tinyPdf(["Prima pagina", "Seconda pagina"]);
    expect(await reader.pdfPageCount(pdf)).toBe(2);
    const text = await reader.pdfText(pdf);
    expect(text).toContain("[pagina 1]\nPrima pagina");
    expect(text).toContain("[pagina 2]\nSeconda pagina");
    expect(pdf.byteLength).toBeGreaterThan(0);
  });

  it("rejects bytes that are not a DOCX", async () => {
    await expect(createDocumentReader().docxText(new TextEncoder().encode("not a zip"))).rejects.toThrow();
  });
});
