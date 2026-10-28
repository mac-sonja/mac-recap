import { describe, expect, expectTypeOf, it } from "vitest";
import { MATERIAL_REF_KINDS as MATERIAL_MODULE_REF_KINDS, type MaterialRef } from "@/modules/material";
import { FORMAT_IDS, starterPages, type TemplateContext } from "@/modules/rendering";
import { upgrade as upgradeWith, type DefaultPages, type Page } from "@/modules/generation/domain/document";
import {
  caseHistoryV0,
  caseHistoryV1,
  caseHistoryV2,
  caseStudyDocumentSchema,
  clientIntroV1,
  clientIntroV2,
  CASE_BINDING_FIELDS,
  CLIENT_BINDING_FIELDS,
  ELEMENT_TYPES,
  LEGACY_FORMAT_IDS,
  MATERIAL_REF_KINDS,
  RESULT_ROW_FIELDS,
  UPGRADE_ID_PREFIX,
  upgrade,
  validateNewDocument,
  type CaseStudyDocument,
  type DocumentElement,
  type DocumentIssue,
  type DocumentMaterialRef,
} from "@/modules/generation";

const issuesOf = (result: { ok: boolean; error?: { details?: unknown } }) =>
  ((result.error?.details as { issues?: DocumentIssue[] } | undefined)?.issues ?? []);

const codeOf = (result: { ok: true } | { ok: false; error: { code: string } }) => (result.ok ? "ok" : result.error.code);

/** The fixture's pages of one format (default: Presentazione). */
const pagesOf = (doc: CaseStudyDocument, formatId: string = "presentazione_16_9") => doc.formats[formatId].pages;
/** An element of the fixture's Presentazione, by page, block and element index. */
const elementAt = (doc: CaseStudyDocument, page: number, block: number, element: number) =>
  pagesOf(doc)[page].blocks[block].elements[element] as Record<string, unknown>;
const elementPath = (page: number, block: number, element: number) =>
  `formats.presentazione_16_9.pages.${page}.blocks.${block}.elements.${element}`;

const typesOf = (elements: readonly DocumentElement[]): string[] =>
  elements.flatMap((el) => (el.type === "text_group" || el.type === "row" ? [el.type, ...typesOf(el.items)] : [el.type]));
const elementTypesOf = (doc: CaseStudyDocument) =>
  new Set(Object.values(doc.formats).flatMap(({ pages }) => pages.flatMap((p) => p.blocks.flatMap((b) => typesOf(b.elements)))));

/** The fixture's first row (client block): a group holding the meta line, then the logos. */
const ROW = [0, 1, 6] as const;
const metaLine = (doc: CaseStudyDocument) =>
  ((elementAt(doc, ...ROW).items as Record<string, unknown>[])[0].items as Record<string, unknown>[])[0];
const META_PATH = `${elementPath(...ROW)}.items.0.items.0`;

describe("the text refs match material's MaterialRef", () => {
  it("has the same kinds", () => {
    expect([...MATERIAL_REF_KINDS]).toEqual([...MATERIAL_MODULE_REF_KINDS]);
  });

  it("has the same type", () => {
    expectTypeOf<DocumentMaterialRef>().toEqualTypeOf<MaterialRef>();
  });
});

