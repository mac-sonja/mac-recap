import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildTestDraft,
  TEST_DRAFT_MARKER,
  validateNewDocument,
  type CaseStudyDocument,
  type DocumentElement,
  type Page,
  type TestDraftForm,
  type TextElement,
} from "@/modules/generation";
import { FORMAT_IDS, TEMPLATE_TEXT_KEYS } from "@/modules/rendering";

const IMAGES = Array.from({ length: 4 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const PDF = "bbbbbbbb-0000-4000-8000-000000000001";

const FORM: TestDraftForm = {
  context: "Il cliente voleva rinnovare il proprio marchio senza perdere i clienti storici.",
  solution: "Abbiamo proposto un sistema visivo modulare, provato con i clienti in tre workshop.",
  results: [
    { label: "Visite", value: "+40%" },
    { label: "Lead", value: "x2" },
  ],
  testimonialQuote: "Un lavoro eccellente.",
};
const EMPTY_FORM: TestDraftForm = { context: "", solution: "", results: [], testimonialQuote: "" };

const build = (o: Partial<Parameters<typeof buildTestDraft>[0]> = {}): CaseStudyDocument =>
  buildTestDraft({ images: IMAGES, assetIds: IMAGES, form: FORM, newId: randomUUID, ...o });

const flat = (elements: readonly DocumentElement[]): DocumentElement[] =>
  elements.flatMap((el) => (el.type === "text_group" || el.type === "row" ? [el, ...flat(el.items)] : [el]));
const elementsOf = (pages: readonly Page[]) => pages.flatMap((p) => p.blocks.flatMap((b) => flat(b.elements)));
const textsOf = (pages: readonly Page[]) => elementsOf(pages).filter((el): el is TextElement => el.type === "text");
const allPages = (doc: CaseStudyDocument) => Object.values(doc.formats).flatMap((f) => f.pages);
const markedTexts = (doc: CaseStudyDocument) => textsOf(allPages(doc)).filter((t) => t.text?.startsWith(TEST_DRAFT_MARKER));
const keysOf = (doc: CaseStudyDocument) => Object.fromEntries(Object.entries(doc.formats).map(([id, f]) => [id, f.pages.map((p) => p.pageKey)]));

const CHALLENGE = (doc: CaseStudyDocument) => markedTexts(doc).filter((t) => t.text?.includes("Sfida"));

describe("buildTestDraft (Story 3.10)", () => {
  it("happy path: a valid v2 case history with each format's pages in order", () => {
    const doc = build();
    expect(validateNewDocument(doc).ok).toBe(true);
    expect(doc).toMatchObject({ schemaVersion: 2, kind: "case_history", template: "mac-case@1" });
    expect(Object.keys(doc.formats).sort()).toEqual([...FORMAT_IDS].sort());
    expect(keysOf(doc)).toEqual({
      presentazione_16_9: ["intro", "content", "results"],
      carosello_1_1: ["intro", "intro-sfida", "intro-idea", "content", "results", "closing"],
      video_9_16: ["intro", "results"],
    });
  });

  it("Carosello Contenuti is the mockup's sample: three_a, three grey image blocks, the first three images", () => {
    const content = build().formats.carosello_1_1.pages.find((p) => p.pageKey === "content");
    expect(content).toMatchObject({
      name: "Contenuti",
      role: "body",
      section: "output",
      background: { kind: "colour", value: "#FFFFFF" },
      margin: 24,
      grid: { layoutId: "three_a" },
    });
    expect(content?.blocks.map((b) => b.background)).toEqual(Array(3).fill({ kind: "colour", value: "#EDEDF0" }));
    expect(content?.blocks.map((b) => b.elements)).toEqual(
      IMAGES.slice(0, 3).map((assetId) => [{ elementId: expect.any(String), type: "image", assetId, fit: "fill" }]),
    );
  });

  it("no results and no testimonial: no Risultati page in any format", () => {
    const doc = build({ form: { ...FORM, results: [], testimonialQuote: "  " } });
    expect(validateNewDocument(doc).ok).toBe(true);
    expect(keysOf(doc)).toEqual({
      presentazione_16_9: ["intro", "content"],
      carosello_1_1: ["intro", "intro-sfida", "intro-idea", "content", "closing"],
      video_9_16: ["intro"],
    });
  });

  it("fewer images: the later image blocks hold null", () => {
    const doc = build({ images: IMAGES.slice(0, 1), assetIds: IMAGES.slice(0, 1) });
    expect(validateNewDocument(doc).ok).toBe(true);
    const content = doc.formats.carosello_1_1.pages.find((p) => p.pageKey === "content");
    expect(content?.blocks.map((b) => (b.elements[0] as { assetId: string | null }).assetId)).toEqual([IMAGES[0], null, null]);
    const presentazione = elementsOf(doc.formats.presentazione_16_9.pages.filter((p) => p.pageKey === "content"));
    expect(presentazione.filter((el) => el.type === "image").map((el) => (el as { assetId: string | null }).assetId)).toEqual([IMAGES[0], null, null]);
  });

  it("only a PDF: every image is null and the fixed texts cite the PDF", () => {
    const doc = build({ images: [], assetIds: [PDF], form: EMPTY_FORM });
    expect(validateNewDocument(doc).ok).toBe(true);
    const images = elementsOf(allPages(doc)).filter((el) => el.type === "image");
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((el) => (el as { assetId: string | null }).assetId === null)).toBe(true);
    expect(markedTexts(doc).every((t) => JSON.stringify(t.sourceRefs) === JSON.stringify([{ kind: "asset", id: PDF }]))).toBe(true);
  });

  it("Sfida texts cite the context answer and Idea texts the solution answer", () => {
    const doc = build();
    const texts = markedTexts(doc);
    const sfida = texts.filter((t) => t.text?.includes("Sfida"));
    const idea = texts.filter((t) => t.text?.includes("Idea"));
    expect(sfida.length).toBeGreaterThan(0);
    expect(idea.length).toBeGreaterThan(0);
    for (const t of sfida) {
      expect(t.text).toContain("rinnovare il proprio marchio");
      expect(t.sourceRefs).toEqual([{ kind: "form_field", id: "context" }]);
    }
    for (const t of idea) {
      expect(t.text).toContain("sistema visivo modulare");
      expect(t.sourceRefs).toEqual([{ kind: "form_field", id: "solution" }]);
    }
    const others = texts.filter((t) => !sfida.includes(t) && !idea.includes(t));
    expect(others.length).toBeGreaterThan(0);
    for (const t of others) expect(t.sourceRefs).toEqual([{ kind: "asset", id: IMAGES[0] }]);
  });

  it("empty form: Sfida and Idea are fixed test text citing the first asset", () => {
    const doc = build({ form: EMPTY_FORM });
    expect(CHALLENGE(doc)).toEqual([]);
    for (const t of markedTexts(doc)) expect(t.sourceRefs).toEqual([{ kind: "asset", id: IMAGES[0] }]);
  });

  it("every template text is marked, distinct and cites; the template's own copy is not touched", () => {
    const doc = build();
    const texts = markedTexts(doc);
    const distinct = new Set(texts.map((t) => t.text));
    // Each of the eight keys shows up somewhere in the document.
    expect(distinct.size).toBe(TEMPLATE_TEXT_KEYS.length);
    for (const t of texts) {
      expect(t.text?.startsWith(`${TEST_DRAFT_MARKER} `)).toBe(true);
      expect(t.provenance).toBe("generated");
      expect(t.sourceRefs?.length).toBeGreaterThan(0);
    }
    // Every own-words text is either a test text or fixed template copy, which cites nothing.
    for (const t of textsOf(allPages(doc)).filter((el) => el.text !== undefined && !el.text.startsWith(TEST_DRAFT_MARKER))) {
      expect(t.sourceRefs).toBeUndefined();
    }
  });

  it("texts are distinct even when the context and solution answers are the same", () => {
    const same = "La stessa risposta.";
    const texts = markedTexts(build({ form: { ...FORM, context: same, solution: same } }));
    expect(new Set(texts.map((t) => t.text)).size).toBe(TEMPLATE_TEXT_KEYS.length);
  });

  it("a long answer is cut so the document stays valid", () => {
    const long = "parola ".repeat(800);
    const doc = build({ form: { ...FORM, context: long, solution: long } });
    expect(validateNewDocument(doc).ok).toBe(true);
    for (const t of markedTexts(doc)) expect(t.text?.length).toBeLessThanOrEqual(700);
  });

  it("a cut never splits a surrogate pair", () => {
    const emoji = "😀".repeat(800);
    for (const t of markedTexts(build({ form: { ...FORM, context: emoji, solution: emoji } }))) {
      expect(t.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
  });

  it("no client value anywhere: client and case values stay bindings", () => {
    const doc = build();
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/"(about|client|clientName|sector|year)":\s*"/);
    const bindings = textsOf(allPages(doc)).flatMap((t) => [...(t.binding ? [t.binding] : []), ...(t.bindings ?? [])]);
    expect(bindings).toContainEqual({ record: "client", field: "name" });
    expect(bindings).toContainEqual({ record: "client", field: "sector" });
    expect(bindings).toContainEqual({ record: "case", field: "year" });
    for (const t of textsOf(allPages(doc))) {
      const held = [t.text, t.binding, t.bindings].filter((v) => v !== undefined).length;
      expect(held).toBe(1);
    }
  });

  it("ids are unique within each format", () => {
    const doc = build();
    for (const { pages } of Object.values(doc.formats)) {
      const ids = pages.flatMap((p) => p.blocks.flatMap((b) => [b.blockId, ...flat(b.elements).map((el) => el.elementId)]));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
