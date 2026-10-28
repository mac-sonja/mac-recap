import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { caseStudyDocumentSchema, pageSchema, validateNewDocument, type DocumentElement, type Page, type TextElement } from "@/modules/generation";
import {
  CASE_TEMPLATE,
  defaultPages,
  FORMAT_IDS,
  layouts,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  templates,
  textStyles,
  type FormatId,
  type TemplateContext,
} from "@/modules/rendering";
import hashes from "./hashes.json";

const TEMPLATES_DIR = fileURLToPath(new URL(".", import.meta.url));

const IMAGES = Array.from({ length: 5 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const TEXTS = Object.fromEntries(TEMPLATE_TEXT_KEYS.map((key) => [key, `[${key}]`]));

const ctxOf = (o: Partial<TemplateContext> = {}): TemplateContext => ({
  newId: randomUUID,
  texts: TEXTS,
  images: IMAGES,
  resultRows: 3,
  hasTestimonial: true,
  ...o,
});

/** Every element of a page, the items of groups and rows included. */
const flat = (elements: readonly DocumentElement[]): DocumentElement[] =>
  elements.flatMap((el) => (el.type === "text_group" || el.type === "row" ? [el, ...flat(el.items)] : [el]));
const elementsOf = (pages: readonly Page[]) => pages.flatMap((p) => p.blocks.flatMap((b) => flat(b.elements)));
const textsOf = (pages: readonly Page[]) => elementsOf(pages).filter((el): el is TextElement => el.type === "text");
const idsOf = (pages: readonly Page[]) => pages.flatMap((p) => p.blocks.flatMap((b) => [b.blockId, ...flat(b.elements).map((el) => el.elementId)]));

const buildAll = (formatId: FormatId, ctx: TemplateContext) => defaultPages(formatId).flatMap((d) => d.build(ctx));
const outroOf = (formatId: FormatId, ctx: TemplateContext) => defaultPages(formatId).find((d) => d.key === "results")!.build(ctx);

const docOf = (pagesByFormat: (formatId: FormatId) => Page[]) => ({
  schemaVersion: 2,
  kind: "case_history",
  template: CASE_TEMPLATE,
  formats: Object.fromEntries(FORMAT_IDS.map((id) => [id, { pages: pagesByFormat(id) }])),
});

describe("layouts", () => {
  it.each([
    ["presentazione_16_9", ["intro", "content_1", "content_3", "content_5", "only_layout", "results"]],
    ["carosello_1_1", ["one", "two", "three_a", "three_b", "four", "stack"]],
    ["video_9_16", ["one", "stack", "intro", "results"]],
  ] as const)("lists %s's layouts in order", (formatId, ids) => {
    expect(layouts(formatId).map((l) => l.layoutId)).toEqual(ids);
  });

  it("has the Figma grids: Intro of five blocks, Presentazione Risultati as Carosello 3 immagini B", () => {
    const intro = layouts("presentazione_16_9")[0];
    expect(intro).toEqual({
      layoutId: "intro",
      name: "Intro",
      rows: [147, 317, 488],
      cols: [908, 442, 442],
      areas: [
        [1, 1, 4, 2],
        [1, 2, 2, 4],
        [2, 2, 3, 3],
        [3, 2, 4, 3],
        [2, 3, 4, 4],
      ],
    });
    const grid = (formatId: FormatId, layoutId: string) => {
      const l = layouts(formatId).find((x) => x.layoutId === layoutId)!;
      return { rows: l.rows, cols: l.cols, areas: l.areas };
    };
    expect(grid("presentazione_16_9", "results")).toEqual(grid("carosello_1_1", "three_b"));
    expect(layouts("presentazione_16_9").find((l) => l.layoutId === "only_layout")!.areas).toHaveLength(5);
  });

  it.each(FORMAT_IDS)("gives every %s area a cell inside its grid, without overlaps", (formatId) => {
    for (const l of layouts(formatId)) {
      expect(l.areas.length, l.layoutId).toBeGreaterThan(0);
      expect(l.areas.length, l.layoutId).toBeLessThanOrEqual(6);
      const taken = new Set<string>();
      for (const [r0, c0, r1, c1] of l.areas) {
        expect(r0 >= 1 && c0 >= 1 && r1 > r0 && c1 > c0 && r1 <= l.rows.length + 1 && c1 <= l.cols.length + 1, `${l.layoutId} ${[r0, c0, r1, c1]}`).toBe(true);
        for (let r = r0; r < r1; r++)
          for (let c = c0; c < c1; c++) {
            expect(taken.has(`${r},${c}`), `${l.layoutId} overlaps at ${r},${c}`).toBe(false);
            taken.add(`${r},${c}`);
          }
      }
      // Every cell of the grid belongs to a block.
      expect(taken.size, l.layoutId).toBe(l.rows.length * l.cols.length);
    }
  });

  it("has unique layout ids per format", () => {
    for (const id of FORMAT_IDS) expect(new Set(layouts(id).map((l) => l.layoutId)).size).toBe(layouts(id).length);
  });
});

describe("text styles", () => {
  it("has the C32 sizes: desktop for Presentazione, mobile for Carosello and Video", () => {
    const sizes = (formatId: FormatId) => Object.fromEntries(Object.entries(textStyles(formatId)).map(([k, v]) => [k, v.size]));
    expect(sizes("presentazione_16_9")).toEqual({ lab: 13, xl: 56, title: 26, sub: 20, text: 16, num: 56, quote: 39 });
    expect(sizes("carosello_1_1")).toEqual({ lab: 16, xl: 68, title: 30, sub: 26, text: 18, num: 75, quote: 40 });
    expect(sizes("video_9_16")).toEqual(sizes("carosello_1_1"));
  });
});

describe("default pages", () => {
  it.each([
    ["presentazione_16_9", ["intro", "content_1", "content_3", "content_5", "results"]],
    ["carosello_1_1", ["intro", "sfida", "idea", "results", "closing"]],
    ["video_9_16", ["intro", "results"]],
  ] as const)("lists %s's default pages in order", (formatId, keys) => {
    expect(defaultPages(formatId).map((d) => d.key)).toEqual(keys);
  });

  describe("a full case: 5 images, 3 result rows, a testimonial", () => {
    it.each(FORMAT_IDS)("builds every %s page valid, its blocks filling its layout", (formatId) => {
      for (const d of defaultPages(formatId)) {
        const pages = d.build(ctxOf());
        expect(pages.length, d.key).toBeGreaterThan(0);
        for (const p of pages) {
          expect(pageSchema.safeParse(p).success, `${d.key} ${p.pageKey}`).toBe(true);
          const l = layouts(formatId).find((x) => x.layoutId === p.grid.layoutId);
          expect(l, `${d.key} ${p.grid.layoutId}`).toBeDefined();
          expect(p.blocks.length, `${d.key} ${p.pageKey}`).toBe(l!.areas.length);
          expect(p.grid).toEqual({ layoutId: l!.layoutId, rows: l!.rows, cols: l!.cols });
        }
      }
    });

    it("builds the Carosello Intro as three pages: Copertina, Sfida, Idea", () => {
      const pages = defaultPages("carosello_1_1")[0].build(ctxOf());
      expect(pages.map((p) => [p.pageKey, p.name, p.role, p.section])).toEqual([
        ["intro", "Copertina", "intro", "intro"],
        ["intro-sfida", "Sfida", "intro", "intro"],
        ["intro-idea", "Idea", "intro", "intro"],
      ]);
    });

    it.each(FORMAT_IDS)("gives %s pages their role and section", (formatId) => {
      for (const p of buildAll(formatId, ctxOf())) {
        const expected = p.pageKey.startsWith("intro") || ["sfida", "idea"].includes(p.pageKey) ? ["intro", "intro"] : p.pageKey.startsWith("content") ? ["body", "output"] : ["outro", "risultati"];
        expect([p.role, p.section], p.pageKey).toEqual(expected);
      }
    });

    it("fills texts and images from the context, in order", () => {
      const [intro] = defaultPages("presentazione_16_9")[0].build(ctxOf());
      expect(intro.blocks[0].background).toEqual({ kind: "image", assetId: IMAGES[0] });
      expect(textsOf([intro]).map((t) => t.text).filter((t) => t?.startsWith("["))).toEqual([
        "[title]",
        "[subtitle]",
        "[challengeHead]",
        "[challengeBody]",
        "[ideaHead]",
        "[ideaBody]",
      ]);
      const [content] = defaultPages("presentazione_16_9")[3].build(ctxOf());
      expect(elementsOf([content]).flatMap((el) => (el.type === "image" ? [el.assetId] : []))).toEqual(IMAGES);
      expect(textsOf([content]).map((t) => t.text)).toEqual(["06 Deliverable — Output", "[outputHead]", "[outputBody]"]);
      const [video] = defaultPages("video_9_16")[0].build(ctxOf());
      expect(elementsOf([video]).find((el) => el.type === "animation")).toMatchObject({ animation: "carousel_04", assetIds: IMAGES, size: 105 });
    });

    it.each(FORMAT_IDS)("binds client and case values in %s, and marks fixed copy generated", (formatId) => {
      const texts = textsOf(buildAll(formatId, ctxOf()));
      expect(texts.every((t) => t.provenance === "generated")).toBe(true);
      const bindings = texts.flatMap((t) => [...(t.binding ? [t.binding] : []), ...(t.bindings ?? [])]).map((b) => `${b.record}.${b.field}${"index" in b && b.index !== undefined ? `[${b.index}]` : ""}`);
      expect(bindings).toEqual(expect.arrayContaining(["client.name", "client.sector", "case.year", "case.testimonialQuote", "case.testimonialAuthor"]));
      expect(bindings).toEqual(expect.arrayContaining(["case.resultLabel[0]", "case.resultValue[2]"]));
      // The meta line binds the sector and the year together.
      expect(texts.some((t) => JSON.stringify(t.bindings) === JSON.stringify([{ record: "client", field: "sector" }, { record: "case", field: "year" }]))).toBe(true);
      expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(["06 — Risultati", "08 — Voce del cliente"]));
      const types = new Set(elementsOf(buildAll(formatId, ctxOf())).map((el) => el.type));
      expect(types.has("logos") && types.has("services")).toBe(true);
    });

    it("puts the first image behind the project block with white ink and on-photo colours; without images the block is grey", () => {
      const withImage = [defaultPages("presentazione_16_9")[0].build(ctxOf())[0].blocks[0], defaultPages("carosello_1_1")[0].build(ctxOf())[0].blocks[0]];
      for (const block of withImage) {
        expect(block).toMatchObject({ background: { kind: "image", assetId: IMAGES[0] }, ink: "#FFFFFF" });
        const texts = textsOf([{ ...defaultPages("presentazione_16_9")[0].build(ctxOf())[0], blocks: [block] }]);
        expect(texts.find((t) => t.text === "[subtitle]")!.colour).toBe("#FFFFFFBF");
        expect(texts.find((t) => t.style === "lab")!.colour).toBe("#FFFFFFA6");
      }
      const without = [defaultPages("presentazione_16_9")[0].build(ctxOf({ images: [] }))[0].blocks[0], defaultPages("carosello_1_1")[0].build(ctxOf({ images: [] }))[0].blocks[0]];
      for (const block of without) {
        expect(block.background).toEqual({ kind: "colour", value: "#EDEDF0" });
        expect(block.ink).toBeUndefined();
        const texts = textsOf([{ ...defaultPages("presentazione_16_9")[0].build(ctxOf())[0], blocks: [block] }]);
        expect(texts.find((t) => t.text === "[subtitle]")!.colour).toBe("#01223499");
        expect(texts.find((t) => t.style === "lab")!.colour).toBeUndefined();
      }
    });

    it("shows the first image that isn't the Intro's in the Presentazione Risultati visual", () => {
      const visual = outroOf("presentazione_16_9", ctxOf())[0].blocks.find((b) => b.name === "Visual")!;
      expect(visual.elements).toEqual([expect.objectContaining({ type: "image", assetId: IMAGES[1] })]);
    });

    it("treats a non-finite result count as no rows", () => {
      for (const formatId of FORMAT_IDS) {
        expect(outroOf(formatId, ctxOf({ resultRows: Number.NaN, hasTestimonial: false }))).toEqual([]);
        const [p] = outroOf(formatId, ctxOf({ resultRows: Number.POSITIVE_INFINITY }));
        expect(p.blocks.some((b) => b.name === "Risultati")).toBe(false);
      }
    });

    it("builds the Carosello closing page with the star, no margin and its fixed copy", () => {
      const [closing] = defaultPages("carosello_1_1").find((d) => d.key === "closing")!.build(ctxOf());
      expect(closing).toMatchObject({ pageKey: "closing", name: "Chiusura", margin: 0, decoration: "star", background: { kind: "colour", value: "#EDEDF0" } });
      expect(textsOf([closing]).map((t) => t.text?.slice(0, 20))).toEqual(["Al prossimo progetto", "Non perderti i nostr"]);
    });
  });

  it.each(FORMAT_IDS)("leaves images empty without media in %s", (formatId) => {
    const pages = buildAll(formatId, ctxOf({ images: [] }));
    const media = elementsOf(pages).filter((el) => el.type === "image" || el.type === "animation");
    // Carosello's only image is the cover's background, which turns grey.
    if (formatId !== "carosello_1_1") expect(media.length).toBeGreaterThan(0);
    for (const el of media) {
      if (el.type === "image") expect(el.assetId).toBeNull();
      if (el.type === "animation") expect(el.assetIds).toEqual([]);
    }
    expect(pages.flatMap((p) => [p.background, ...p.blocks.map((b) => b.background)]).some((b) => b.kind === "image")).toBe(false);
    for (const p of pages) expect(pageSchema.safeParse(p).success).toBe(true);
  });

  it("fills missing texts with empty strings", () => {
    const pages = buildAll("presentazione_16_9", ctxOf({ texts: {} }));
    expect(textsOf(pages).filter((t) => t.text === "").length).toBe(6 + 3 * 2);
    for (const p of pages) expect(pageSchema.safeParse(p).success).toBe(true);
  });

  describe("Risultati e testimonial", () => {
    const rowsOf = (pages: Page[]) => elementsOf(pages).filter((el) => el.type === "row" && el.items.some((i) => i.type === "text" && i.binding?.field === "resultValue"));

    it.each(FORMAT_IDS)("has one row per result and the testimonial in %s", (formatId) => {
      const [p] = outroOf(formatId, ctxOf());
      expect(rowsOf([p])).toHaveLength(3);
      const results = p.blocks.find((b) => b.name === "Risultati")!;
      expect(results).toMatchObject({ background: { kind: "colour", value: "#2977FF" }, ink: "#FFFFFF" });
      expect(results.elements.filter((el) => el.type === "divider")).toEqual(Array.from({ length: 3 }, () => expect.objectContaining({ colour: "#B0B0B1" })));
      const value = flat(results.elements).find((el): el is TextElement => el.type === "text" && el.binding?.field === "resultValue")!;
      expect(value).toMatchObject({ style: "num", colour: "#DEFE56" });
      expect(p.blocks.some((b) => b.name === "Testimonianza")).toBe(true);
    });

    it("adds an image first in Presentazione and the Intro's info first in Video; Carosello puts the two side by side", () => {
      expect(outroOf("presentazione_16_9", ctxOf())[0].blocks.map((b) => b.name)).toEqual(["Visual", "Risultati", "Testimonianza"]);
      expect(outroOf("presentazione_16_9", ctxOf())[0].grid.layoutId).toBe("results");
      expect(outroOf("carosello_1_1", ctxOf())[0].grid.layoutId).toBe("two");
      const video = outroOf("video_9_16", ctxOf())[0];
      expect(video.blocks.map((b) => b.name)).toEqual(["Progetto", "Risultati", "Testimonianza"]);
      expect(video.blocks[0]).toMatchObject({ padding: 60, paddingTop: 220 });
    });

    it.each(FORMAT_IDS)("with 2 rows and no testimonial, has 2 rows and no Voce del cliente in %s", (formatId) => {
      const pages = outroOf(formatId, ctxOf({ resultRows: 2, hasTestimonial: false }));
      expect(pages).toHaveLength(1);
      expect(rowsOf(pages)).toHaveLength(2);
      expect(pages[0].blocks.some((b) => b.name === "Testimonianza")).toBe(false);
      expect(textsOf(pages).some((t) => t.text === "08 — Voce del cliente")).toBe(false);
      const l = layouts(formatId).find((x) => x.layoutId === pages[0].grid.layoutId)!;
      expect(pages[0].blocks.length).toBe(l.areas.length);
      expect(pageSchema.safeParse(pages[0]).success).toBe(true);
    });

    it.each(FORMAT_IDS)("with only a testimonial, has no results block in %s", (formatId) => {
      const pages = outroOf(formatId, ctxOf({ resultRows: 0, hasTestimonial: true }));
      expect(pages[0].blocks.some((b) => b.name === "Risultati")).toBe(false);
      const l = layouts(formatId).find((x) => x.layoutId === pages[0].grid.layoutId)!;
      expect(pages[0].blocks.length).toBe(l.areas.length);
    });

    it.each(FORMAT_IDS)("builds nothing with neither results nor testimonial in %s", (formatId) => {
      expect(outroOf(formatId, ctxOf({ resultRows: 0, hasTestimonial: false }))).toEqual([]);
    });
  });

  it.each(FORMAT_IDS)("shares no id between two builds, and keeps ids unique within %s", (formatId) => {
    const a = buildAll(formatId, ctxOf());
    const b = buildAll(formatId, ctxOf());
    const idsA = idsOf(a);
    expect(new Set(idsA).size).toBe(idsA.length);
    expect(idsOf(b).filter((id) => idsA.includes(id))).toEqual([]);
    // Every default page of a format fits in one document (page keys unique too).
    const doc = { ...docOf(() => []), formats: { [formatId]: { pages: a } } };
    expect(caseStudyDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe("starter pages", () => {
  it("are, per format, the template's starting set", () => {
    const keys = (formatId: FormatId) => starterPages(CASE_TEMPLATE, "case_history", formatId, ctxOf()).map((p) => p.pageKey);
    expect(keys("presentazione_16_9")).toEqual(["intro", "content", "results"]);
    expect(keys("carosello_1_1")).toEqual(["intro", "intro-sfida", "intro-idea", "results", "closing"]);
    expect(keys("video_9_16")).toEqual(["intro", "results"]);
  });

  it("make a valid v2 document for a new revision", () => {
    const doc = docOf((id) => starterPages(CASE_TEMPLATE, "case_history", id, ctxOf()));
    expect(validateNewDocument(doc).ok).toBe(true);
  });

  it.each([
    ["a client intro", "mac-case@1", "client_intro", "presentazione_16_9"],
    ["an unknown template", "mac-case@9", "case_history", "presentazione_16_9"],
    ["an unknown format", "mac-case@1", "case_history", "deck_16_9"],
  ] as const)("are empty for %s", (_name, template, kind, formatId) => {
    expect(starterPages(template, kind, formatId, ctxOf())).toEqual([]);
  });

  it("registers mac-case@1 as the case template", () => {
    expect(Object.keys(templates)).toEqual(["mac-case@1"]);
    expect(CASE_TEMPLATE).toBe("mac-case@1");
  });
});

describe("published template versions are immutable", () => {
  /** Every file under `templates/{id}/v{n}/`, relative to `templates/`, with its sha256. */
  function published(): Record<string, string> {
    const out: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else out[relative(TEMPLATES_DIR, path).split(sep).join("/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    };
    for (const template of readdirSync(TEMPLATES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      for (const version of readdirSync(join(TEMPLATES_DIR, template.name), { withFileTypes: true }).filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))) {
        walk(join(TEMPLATES_DIR, template.name, version.name));
      }
    }
    return out;
  }

  it("matches hashes.json file for file (a change is a new version folder)", () => {
    const actual = published();
    const committed = hashes as Record<string, string>;
    const changed = Object.keys(committed).filter((path) => path in actual && actual[path] !== committed[path]);
    const missing = Object.keys(committed).filter((path) => !(path in actual));
    const added = Object.keys(actual).filter((path) => !(path in committed));
    expect({ changed, missing, added }).toEqual({ changed: [], missing: [], added: [] });
  });
});
