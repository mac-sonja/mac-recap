import { describe, expect, it } from "vitest";
import {
  bundleEntryName,
  bundleFileName,
  contentHashInput,
  EXPORT_FILES,
  EXPORT_FORMAT_IDS,
  exportFileName,
  exportPayloadSchema,
  exportStatusInputSchema,
  isExportFormatId,
  notExportable,
  recordFileName,
  requestExportInputSchema,
} from "@/modules/rendering/domain/export";
import { FORMAT_IDS, getFormat } from "@/modules/rendering/domain/formats";

const CASE = "cccccccc-0000-4000-8000-000000000001";
const REV = "eeeeeeee-0000-4000-8000-000000000001";

describe("export formats (Story 5.3)", () => {
  it("exports Presentazione as a PDF and Carosello as a ZIP, matching the registry; Video does not export", () => {
    expect(EXPORT_FORMAT_IDS).toEqual(["presentazione_16_9", "carosello_1_1"]);
    expect(EXPORT_FILES.presentazione_16_9).toEqual({ extension: "pdf", contentType: "application/pdf" });
    expect(EXPORT_FILES.carosello_1_1).toEqual({ extension: "zip", contentType: "application/zip" });
    expect(getFormat("presentazione_16_9").fileType).toBe("pdf");
    expect(getFormat("carosello_1_1").fileType).toBe("zip_png");
    expect(FORMAT_IDS.filter((id) => !isExportFormatId(id))).toEqual(["video_9_16"]);
  });

  it("refuses Video as not exportable, and leaves unknown ids and export formats to the caller", () => {
    expect(notExportable("video_9_16")).toMatchObject({ code: "FORMAT_NOT_EXPORTABLE" });
    expect(notExportable("presentazione_16_9")).toBeNull();
    expect(notExportable("deck_16_9")).toBeNull();
  });
});

describe("exportFileName", () => {
  it("is `{code} {name} – {Format}.{ext}`", () => {
    expect(exportFileName("LUM-2026-01", "Rebrand Lumen", "presentazione_16_9")).toBe("LUM-2026-01 Rebrand Lumen – Presentazione.pdf");
    expect(exportFileName("LUM-2026-01", "Rebrand Lumen", "carosello_1_1")).toBe("LUM-2026-01 Rebrand Lumen – Carosello.zip");
  });

  it("drops characters a file system refuses and collapses spaces", () => {
    expect(exportFileName("LUM-2026-01", ' A/B:\\C*?"<>| \n  D ', "presentazione_16_9")).toBe("LUM-2026-01 A B C D – Presentazione.pdf");
  });

  it("cuts a very long name", () => {
    const name = exportFileName("X", "a".repeat(500), "carosello_1_1");
    expect(name.length).toBeLessThan(150);
    expect(name.endsWith(" – Carosello.zip")).toBe(true);
  });
});

describe("payloads and inputs", () => {
  it("accepts one case part with its approved revision, in an export format, with who asked", () => {
    const payload = { parts: [{ subject: { kind: "case", id: CASE }, revisionId: REV }], format: "carosello_1_1", requestedBy: CASE };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ ...payload, format: "video_9_16" }).success).toBe(false);
    expect(exportPayloadSchema.safeParse({ ...payload, parts: [] }).success).toBe(false);
  });

  it("reads a status by job or by export, never both", () => {
    expect(exportStatusInputSchema.safeParse({ caseId: CASE, jobId: REV }).success).toBe(true);
    expect(exportStatusInputSchema.safeParse({ caseId: CASE, exportId: REV }).success).toBe(true);
    expect(exportStatusInputSchema.safeParse({ caseId: CASE, jobId: REV, exportId: REV }).success).toBe(false);
    expect(exportStatusInputSchema.safeParse({ caseId: CASE }).success).toBe(false);
  });

  it("hashes a versioned array, never an object", () => {
    const text = contentHashInput(
      [
        {
          part: { subject: { kind: "case", id: CASE }, revisionId: REV },
          template: "mac-case@1",
          client: { name: "L", sector: "", description: "", logoId: null, results: [], testimonial: null },
          case: { year: 2026, services: [], results: [], testimonial: null },
        },
      ],
      "presentazione_16_9",
    );
    expect(JSON.parse(text)[0]).toBe("export.v1");
    expect(text).not.toContain("{");
  });
});

describe("bundles (Story 5.4)", () => {
  it("are a ZIP at `bundle.zip`", () => {
    expect(EXPORT_FILES.bundle).toEqual({ extension: "zip", contentType: "application/zip" });
  });

  it("download as `{code} {name}.zip`, cleaned like a format's file", () => {
    expect(bundleFileName("LUM-2026-01", "Rebrand Lumen")).toBe("LUM-2026-01 Rebrand Lumen.zip");
    expect(bundleFileName("LUM-2026-01", ' A/B:\\C*?"<>| \n  D ')).toBe("LUM-2026-01 A B C D.zip");
    expect(recordFileName("LUM-2026-01", "Rebrand Lumen", "bundle")).toBe("LUM-2026-01 Rebrand Lumen.zip");
    expect(recordFileName("LUM-2026-01", "Rebrand Lumen", "carosello_1_1")).toBe("LUM-2026-01 Rebrand Lumen – Carosello.zip");
  });

  it("hold the PDF at the root under its 5.3 name and the Carosello in a folder", () => {
    expect(bundleEntryName("LUM-2026-01", "Rebrand Lumen", "presentazione_16_9")).toBe("LUM-2026-01 Rebrand Lumen – Presentazione.pdf");
    expect(bundleEntryName("LUM-2026-01", "Rebrand Lumen", "carosello_1_1")).toBe("Carosello/");
  });

  it("take a payload of two or more distinct formats, sorted", () => {
    const payload = {
      parts: [{ subject: { kind: "case", id: CASE }, revisionId: REV }],
      format: "bundle",
      formats: ["carosello_1_1", "presentazione_16_9"],
      requestedBy: CASE,
    };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(true);
    for (const formats of [["carosello_1_1"], ["presentazione_16_9", "carosello_1_1"], ["carosello_1_1", "carosello_1_1"], ["carosello_1_1", "video_9_16"]]) {
      expect(exportPayloadSchema.safeParse({ ...payload, formats }).success).toBe(false);
    }
    // A single format's payload names no formats; a bundle always does.
    expect(exportPayloadSchema.safeParse({ ...payload, format: "carosello_1_1" }).success).toBe(false);
    const withoutFormats: Partial<typeof payload> = { ...payload };
    delete withoutFormats.formats;
    expect(exportPayloadSchema.safeParse(withoutFormats).success).toBe(false);
  });

  it("are asked for as `formats`; `format` still asks for one", () => {
    const several = { caseId: CASE, formats: ["presentazione_16_9", "carosello_1_1"] };
    expect(requestExportInputSchema(several).safeParse(several).success).toBe(true);
    const one = { caseId: CASE, format: "carosello_1_1" };
    expect(requestExportInputSchema(one).safeParse(one).success).toBe(true);
    const none = { caseId: CASE, formats: [] };
    expect(requestExportInputSchema(none).safeParse(none).success).toBe(false);
  });
});