describe("validateNewDocument (the I/O matrix)", () => {
  it("accepts a v2 case history with the three formats and every element type", () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    expect(Object.keys(doc.formats)).toEqual([...FORMAT_IDS]);
    expect([...elementTypesOf(doc)].sort()).toEqual([...ELEMENT_TYPES].sort());
    expect(validateNewDocument(doc)).toEqual({ ok: true, value: doc });
  });

  it("accepts a v2 client intro", () => {
    const doc = clientIntroV2(FORMAT_IDS);
    expect(validateNewDocument(doc)).toEqual({ ok: true, value: doc });
  });

  it("accepts formats with no pages, and a case history without Sfida, Idea or Risultati (answer 5)", () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    doc.formats.video_9_16.pages = [];
    doc.formats.carosello_1_1.pages = doc.formats.carosello_1_1.pages.filter((p) => p.section !== "risultati");
    expect(validateNewDocument(doc).ok).toBe(true);
  });

  describe("bound texts", () => {
    it("accepts a text with a binding and no text: the document holds no value", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      const bound = elementAt(doc, 0, 1, 0);
      expect(bound).toEqual({
        elementId: expect.any(String),
        type: "text",
        style: "title",
        binding: { record: "client", field: "name" },
        provenance: "generated",
      });
      expect(validateNewDocument(doc).ok).toBe(true);
    });

    it.each([
      ["both text and binding", (el: Record<string, unknown>) => (el.text = "Acme")],
      ["neither text nor binding", (el: Record<string, unknown>) => delete el.binding],
    ])("rejects %s with DOCUMENT_INVALID", (_name, mutate) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(elementAt(doc, 0, 1, 0));
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toEqual([elementPath(0, 1, 0)]);
    });

    it("rejects a group item with neither text nor binding", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      delete (elementAt(doc, 0, 0, 0).items as Record<string, unknown>[])[0].text;
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toEqual([`${elementPath(0, 0, 0)}.items.0`]);
    });

    it.each([
      ["an unknown record", { record: "project", field: "name" }, "binding.record"],
      ["an unknown field", { record: "client", field: "logo" }, "binding.field"],
      ["a client field on the case", { record: "case", field: "sector" }, "binding.field"],
      ["a value next to the field", { record: "client", field: "name", value: "Acme" }, "binding"],
      ["a result field without index", { record: "case", field: "resultValue" }, "binding.index"],
      ["an index on another field", { record: "client", field: "name", index: 0 }, "binding.index"],
      ["index 3", { record: "case", field: "resultLabel", index: 3 }, "binding.index"],
      ["a negative index", { record: "client", field: "resultLabel", index: -1 }, "binding.index"],
      ["a fractional index", { record: "client", field: "resultLabel", index: 0.5 }, "binding.index"],
    ])("rejects a binding with %s", (_name, binding, path) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 0, 1, 0).binding = binding;
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toContain(`${elementPath(0, 1, 0)}.${path}`);
    });

    it.each([
      ["every client field", CLIENT_BINDING_FIELDS, "client"],
      ["every case field", CASE_BINDING_FIELDS, "case"],
    ] as const)("accepts %s, result rows 0–2 with an index", (_name, fields, record) => {
      for (const field of fields) {
        const rows = (RESULT_ROW_FIELDS as readonly string[]).includes(field) ? [0, 1, 2] : [undefined];
        for (const index of rows) {
          const doc = caseHistoryV2(FORMAT_IDS);
          elementAt(doc, 0, 1, 0).binding = index === undefined ? { record, field } : { record, field, index };
          expect(validateNewDocument(doc).ok, `${record}.${field}[${index}]`).toBe(true);
        }
      }
    });

    it("accepts a text bound to two or three fields (the meta line), holding no value", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      expect(metaLine(doc).bindings).toEqual([
        { record: "client", field: "sector" },
        { record: "case", field: "year" },
      ]);
      expect(validateNewDocument(doc).ok).toBe(true);
      (metaLine(doc).bindings as unknown[]).push({ record: "client", field: "name" });
      expect(validateNewDocument(doc).ok).toBe(true);
    });

    it.each([
      ["one binding in the list", (el: Record<string, unknown>) => (el.bindings = [{ record: "client", field: "sector" }]), `${META_PATH}.bindings`],
      [
        "four bindings",
        (el: Record<string, unknown>) => (el.bindings = [...(el.bindings as unknown[]), { record: "client", field: "name" }, { record: "client", field: "description" }]),
        `${META_PATH}.bindings`,
      ],
      ["bindings and text", (el: Record<string, unknown>) => (el.text = "Illuminazione · 2026"), META_PATH],
      ["bindings and binding", (el: Record<string, unknown>) => (el.binding = { record: "client", field: "name" }), META_PATH],
      ["a bad field in the list", (el: Record<string, unknown>) => ((el.bindings as Record<string, unknown>[])[1].field = "sector"), `${META_PATH}.bindings.1.field`],
    ])("rejects %s with DOCUMENT_INVALID", (_name, mutate, path) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(metaLine(doc));
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toContain(path);
    });
  });

  describe("template amendments (Story 3.4)", () => {
    it("accepts rows, alpha colours on texts, dividers and ink, block paddings, page margin and the star", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      expect(elementAt(doc, ...ROW)).toMatchObject({ type: "row", align: "centre", wide: true });
      expect(pagesOf(doc)[2].blocks[0]).toMatchObject({ padding: 28, ink: "#FFFFFF" });
      expect(pagesOf(doc)[1]).toMatchObject({ margin: 0, decoration: "star" });
      elementAt(doc, 2, 0, 0).colour = "#01223499";
      pagesOf(doc)[2].blocks[0].ink = "#ffffffa6";
      expect(validateNewDocument(doc).ok).toBe(true);
    });

    it.each([
      ["an image in a row", (d: CaseStudyDocument) => ((elementAt(d, ...ROW).items as unknown[])[1] = { elementId: "ffffffff-0000-4000-8000-000000000001", type: "image", assetId: null, fit: "fill" }), `${elementPath(...ROW)}.items.1.type`],
      ["a divider in a row", (d: CaseStudyDocument) => ((elementAt(d, ...ROW).items as unknown[])[1] = { elementId: "ffffffff-0000-4000-8000-000000000001", type: "divider" }), `${elementPath(...ROW)}.items.1.type`],
      ["a row in a row", (d: CaseStudyDocument) => ((elementAt(d, ...ROW).items as unknown[])[1] = { elementId: "ffffffff-0000-4000-8000-000000000001", type: "row", align: "top", items: [] }), `${elementPath(...ROW)}.items.1.type`],
      ["an empty row", (d: CaseStudyDocument) => (elementAt(d, ...ROW).items = []), `${elementPath(...ROW)}.items`],
      ["a bottom row", (d: CaseStudyDocument) => (elementAt(d, ...ROW).align = "bottom"), `${elementPath(...ROW)}.align`],
      ["a row without align", (d: CaseStudyDocument) => delete elementAt(d, ...ROW).align, `${elementPath(...ROW)}.align`],
      ["over 20 items in a row", (d: CaseStudyDocument) => (elementAt(d, ...ROW).items = Array.from({ length: 21 }, (_, i) => ({ elementId: `ffffffff-0000-4000-8000-${String(i).padStart(12, "0")}`, type: "logos" }))), `${elementPath(...ROW)}.items`],
      ["an alpha page background", (d: CaseStudyDocument) => (pagesOf(d)[0].background = { kind: "colour", value: "#FFFFFFA6" }), "formats.presentazione_16_9.pages.0.background.value"],
      ["a short alpha text colour", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 0).colour = "#FFFA"), "formats.presentazione_16_9.pages.2.blocks.0.elements.0.colour"],
      ["a divider colour name", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 1).colour = "grey"), "formats.presentazione_16_9.pages.2.blocks.0.elements.1.colour"],
      ["an ink name", (d: CaseStudyDocument) => (pagesOf(d)[2].blocks[0].ink = "white"), "formats.presentazione_16_9.pages.2.blocks.0.ink"],
      ["a negative padding", (d: CaseStudyDocument) => (pagesOf(d)[2].blocks[0].padding = -1), "formats.presentazione_16_9.pages.2.blocks.0.padding"],
      ["a top padding over 1000 px", (d: CaseStudyDocument) => (pagesOf(d)[1].blocks[3].paddingTop = 1001), "formats.presentazione_16_9.pages.1.blocks.3.paddingTop"],
      ["a negative margin", (d: CaseStudyDocument) => (pagesOf(d)[2].margin = -4), "formats.presentazione_16_9.pages.2.margin"],
      ["an unknown decoration", (d: CaseStudyDocument) => ((pagesOf(d)[1] as Record<string, unknown>).decoration = "moon"), "formats.presentazione_16_9.pages.1.decoration"],
    ])("rejects %s", (_name, mutate, path) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(doc);
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toContain(path);
    });

    it("rejects an element id used twice through a row's group", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      metaLine(doc).elementId = elementAt(doc, 0, 0, 0).elementId;
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result)).toEqual([expect.objectContaining({ path: "formats.presentazione_16_9", message: expect.stringContaining("elementId") })]);
    });
  });

  describe("ids", () => {
    it.each([
      ["a page key", (d: CaseStudyDocument) => (pagesOf(d)[1].pageKey = pagesOf(d)[0].pageKey), "pageKey"],
      ["a block id", (d: CaseStudyDocument) => (pagesOf(d)[1].blocks[0].blockId = pagesOf(d)[0].blocks[0].blockId), "blockId"],
      ["an element id across blocks", (d: CaseStudyDocument) => (elementAt(d, 1, 0, 0).elementId = elementAt(d, 0, 1, 0).elementId), "elementId"],
      [
        "an element id inside a text group",
        (d: CaseStudyDocument) => ((elementAt(d, 0, 0, 0).items as Record<string, unknown>[])[1].elementId = elementAt(d, 0, 0, 0).elementId),
        "elementId",
      ],
    ])("rejects %s used twice in one format", (_name, mutate, name) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(doc);
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result)).toEqual([expect.objectContaining({ path: "formats.presentazione_16_9", message: expect.stringContaining(name) })]);
    });

    it("accepts the same ids in two formats (independent copies)", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      expect(pagesOf(doc, "carosello_1_1")[0].blocks[0].blockId).toBe(pagesOf(doc)[0].blocks[0].blockId);
      expect(validateNewDocument(doc).ok).toBe(true);
    });

    it.each([
      ["a non-uuid block id", (d: CaseStudyDocument) => (pagesOf(d)[0].blocks[0].blockId = "b1"), "formats.presentazione_16_9.pages.0.blocks.0.blockId"],
      ["a non-uuid element id", (d: CaseStudyDocument) => (elementAt(d, 0, 1, 2).elementId = "e1"), `${elementPath(0, 1, 2)}.elementId`],
      ["a malformed page key", (d: CaseStudyDocument) => (pagesOf(d)[0].pageKey = "Intro Page"), "formats.presentazione_16_9.pages.0.pageKey"],
    ])("rejects %s", (_name, mutate, path) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(doc);
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toContain(path);
    });
  });

  describe("media", () => {
    it.each(["fill", "fit"])("rejects a crop with fit %s", (fit) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 1, 1, 0).fit = fit;
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toEqual([`${elementPath(1, 1, 0)}.crop`]);
    });

    it("rejects a crop on a video without fit crop", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 1, 2, 0).crop = { x: 0, y: 0, zoom: 1 };
      expect(issuesOf(validateNewDocument(doc)).map((i) => i.path)).toEqual([`${elementPath(1, 2, 0)}.crop`]);
    });

    it("accepts a crop at its bounds, and a crop fit without a crop", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 1, 1, 0).crop = { x: 1, y: 0, zoom: 4 };
      elementAt(doc, 1, 0, 0).fit = "crop";
      expect(validateNewDocument(doc).ok).toBe(true);
    });

    it.each([
      ["x below 0", { x: -0.1, y: 0, zoom: 1 }, "x"],
      ["y above 1", { x: 0, y: 1.1, zoom: 1 }, "y"],
      ["zoom below 1", { x: 0, y: 0, zoom: 0.5 }, "zoom"],
      ["zoom above 4", { x: 0, y: 0, zoom: 4.5 }, "zoom"],
    ])("rejects a crop with %s", (_name, crop, key) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 1, 1, 0).crop = crop;
      expect(issuesOf(validateNewDocument(doc)).map((i) => i.path)).toEqual([`${elementPath(1, 1, 0)}.crop.${key}`]);
    });

    it("accepts an empty image (null asset, exported transparent)", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 1, 0, 0).assetId = null;
      expect(validateNewDocument(doc).ok).toBe(true);
    });

    it.each([
      ["an animation fit of crop", (el: Record<string, unknown>) => (el.fit = "crop"), "fit"],
      ["an animation size under 50%", (el: Record<string, unknown>) => (el.size = 49), "size"],
      ["an animation size over 150%", (el: Record<string, unknown>) => (el.size = 151), "size"],
      ["an unknown animation", (el: Record<string, unknown>) => (el.animation = "spin"), "animation"],
      ["a non-uuid animation asset", (el: Record<string, unknown>) => (el.assetIds = ["logo.png"]), "assetIds.0"],
    ])("rejects %s", (_name, mutate, key) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(elementAt(doc, 1, 3, 0));
      expect(issuesOf(validateNewDocument(doc)).map((i) => i.path)).toEqual([`${elementPath(1, 3, 0)}.${key}`]);
    });
  });

  describe("pages, blocks and elements", () => {
    it.each([
      ["an unknown element type", (d: CaseStudyDocument) => (elementAt(d, 0, 1, 3).type = "button"), `${elementPath(0, 1, 3)}.type`],
      ["an unknown text style", (d: CaseStudyDocument) => (elementAt(d, 0, 1, 0).style = "huge"), `${elementPath(0, 1, 0)}.style`],
      ["three columns", (d: CaseStudyDocument) => (elementAt(d, 2, 1, 0).columns = 3), "formats.presentazione_16_9.pages.2.blocks.1.elements.0.columns"],
      ["a colour name", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 0).colour = "white"), "formats.presentazione_16_9.pages.2.blocks.0.elements.0.colour"],
      ["an unknown provenance", (d: CaseStudyDocument) => (elementAt(d, 0, 1, 0).provenance = "verified"), `${elementPath(0, 1, 0)}.provenance`],
      ["an unknown aspect", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 0).aspect = "client"), "formats.presentazione_16_9.pages.2.blocks.0.elements.0.aspect"],
      [
        "an unknown ref kind",
        (d: CaseStudyDocument) => (elementAt(d, 2, 0, 0).sourceRefs = [{ kind: "client_field", id: "name" }]),
        "formats.presentazione_16_9.pages.2.blocks.0.elements.0.sourceRefs.0.kind",
      ],
      ["splitAt on a top group", (d: CaseStudyDocument) => (elementAt(d, 0, 2, 0).splitAt = 1), "formats.presentazione_16_9.pages.0.blocks.2.elements.0.splitAt"],
      ["a split group without splitAt", (d: CaseStudyDocument) => delete elementAt(d, 0, 0, 0).splitAt, `${elementPath(0, 0, 0)}.splitAt`],
      ["splitAt past the texts", (d: CaseStudyDocument) => (elementAt(d, 0, 0, 0).splitAt = 3), `${elementPath(0, 0, 0)}.splitAt`],
      [
        "a non-text item in a group",
        (d: CaseStudyDocument) => ((elementAt(d, 0, 0, 0).items as unknown[])[0] = { elementId: "eeeeeeee-0000-4000-8000-0000000000ff", type: "divider" }),
        `${elementPath(0, 0, 0)}.items.0.type`,
      ],
      ["an unknown role", (d: CaseStudyDocument) => ((pagesOf(d)[0] as { role: string }).role = "cover"), "formats.presentazione_16_9.pages.0.role"],
      ["an unknown section", (d: CaseStudyDocument) => ((pagesOf(d)[0] as { section: string }).section = "sfida"), "formats.presentazione_16_9.pages.0.section"],
      ["a short hex background", (d: CaseStudyDocument) => (pagesOf(d)[0].background = { kind: "colour", value: "#fff" }), "formats.presentazione_16_9.pages.0.background.value"],
      [
        "a background image that is not an asset id",
        (d: CaseStudyDocument) => (pagesOf(d)[0].blocks[0].background = { kind: "image", assetId: "bg.png" }),
        "formats.presentazione_16_9.pages.0.blocks.0.background.assetId",
      ],
      ["a zero grid track", (d: CaseStudyDocument) => (pagesOf(d)[0].grid.rows = [1, 0]), "formats.presentazione_16_9.pages.0.grid.rows.1"],
      ["a grid without columns", (d: CaseStudyDocument) => (pagesOf(d)[0].grid.cols = []), "formats.presentazione_16_9.pages.0.grid.cols"],
      ["a page without a layout", (d: CaseStudyDocument) => delete (pagesOf(d)[0].grid as Partial<Page["grid"]>).layoutId, "formats.presentazione_16_9.pages.0.grid.layoutId"],
      [
        "over 6 blocks on a page",
        (d: CaseStudyDocument) =>
          pagesOf(d)[1].blocks.push(
            ...[90, 91, 92].map((n) => ({ blockId: `bbbbbbbb-0000-4000-8000-0000000000${n}`, name: "Vuoto", background: { kind: "transparent" as const }, elements: [] })),
          ),
        "formats.presentazione_16_9.pages.1.blocks",
      ],
      ["a text over 5000 characters", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 0).text = "x".repeat(5001)), "formats.presentazione_16_9.pages.2.blocks.0.elements.0.text"],
      ["a bad template ref", (d: CaseStudyDocument) => (d.template = "mac-case"), "template"],
      ["a format entry with a layout part", (d: CaseStudyDocument) => ((d.formats.video_9_16 as Record<string, unknown>).variant = "a"), "formats.video_9_16"],
    ])("rejects %s", (_name, mutate, path) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(doc);
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toContain(path);
    });

    const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const emptyPage = (n: number): Page => ({
      pageKey: `extra-${n}`,
      name: "Vuota",
      role: "body",
      section: "output",
      background: { kind: "transparent" },
      grid: { layoutId: "uno", rows: [1], cols: [1] },
      blocks: [],
    });
    const dividers = (count: number) => Array.from({ length: count }, (_, i) => ({ elementId: uuid("ffffffff", i), type: "divider" as const }));
    const texts = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ elementId: uuid("ffffffff", 100 + i), type: "text" as const, style: "text" as const, text: "x", provenance: "human_added" as const }));
    const assets = (count: number) => Array.from({ length: count }, (_, i) => uuid("aaaaaaaa", 100 + i));
    const refs = (count: number) => Array.from({ length: count }, () => ({ kind: "form_field" as const, id: "context" }));
    const PAGE = "formats.presentazione_16_9.pages";

    /** Sets every limit to `n` past its bound (0: at the bound). */
    const atLimits = (d: CaseStudyDocument, past: 0 | 1) => {
      pagesOf(d).push(...Array.from({ length: 47 + past }, (_, i) => emptyPage(i)));
      pagesOf(d)[0].name = "x".repeat(100 + past);
      pagesOf(d)[0].blocks[0].name = "x".repeat(100 + past);
      pagesOf(d)[0].grid.rows = Array(12 + past).fill(1);
      pagesOf(d)[0].grid.cols = Array(12 + past).fill(1);
      pagesOf(d)[0].blocks[2].elements.push(...dividers(29 + past));
      (elementAt(d, 0, 0, 0).items as unknown[]).push(...texts(18 + past));
      elementAt(d, 1, 3, 0).assetIds = assets(30 + past);
      elementAt(d, 2, 0, 0).sourceRefs = refs(50 + past);
      elementAt(d, 2, 0, 2).size = 1000 + past;
    };

    it.each([
      ["a page name over 100 characters", (d: CaseStudyDocument) => (pagesOf(d)[0].name = "x".repeat(101)), `${PAGE}.0.name`],
      ["an empty page name", (d: CaseStudyDocument) => (pagesOf(d)[0].name = ""), `${PAGE}.0.name`],
      ["a block name over 100 characters", (d: CaseStudyDocument) => (pagesOf(d)[0].blocks[0].name = "x".repeat(101)), `${PAGE}.0.blocks.0.name`],
      ["an empty block name", (d: CaseStudyDocument) => (pagesOf(d)[0].blocks[0].name = ""), `${PAGE}.0.blocks.0.name`],
      ["over 50 pages in a format", (d: CaseStudyDocument) => pagesOf(d).push(...Array.from({ length: 48 }, (_, i) => emptyPage(i))), PAGE],
      ["over 30 elements in a block", (d: CaseStudyDocument) => pagesOf(d)[0].blocks[2].elements.push(...dividers(30)), `${PAGE}.0.blocks.2.elements`],
      ["over 20 texts in a group", (d: CaseStudyDocument) => (elementAt(d, 0, 0, 0).items as unknown[]).push(...texts(19)), `${elementPath(0, 0, 0)}.items`],
      ["over 12 grid rows", (d: CaseStudyDocument) => (pagesOf(d)[0].grid.rows = Array(13).fill(1)), `${PAGE}.0.grid.rows`],
      ["over 12 grid columns", (d: CaseStudyDocument) => (pagesOf(d)[0].grid.cols = Array(13).fill(1)), `${PAGE}.0.grid.cols`],
      ["over 30 animation media", (d: CaseStudyDocument) => (elementAt(d, 1, 3, 0).assetIds = assets(31)), `${elementPath(1, 3, 0)}.assetIds`],
      ["over 50 source refs", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 0).sourceRefs = refs(51)), `${PAGE}.2.blocks.0.elements.0.sourceRefs`],
      ["a text size over 1000 px", (d: CaseStudyDocument) => (elementAt(d, 2, 0, 2).size = 1001), `${PAGE}.2.blocks.0.elements.2.size`],
    ])("rejects %s", (_name, mutate, path) => {
      const doc = caseHistoryV2(FORMAT_IDS);
      mutate(doc);
      const result = validateNewDocument(doc);
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result).map((i) => i.path)).toContain(path);
    });

    it("accepts every limit at its bound: 6 blocks, 5000 characters, names of 100, 50 pages, 30 elements, 20 texts, 12 tracks, 30 media, 50 refs, 1000 px", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      pagesOf(doc)[1].blocks.push(
        ...[90, 91].map((n) => ({ blockId: `bbbbbbbb-0000-4000-8000-0000000000${n}`, name: "Vuoto", background: { kind: "transparent" as const }, elements: [] })),
      );
      elementAt(doc, 2, 0, 0).text = "x".repeat(5000);
      atLimits(doc, 0);
      expect(validateNewDocument(doc)).toEqual({ ok: true, value: doc });
    });

    it("rejects every limit one past its bound at once", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      atLimits(doc, 1);
      expect(codeOf(validateNewDocument(doc))).toBe("DOCUMENT_INVALID");
    });
  });

  describe("client values (AD-22)", () => {
    it.each([
      ["an about object", { about: { name: "Acme" } }],
      ["a client name", { clientName: "Acme" }],
      ["a shared text part", { blocks: [] }],
      ["selected media", { selectedMedia: [] }],
    ])("rejects %s on the document with an unknown-key error", (_name, extra) => {
      const result = validateNewDocument({ ...caseHistoryV2(FORMAT_IDS), ...extra });
      expect(codeOf(result)).toBe("DOCUMENT_INVALID");
      expect(issuesOf(result)).toEqual([expect.objectContaining({ path: "", code: "unrecognized_keys" })]);
    });

    it.each([
      ["a page", (d: CaseStudyDocument) => pagesOf(d)[0] as unknown as Record<string, unknown>, "formats.presentazione_16_9.pages.0"],
      ["a block", (d: CaseStudyDocument) => pagesOf(d)[0].blocks[1] as unknown as Record<string, unknown>, "formats.presentazione_16_9.pages.0.blocks.1"],
      ["a bound text", (d: CaseStudyDocument) => elementAt(d, 0, 1, 0), elementPath(0, 1, 0)],
      ["the logos", (d: CaseStudyDocument) => elementAt(d, 0, 1, 2), elementPath(0, 1, 2)],
      ["the services", (d: CaseStudyDocument) => elementAt(d, 0, 1, 4), elementPath(0, 1, 4)],
    ])("rejects a client value on %s", (_name, target, path) => {
      for (const key of ["about", "clientName"]) {
        const doc = caseHistoryV2(FORMAT_IDS);
        target(doc)[key] = "Acme";
        const result = validateNewDocument(doc);
        expect(codeOf(result)).toBe("DOCUMENT_INVALID");
        expect(issuesOf(result)).toEqual([expect.objectContaining({ path, code: "unrecognized_keys" })]);
      }
    });

    it("rejects a check on a text (answer 11)", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      elementAt(doc, 2, 0, 0).check = null;
      expect(issuesOf(validateNewDocument(doc))).toEqual([expect.objectContaining({ code: "unrecognized_keys" })]);
    });
  });

  describe("format keys", () => {
    it("rejects formats missing video_9_16 with FORMAT_NOT_IN_REVISION", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      delete doc.formats.video_9_16;
      expect(validateNewDocument(doc)).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION", details: { missing: ["video_9_16"], extra: [] } } });
    });

    it("rejects an extra deck_16_9 with FORMAT_NOT_IN_REVISION", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      doc.formats.deck_16_9 = doc.formats.presentazione_16_9;
      expect(validateNewDocument(doc)).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION", details: { missing: [], extra: ["deck_16_9"] } } });
    });

    it("names both missing and extra keys", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      doc.formats.story_9_16 = doc.formats.video_9_16;
      delete doc.formats.video_9_16;
      expect(validateNewDocument(doc)).toMatchObject({
        ok: false,
        error: { code: "FORMAT_NOT_IN_REVISION", details: { missing: ["video_9_16"], extra: ["story_9_16"], extraCount: 1 } },
      });
    });

    it("names at most 10 unknown format keys", () => {
      const doc = caseHistoryV2(FORMAT_IDS);
      for (let i = 0; i < 12; i++) doc.formats[`story_${i}`] = { pages: [] };
      const result = validateNewDocument(doc);
      expect(result).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION", details: { extraCount: 12 } } });
      if (!result.ok) expect((result.error.details as { extra: string[] }).extra).toHaveLength(10);
    });
  });

  describe("versions", () => {
    it.each([
      ["a v1 document", () => caseHistoryV1()],
      ["a v1 document keyed by the registry", () => caseHistoryV1(FORMAT_IDS)],
      ["a v0 document", () => caseHistoryV0()],
      ["a future version", () => ({ ...caseHistoryV2(FORMAT_IDS), schemaVersion: 99 })],
      ["no version", () => ({ kind: "case_history" })],
    ])("refuses %s with DOCUMENT_SCHEMA_UNSUPPORTED", (_name, doc) => {
      expect(codeOf(validateNewDocument(doc()))).toBe("DOCUMENT_SCHEMA_UNSUPPORTED");
    });
  });
});

