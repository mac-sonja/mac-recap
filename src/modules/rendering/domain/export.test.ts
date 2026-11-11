import { describe, expect, it } from "vitest";
import {
  bundleEntryName,
  bundleFileName,
  collectionFileName,
  collectionHashInput,
  collectionStatusInputSchema,
  contentHashInput,
  EXPORT_FILES,
  EXPORT_FORMAT_IDS,
  exportFileName,
  exportPayloadSchema,
  exportStatusInputSchema,
  isExportFormatId,
  notExportable,
  packHashInput,
  packStatusInputSchema,
  recordFileName,
  requestCollectionInputSchema,
  requestPackInputSchema,
  type ExportPartContent,
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

describe("client packs (Story 5.9a)", () => {
  const CLIENT = "dddddddd-0000-4000-8000-000000000001";
  const INTRO = "bbbbbbbb-0000-4000-8000-000000000001";
  const OTHER = "cccccccc-0000-4000-8000-000000000002";
  const casePart = { subject: { kind: "case" as const, id: CASE }, revisionId: REV };
  const introPart = { subject: { kind: "client_intro" as const, id: INTRO }, revisionId: REV };
  const content = (part: ExportPartContent["part"]): ExportPartContent => ({
    part,
    template: "mac-case@1",
    client: { name: "Lumen", sector: "Lusso", description: "", logoId: null, results: [], testimonial: null },
    case: { year: 2026, services: [], results: [], testimonial: null },
  });
  const client = { id: CLIENT, code: "LUM", name: "Lumen Srl" };

  it("take a payload naming the client, with all the pack's parts in order", () => {
    const payload = { subject: { kind: "client", id: CLIENT }, parts: [introPart, casePart], format: "presentazione_16_9", requestedBy: CASE };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ ...payload, format: "bundle", formats: ["carosello_1_1", "presentazione_16_9"] }).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ ...payload, parts: [] }).success).toBe(false);
    expect(exportPayloadSchema.safeParse({ ...payload, subject: { kind: "case", id: CASE } }).success).toBe(false);
  });

  it("keep a case's payload to its one case part", () => {
    const payload = { parts: [introPart], format: "presentazione_16_9", requestedBy: CASE };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(false);
    expect(exportPayloadSchema.safeParse({ ...payload, parts: [casePart, casePart] }).success).toBe(false);
  });

  it("are asked for by client and read by job or by export", () => {
    expect(requestPackInputSchema({ clientId: CLIENT, formats: ["x"] }).safeParse({ clientId: CLIENT, formats: ["x"] }).success).toBe(true);
    expect(requestPackInputSchema({ clientId: CLIENT, format: "x" }).safeParse({ clientId: CLIENT, format: "x" }).success).toBe(true);
    expect(packStatusInputSchema.safeParse({ clientId: CLIENT, jobId: REV }).success).toBe(true);
    expect(packStatusInputSchema.safeParse({ clientId: CLIENT, exportId: REV, jobId: REV }).success).toBe(false);
  });

  it("hash apart from a case's export, and change with the parts' order, a part's revision and the client's fields", () => {
    const parts = [content(introPart), content(casePart), content({ subject: { kind: "case", id: OTHER }, revisionId: REV })];
    const base = packHashInput(client, parts, "presentazione_16_9");
    expect(JSON.parse(base)[0]).toBe("export.pack.v1");
    expect(base).not.toContain("{");
    expect(base).not.toBe(contentHashInput(parts, "presentazione_16_9"));
    expect(packHashInput(client, [parts[0], parts[2], parts[1]], "presentazione_16_9")).not.toBe(base);
    expect(packHashInput(client, [parts[0], content({ ...casePart, revisionId: INTRO }), parts[2]], "presentazione_16_9")).not.toBe(base);
    expect(packHashInput({ ...client, name: "Lumen SpA" }, parts, "presentazione_16_9")).not.toBe(base);
    expect(packHashInput(client, parts, "carosello_1_1")).not.toBe(base);
    expect(packHashInput(client, parts, "presentazione_16_9")).toBe(base);
  });
});

