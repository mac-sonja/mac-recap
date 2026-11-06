import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildClientIntroTestDraft,
  TEST_DRAFT_MARKER,
  validateNewDocument,
  type CaseStudyDocument,
  type ClientIntroDraftInput,
  type DocumentElement,
  type Page,
  type TextElement,
} from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";

const IMAGES = Array.from({ length: 3 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const DESCRIPTION = "Lumen progetta lampade di design per hotel e case private dal 1990.";
const CONTEXT = "Il cliente voleva portare il marchio nel mercato tedesco senza perdere i clienti storici.";
/** Values that are bindings: they must never be stored in the document. */
const NAME = "Lumen Srl";
const SECTOR = "Interior design";

const build = (o: Partial<ClientIntroDraftInput> = {}): CaseStudyDocument =>
  buildClientIntroTestDraft({
    client: { description: DESCRIPTION, context: CONTEXT },
    images: IMAGES,
    resultRows: 2,
    hasTestimonial: true,
    newId: randomUUID,
    ...o,
  });

const flat = (elements: readonly DocumentElement[]): DocumentElement[] =>
  elements.flatMap((el) => (el.type === "text_group" || el.type === "row" ? [el, ...flat(el.items)] : [el]));
const textsOf = (pages: readonly Page[]) => pages.flatMap((p) => p.blocks.flatMap((b) => flat(b.elements))).filter((el): el is TextElement => el.type === "text");
const allPages = (doc: CaseStudyDocument) => Object.values(doc.formats).flatMap((f) => f.pages);
const markedTexts = (doc: CaseStudyDocument) => textsOf(allPages(doc)).filter((t) => t.text?.startsWith(TEST_DRAFT_MARKER));
const keysOf = (doc: CaseStudyDocument) => Object.fromEntries(Object.entries(doc.formats).map(([id, f]) => [id, f.pages.map((p) => p.pageKey)]));

describe("buildClientIntroTestDraft (Story 3.11)", () => {
  it("is a valid v2 client intro from mac-client@1, in every registry format", () => {
    const doc = build();
    expect(validateNewDocument(doc).ok).toBe(true);
    expect(doc).toMatchObject({ schemaVersion: 2, kind: "client_intro", template: "mac-client@1" });
    expect(Object.keys(doc.formats)).toEqual([...FORMAT_IDS]);
    expect(keysOf(doc)).toEqual({
      presentazione_16_9: ["intro", "results"],
      carosello_1_1: ["intro", "intro-images", "results", "closing"],
      video_9_16: ["intro", "results"],
    });
  });

  it("marks the four texts '[bozza di prova] ', each distinct, the same in every format", () => {
    const doc = build();
    const presentazione = markedTexts({ ...doc, formats: { p: doc.formats.presentazione_16_9 } }).map((t) => t.text);
    expect(new Set(presentazione).size).toBe(4);
    for (const t of markedTexts(doc)) expect(t.text?.startsWith(`${TEST_DRAFT_MARKER} `)).toBe(true);
    const carosello = new Set(markedTexts({ ...doc, formats: { c: doc.formats.carosello_1_1 } }).map((t) => t.text));
    expect(carosello).toEqual(new Set(presentazione));
  });

  it("quotes the description in the intro body and the brief's Contesto in the outro body, citing them; the heads cite the name", () => {
    const byText = new Map(markedTexts(build()).map((t) => [t.text, t.sourceRefs]));
    expect(byText.get(`${TEST_DRAFT_MARKER} Il cliente in breve: ${DESCRIPTION}`)).toEqual([{ kind: "client_field", id: "description" }]);
    expect(byText.get(`${TEST_DRAFT_MARKER} Il contesto in breve: ${CONTEXT}`)).toEqual([{ kind: "client_field", id: "context" }]);
    expect(byText.get(`${TEST_DRAFT_MARKER} Chi è il cliente`)).toEqual([{ kind: "client_field", id: "name" }]);
    expect(byText.get(`${TEST_DRAFT_MARKER} Cosa abbiamo costruito insieme`)).toEqual([{ kind: "client_field", id: "name" }]);
    for (const t of markedTexts(build())) expect(t.provenance).toBe("generated");
  });

  it("cuts a long field at a word boundary", () => {
    const long = `${"parola ".repeat(100)}fine`;
    const body = markedTexts(build({ client: { description: long, context: CONTEXT } })).find((t) => t.text?.includes("Il cliente in breve"))!;
    expect(body.text!.endsWith("…")).toBe(true);
    expect(Array.from(body.text!).length).toBeLessThanOrEqual(TEST_DRAFT_MARKER.length + 1 + "Il cliente in breve: ".length + 400);
  });

  it("writes a fixed sentence citing the name when a field is empty", () => {
    const texts = markedTexts(build({ client: { description: null, context: "  " } }));
    expect(texts.every((t) => JSON.stringify(t.sourceRefs) === JSON.stringify([{ kind: "client_field", id: "name" }]))).toBe(true);
    expect(new Set(texts.map((t) => t.text)).size).toBe(4);
  });

  it("keeps the name, sector and results bindings, never values", () => {
    const doc = build();
    const json = JSON.stringify(doc);
    for (const value of [NAME, SECTOR, "+180%"]) expect(json).not.toContain(value);
    const bound = textsOf(allPages(doc)).flatMap((t) => (t.binding ? [`${t.binding.record}.${t.binding.field}`] : []));
    expect(bound).toEqual(expect.arrayContaining(["client.name", "client.sector", "client.resultValue", "client.testimonialQuote"]));
  });

  it("places the client's first three images", () => {
    const doc = build({ images: [...IMAGES, "aaaaaaaa-0000-4000-8000-000000000009"] });
    const json = JSON.stringify(doc.formats.presentazione_16_9);
    for (const id of IMAGES) expect(json).toContain(id);
    expect(json).not.toContain("aaaaaaaa-0000-4000-8000-000000000009");
  });

  it("has no Risultati e testimonial without results and testimonial; Carosello still ends with Chiusura", () => {
    const doc = build({ resultRows: 0, hasTestimonial: false });
    expect(validateNewDocument(doc).ok).toBe(true);
    expect(keysOf(doc)).toEqual({
      presentazione_16_9: ["intro"],
      carosello_1_1: ["intro", "intro-images", "closing"],
      video_9_16: ["intro"],
    });
  });
});