describe("upgrade", () => {
  /** What a stored v1 or v0 case history reads as: the template's starter pages, built with no texts, images or results. */
  const upgradeContext = (): TemplateContext => {
    let n = 0;
    return { newId: () => `${UPGRADE_ID_PREFIX}${String(++n).padStart(12, "0")}`, texts: {}, images: [], resultRows: 0, hasTestimonial: false };
  };
  const upgradedV1 = {
    schemaVersion: 2,
    kind: "case_history",
    template: "mac-case@1",
    formats: Object.fromEntries(FORMAT_IDS.map((id) => [id, { pages: starterPages("mac-case@1", "case_history", id, upgradeContext()) }])),
  };

  it("returns a v2 document as it is", () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    expect(upgrade(doc)).toEqual({ ok: true, value: doc });
  });

  it("reads a v1 document with the old format keys as v2 with the template's starter pages, leaving the input unchanged", () => {
    const v1 = caseHistoryV1();
    expect(Object.keys(v1.formats)).toEqual([...LEGACY_FORMAT_IDS]);
    const before = structuredClone(v1);
    const result = upgrade(v1);
    expect(v1).toEqual(before);
    expect(result).toEqual({ ok: true, value: upgradedV1 });
  });

  it("gives each format the starter pages without Risultati (a v1 document says nothing of results), with deterministic ids", () => {
    const result = upgrade(caseHistoryV1());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = Object.fromEntries(FORMAT_IDS.map((id) => [id, result.value.formats[id].pages.map((p) => p.pageKey)]));
    expect(keys).toEqual({
      presentazione_16_9: ["intro", "content"],
      carosello_1_1: ["intro", "intro-sfida", "intro-idea", "closing"],
      video_9_16: ["intro"],
    });
    for (const id of FORMAT_IDS) {
      const ids = JSON.stringify(result.value.formats[id]).match(/"(blockId|elementId)":"[^"]+"/g) ?? [];
      expect(ids.length).toBeGreaterThan(0);
      for (const found of ids) expect(found).toMatch(new RegExp(`"${UPGRADE_ID_PREFIX}\\d{12}"$`));
    }
    expect(upgrade(caseHistoryV1())).toEqual(result);
    expect(validateNewDocument(result.value)).toEqual(result);
  });

  it("reads a v1 client intro as v2 with no pages (its template arrives with Stories 3.9 and 3.11)", () => {
    expect(upgrade(clientIntroV1())).toEqual({
      ok: true,
      value: {
        schemaVersion: 2,
        kind: "client_intro",
        template: "mac-intro@1",
        formats: { presentazione_16_9: { pages: [] }, carosello_1_1: { pages: [] }, video_9_16: { pages: [] } },
      },
    });
  });

  describe("with injected default pages", () => {
    const deps = (defaultPages: DefaultPages) => ({ defaultPages, formatIds: FORMAT_IDS });
    const intro = (formatId: string): Page[] => structuredClone(pagesOf(caseHistoryV2([formatId]), formatId).slice(0, 1));

    it("gives every registry format the template's default pages and drops the other keys", () => {
      const calls: unknown[][] = [];
      const defaultPages: DefaultPages = (template, kind, formatId) => {
        calls.push([template, kind, formatId]);
        return intro(formatId);
      };
      const result = upgradeWith(caseHistoryV1(), deps(defaultPages));
      expect(calls).toEqual(FORMAT_IDS.map((id) => ["mac-case@1", "case_history", id]));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(Object.keys(result.value.formats)).toEqual([...FORMAT_IDS]);
      for (const id of FORMAT_IDS) expect(result.value.formats[id].pages).toEqual(intro(id));
      expect(caseStudyDocumentSchema.safeParse(result.value).success).toBe(true);
    });

    it("replaces a v1 entry keyed by a registry id with the default pages", () => {
      const v1 = caseHistoryV1([...LEGACY_FORMAT_IDS, "presentazione_16_9"]);
      const result = upgradeWith(v1, deps(intro));
      expect(result.ok && result.value.formats.presentazione_16_9).toEqual({ pages: intro("presentazione_16_9") });
    });

    it("never shares the default pages' objects with the result", () => {
      const shared = intro("presentazione_16_9");
      const result = upgradeWith(caseHistoryV1(), deps(() => shared));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.formats.presentazione_16_9.pages[0]).not.toBe(shared[0]);
      expect(result.value.formats.presentazione_16_9.pages[0]).not.toBe(result.value.formats.carosello_1_1.pages[0]);
    });

    it("refuses default pages that break v2 with DOCUMENT_INVALID", () => {
      const broken = () => [{ ...intro("presentazione_16_9")[0], about: "Acme" }] as unknown as Page[];
      expect(codeOf(upgradeWith(caseHistoryV1(), deps(broken)))).toBe("DOCUMENT_INVALID");
    });
  });

  it("takes the v0 fixture through v1 to v2 without touching the input", () => {
    const v0 = caseHistoryV0();
    const before = structuredClone(v0);
    const result = upgrade(v0);
    expect(v0).toEqual(before);
    expect(result).toEqual({ ok: true, value: upgradedV1 });
  });

  it("refuses a v1 document that breaks the v1 narrative rule", () => {
    const v1 = caseHistoryV1();
    v1.blocks.reverse();
    const result = upgrade(v1);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toContain("blocks");
  });

  it("refuses a v0 document that breaks the narrative rule", () => {
    const v0 = caseHistoryV0();
    v0.blocks.reverse();
    const result = upgrade(v0);
    expect(codeOf(result)).toBe("DOCUMENT_INVALID");
    expect(issuesOf(result).map((i) => i.path)).toContain("blocks");
  });

  it("refuses a malformed v0 document with DOCUMENT_INVALID", () => {
    expect(codeOf(upgrade({ ...caseHistoryV0(), templateVersion: "one" }))).toBe("DOCUMENT_INVALID");
  });

  it("refuses a malformed v2 document with DOCUMENT_INVALID", () => {
    expect(codeOf(upgrade({ ...caseHistoryV2(FORMAT_IDS), about: { name: "Acme" } }))).toBe("DOCUMENT_INVALID");
  });

  it.each([
    ["a future version", { ...caseHistoryV2(FORMAT_IDS), schemaVersion: 99 }],
    ["a negative version", { ...caseHistoryV2(FORMAT_IDS), schemaVersion: -1 }],
    ["a string version", { ...caseHistoryV2(FORMAT_IDS), schemaVersion: "2" }],
    ["no version", { kind: "case_history" }],
    ["null", null],
    ["an array", []],
    ["a string", "doc"],
  ])("refuses %s with DOCUMENT_SCHEMA_UNSUPPORTED", (_name, doc) => {
    expect(codeOf(upgrade(doc))).toBe("DOCUMENT_SCHEMA_UNSUPPORTED");
  });
});