describe("collections (Story 5.10b)", () => {
  const COLLECTION = "c0c0c0c0-0000-4000-8000-000000000001";
  const CLIENT = "dddddddd-0000-4000-8000-000000000001";
  const OTHER = "cccccccc-0000-4000-8000-000000000002";
  const casePart = { subject: { kind: "case" as const, id: CASE }, revisionId: REV };
  const otherPart = { subject: { kind: "case" as const, id: OTHER }, revisionId: REV };
  const content = (part: ExportPartContent["part"], clientName = "Lumen"): ExportPartContent => ({
    part,
    template: "mac-case@1",
    client: { name: clientName, sector: "Lusso", description: "", logoId: null, results: [], testimonial: null },
    case: { year: 2026, services: [], results: [], testimonial: null },
  });
  const collection = { id: COLLECTION, name: "Pitch moda" };

  it("take a payload naming the collection, with all its parts in order", () => {
    const payload = { subject: { kind: "collection", id: COLLECTION }, parts: [casePart, otherPart], format: "presentazione_16_9", requestedBy: CASE };
    expect(exportPayloadSchema.safeParse(payload).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ ...payload, format: "bundle", formats: ["carosello_1_1", "presentazione_16_9"] }).success).toBe(true);
    expect(exportPayloadSchema.safeParse({ ...payload, parts: [] }).success).toBe(false);
    expect(exportPayloadSchema.safeParse({ ...payload, subject: { kind: "collection", id: "x" } }).success).toBe(false);
  });

  it("are asked for by collection and read by job or by export", () => {
    const one = { collectionId: COLLECTION, format: "x" };
    const many = { collectionId: COLLECTION, formats: ["x", "y"] };
    expect(requestCollectionInputSchema(one).safeParse(one).success).toBe(true);
    expect(requestCollectionInputSchema(many).safeParse(many).success).toBe(true);
    expect(collectionStatusInputSchema.safeParse({ collectionId: COLLECTION, jobId: REV }).success).toBe(true);
    expect(collectionStatusInputSchema.safeParse({ collectionId: COLLECTION, exportId: REV, jobId: REV }).success).toBe(false);
  });

  it("hash apart from a case's export and a pack, and change with the name, the order, a revision and a client's fields", () => {
    const parts = [content(casePart), content(otherPart, "Oro")];
    const base = collectionHashInput(collection, parts, "presentazione_16_9");
    expect(JSON.parse(base)[0]).toBe("export.collection.v2");
    expect(base).not.toBe(contentHashInput(parts, "presentazione_16_9"));
    expect(base).not.toBe(packHashInput({ id: CLIENT, code: "", name: "Pitch moda" }, parts, "presentazione_16_9"));
    expect(collectionHashInput({ ...collection, name: "Pitch lusso" }, parts, "presentazione_16_9")).not.toBe(base);
    expect(collectionHashInput(collection, [parts[1], parts[0]], "presentazione_16_9")).not.toBe(base);
    expect(collectionHashInput(collection, [content({ ...casePart, revisionId: OTHER }), parts[1]], "presentazione_16_9")).not.toBe(base);
    expect(collectionHashInput(collection, [parts[0], content(otherPart, "Oro Srl")], "presentazione_16_9")).not.toBe(base);
    expect(collectionHashInput(collection, parts, "carosello_1_1")).not.toBe(base);
    expect(collectionHashInput(collection, parts, "presentazione_16_9")).toBe(base);
  });

  it("hash the edits that take effect (Story 5.11b): canonical, and any change gives another", () => {
    const parts = [content(casePart), content(otherPart, "Oro")];
    const base = collectionHashInput(collection, parts, "presentazione_16_9");
    expect(collectionHashInput(collection, parts, "presentazione_16_9", [])).toBe(base);
    const a = { partKey: `case:${CASE}`, texts: [["p1", "e2", "Due"], ["p1", "e1", "Uno"]] as const, hidden: ["p3", "p2"], order: null };
    const b = { partKey: `client_intro:${CLIENT}`, texts: [], hidden: [], order: ["b", "a"] };
    const edited = collectionHashInput(collection, parts, "presentazione_16_9", [a, b]);
    expect(edited).not.toBe(base);
    // The same edits in any order: the same hash.
    const shuffled = { ...a, texts: [a.texts[1], a.texts[0]], hidden: ["p2", "p3"] };
    expect(collectionHashInput(collection, parts, "presentazione_16_9", [b, shuffled])).toBe(edited);
    expect(collectionHashInput(collection, parts, "presentazione_16_9", [{ ...a, texts: [["p1", "e1", "Uno!"]] }, b])).not.toBe(edited);
    expect(collectionHashInput(collection, parts, "presentazione_16_9", [{ ...a, hidden: ["p2"] }, b])).not.toBe(edited);
    expect(collectionHashInput(collection, parts, "presentazione_16_9", [a, { ...b, order: ["a", "b"] }])).not.toBe(edited);
    expect(collectionHashInput(collection, parts, "presentazione_16_9", [a])).not.toBe(edited);
  });

  it("name the file after the collection, without a code", () => {
    expect(recordFileName("", "Pitch moda", "presentazione_16_9")).toBe("Pitch moda – Presentazione.pdf");
    expect(recordFileName("", "Pitch: moda/lusso", "bundle")).toBe("Pitch moda lusso.zip");
    expect(bundleEntryName("", "Pitch moda", "presentazione_16_9")).toBe("Pitch moda – Presentazione.pdf");
    expect(bundleEntryName("", "Pitch moda", "carosello_1_1")).toBe(`${getFormat("carosello_1_1").name}/`);
  });

  it("fall back to Raccolta when nothing of the name is safe in a file name", () => {
    expect(collectionFileName("Pitch moda")).toBe("Pitch moda");
    const name = collectionFileName("/:/");
    expect(name).toBe("Raccolta");
    expect(recordFileName("", name, "presentazione_16_9")).toBe("Raccolta – Presentazione.pdf");
    expect(recordFileName("", name, "bundle")).toBe("Raccolta.zip");
    expect(bundleEntryName("", name, "presentazione_16_9")).toBe("Raccolta – Presentazione.pdf");
  });
});
