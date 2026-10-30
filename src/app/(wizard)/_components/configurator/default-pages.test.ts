import { describe, expect, it } from "vitest";
import {
  buildCaseDocument,
  buildTestDraft,
  caseHistoryV2,
  testDraftTexts,
  validateNewDocument,
  type CaseStudyDocument,
  type DocumentElement,
  type Page,
  type TextElement,
} from "@/modules/generation";
import { defaultPages, FORMAT_IDS, TEMPLATE_TEXT_KEYS, type FormatId, type TemplateTextKey } from "@/modules/rendering";
import { applyDefaultPage, generatedTextsOf, type DefaultPageFill, type FormatTexts } from "./default-pages";
import type { PageEdit } from "./page-editing";

const TEMPLATE = "mac-case@1";
const A = "bbbbbbbb-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "bbbbbbbb-0000-4000-8000-00000000000c";
const D = "bbbbbbbb-0000-4000-8000-00000000000d";

/** Sequential uuids under `prefix`. */
function ids(prefix = "eeeeeeee") {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

/** The test draft of a case with images A–D, a context answer and two result rows with a testimonial. */
const draft = (): CaseStudyDocument =>
  buildTestDraft({
    images: [A, B, C, D],
    assetIds: [A, B, C, D],
    form: { context: "Lumen non aveva una voce online.", solution: "", results: [{}, {}], testimonialQuote: "Finalmente." },
    newId: ids("dddddddd"),
  });

const TEXTS = testDraftTexts({ context: "Lumen non aveva una voce online.", solution: "" }, [A, B, C, D]);

/** The keys each format's starter pages show. */
const KEYS: Readonly<Record<FormatId, readonly TemplateTextKey[]>> = {
  presentazione_16_9: TEMPLATE_TEXT_KEYS,
  carosello_1_1: ["title", "subtitle", "challengeHead", "challengeBody", "ideaHead", "ideaBody"],
  video_9_16: ["title", "subtitle"],
};

const dp = (formatId: FormatId, key: string) => {
  const found = defaultPages(formatId, TEMPLATE).find((d) => d.key === key);
  if (found === undefined) throw new Error(`no default page ${key} in ${formatId}`);
  return found;
};

function fillOf(formatId: FormatId, overrides: Partial<DefaultPageFill> = {}): DefaultPageFill {
  return { texts: generatedTextsOf(draft())[formatId] ?? {}, pool: [A, B, C, D], resultRows: 2, hasTestimonial: true, newId: ids(), ...overrides };
}

function ok(edit: PageEdit): Extract<PageEdit, { ok: true }> {
  if (!edit.ok) throw new Error(`refused: ${edit.reason}`);
  return edit;
}

/** Every text element of a page, inside Testi groups and rows too. */
function textsOf(page: Page): TextElement[] {
  const walk = (elements: readonly DocumentElement[]): TextElement[] =>
    elements.flatMap((el): TextElement[] =>
      el.type === "text" ? [el] : el.type === "text_group" ? [...el.items] : el.type === "row" ? walk(el.items as readonly DocumentElement[]) : [],
    );
  return page.blocks.flatMap((b) => walk(b.elements));
}

/** The asset ids of a page's image elements and image backgrounds, in order. */
function imagesOf(page: Page): (string | null)[] {
  return page.blocks.flatMap((b) => [
    ...(b.background.kind === "image" ? [b.background.assetId] : []),
    ...b.elements.flatMap((el) => (el.type === "image" ? [el.assetId] : [])),
  ]);
}

/** `pages` as `formatId`'s pages in an otherwise valid document, through the server's check; and every id unique. */
function expectValid(pages: readonly Page[], formatId: FormatId) {
  const doc = caseHistoryV2(FORMAT_IDS);
  doc.formats[formatId] = { pages: [...pages] };
  expect(validateNewDocument(doc)).toMatchObject({ ok: true });
  const walk = (elements: readonly DocumentElement[]): string[] =>
    elements.flatMap((el) => [el.elementId, ...(el.type === "text_group" || el.type === "row" ? walk(el.items as readonly DocumentElement[]) : [])]);
  const all = pages.flatMap((p) => p.blocks.flatMap((b) => [b.blockId, ...walk(b.elements)]));
  expect(new Set(all).size).toBe(all.length);
}

const pagesOf = (doc: CaseStudyDocument, formatId: FormatId) => structuredClone(doc.formats[formatId]!.pages);

describe("generatedTextsOf", () => {
  it("finds every key a format's starter pages show, with its words and refs", () => {
    const found = generatedTextsOf(draft());
    for (const formatId of FORMAT_IDS) {
      expect(Object.keys(found[formatId] ?? {}).sort()).toEqual([...KEYS[formatId]].sort());
      for (const key of KEYS[formatId]) {
        expect(found[formatId]?.[key]).toEqual({ text: TEXTS[key].text, sourceRefs: TEXTS[key].sourceRefs });
      }
    }
    expect(found.presentazione_16_9?.challengeHead?.sourceRefs).toEqual([{ kind: "form_field", id: "context" }]);
  });

  it("keeps each format's own words and a text's aspect", () => {
    const words = (formatId: FormatId) =>
      Object.fromEntries(
        TEMPLATE_TEXT_KEYS.map((key) => [key, { text: `${formatId} ${key}`, sourceRefs: [], ...(key === "ideaBody" ? { aspect: "graphic" as const } : {}) }]),
      ) as Record<TemplateTextKey, { text: string; sourceRefs: never[] }>;
    const doc = buildCaseDocument({
      texts: { presentazione_16_9: words("presentazione_16_9"), carosello_1_1: words("carosello_1_1"), video_9_16: words("video_9_16") },
      images: [A],
      resultRows: 0,
      hasTestimonial: false,
      newId: ids(),
    });
    const found = generatedTextsOf(doc);
    expect(found.carosello_1_1?.title).toEqual({ text: "carosello_1_1 title" });
    expect(found.video_9_16?.subtitle).toEqual({ text: "video_9_16 subtitle" });
    expect(found.presentazione_16_9?.ideaBody).toEqual({ text: "presentazione_16_9 ideaBody", aspect: "graphic" });
  });

  it("gives nothing with no document, and leaves out a key whose page or block doesn't line up", () => {
    expect(generatedTextsOf(null)).toEqual({});
    const doc = draft();
    doc.formats.carosello_1_1!.pages = doc.formats.carosello_1_1!.pages.filter((p) => p.pageKey !== "intro-sfida");
    doc.formats.presentazione_16_9!.pages[0]!.blocks[0]!.elements = [];
    const found = generatedTextsOf(doc);
    expect(found.carosello_1_1?.challengeHead).toBeUndefined();
    expect(found.carosello_1_1?.ideaHead?.text).toBe(TEXTS.ideaHead.text);
    expect(found.presentazione_16_9?.title).toBeUndefined();
    expect(found.presentazione_16_9?.challengeHead?.text).toBe(TEXTS.challengeHead.text);
  });
});

describe("applyDefaultPage", () => {
  it("lays Contenuti out as 3 immagini: its own images first, then the pool; generated texts; key, name and section kept", () => {
    const pages = pagesOf(draft(), "presentazione_16_9");
    const index = pages.findIndex((p) => p.pageKey === "content");
    const content = pages[index]!;
    content.name = "I nostri lavori";
    content.blocks = content.blocks.slice(0, 2);
    content.blocks[0]!.elements = [{ elementId: ids("ffffffff")(), type: "image", assetId: C, fit: "fill" }];
    content.blocks[1]!.elements = [{ elementId: ids("abababab")(), type: "image", assetId: B, fit: "fill" }];
    content.grid = { layoutId: "column", rows: [1, 1], cols: [1] };

    const edit = ok(applyDefaultPage(pages, "content", dp("presentazione_16_9", "content_3"), fillOf("presentazione_16_9")));
    const next = edit.pages[index]!;
    expect(edit.selection).toEqual({ pageKey: "content" });
    expect(edit.pages.map((p) => p.pageKey)).toEqual(pages.map((p) => p.pageKey));
    expect([next.pageKey, next.name, next.section, next.grid.layoutId]).toEqual(["content", "I nostri lavori", "output", "content_3"]);
    expect(imagesOf(next)).toEqual([C, B, A]);
    const words = textsOf(next).map((t) => t.text);
    expect(words).toContain(TEXTS.outputHead.text);
    expect(words).toContain(TEXTS.outputBody.text);
    expectValid(edit.pages, "presentazione_16_9");
  });

  it("keeps a page's own image where the template reads it: Presentazione Risultati's visual is the second image", () => {
    const pages = pagesOf(draft(), "presentazione_16_9");
    const index = pages.findIndex((p) => p.pageKey === "results");
    const visual = pages[index]!.blocks[0]!.elements[0]!;
    if (visual.type !== "image") throw new Error("no visual");
    visual.assetId = D.toUpperCase();
    const edit = ok(applyDefaultPage(pages, "results", dp("presentazione_16_9", "results"), fillOf("presentazione_16_9")));
    expect(imagesOf(edit.pages[index]!)).toEqual([D]);
    expectValid(edit.pages, "presentazione_16_9");
  });

  it("puts the generated text back over an edited one, with its refs, as generated", () => {
    const pages = pagesOf(draft(), "presentazione_16_9");
    const title = textsOf(pages[0]!).find((t) => t.text === TEXTS.title.text)!;
    title.text = "Un titolo riscritto";
    title.provenance = "human_edited";
    const edit = ok(applyDefaultPage(pages, "intro", dp("presentazione_16_9", "intro"), fillOf("presentazione_16_9")));
    const restored = textsOf(edit.pages[0]!).find((t) => t.text === TEXTS.title.text);
    expect(restored).toMatchObject({ provenance: "generated", sourceRefs: [{ kind: "asset", id: A }] });
    expect(textsOf(edit.pages[0]!).some((t) => t.text === "Un titolo riscritto")).toBe(false);
    // The intro's photo is the page's own image.
    expect(imagesOf(edit.pages[0]!)).toEqual([A]);
    expectValid(edit.pages, "presentazione_16_9");
  });

  it("Carosello Intro brings back its Sfida and Idea after the cover when they were deleted", () => {
    const pages = pagesOf(draft(), "carosello_1_1").filter((p) => p.pageKey !== "intro-sfida" && p.pageKey !== "intro-idea");
    const edit = ok(applyDefaultPage(pages, "intro", dp("carosello_1_1", "intro"), fillOf("carosello_1_1")));
    expect(edit.pages.map((p) => p.pageKey)).toEqual(["intro", "intro-sfida", "intro-idea", "content", "results", "closing"]);
    expect(edit.pages.slice(0, 3).map((p) => [p.name, p.section])).toEqual([
      ["Copertina", "intro"],
      ["Sfida", "intro"],
      ["Idea", "intro"],
    ]);
    expect(textsOf(edit.pages[1]!).map((t) => t.text)).toContain(TEXTS.challengeBody.text);
    expectValid(edit.pages, "carosello_1_1");
  });

  it("Carosello Intro again replaces the Sfida and Idea it added before, wherever they are; the page count stays", () => {
    const pages = pagesOf(draft(), "carosello_1_1");
    const idea = pages.splice(pages.findIndex((p) => p.pageKey === "intro-idea"), 1)[0]!;
    pages.push(idea);
    const edit = ok(applyDefaultPage(pages, "intro", dp("carosello_1_1", "intro"), fillOf("carosello_1_1")));
    expect(edit.pages.map((p) => p.pageKey)).toEqual(["intro", "intro-sfida", "intro-idea", "content", "results", "closing"]);
    expect(edit.pages[2]!.blocks[0]!.blockId).not.toBe(idea.blocks[0]!.blockId);
    expectValid(edit.pages, "carosello_1_1");
  });

  it("Intro on another Carosello page makes it the cover, with its own Sfida and Idea after it, in its section", () => {
    const pages = pagesOf(draft(), "carosello_1_1");
    const edit = ok(applyDefaultPage(pages, "content", dp("carosello_1_1", "intro"), fillOf("carosello_1_1")));
    expect(edit.pages.map((p) => p.pageKey)).toEqual(["intro", "intro-sfida", "intro-idea", "content", "content-sfida", "content-idea", "results", "closing"]);
    expect(edit.pages.slice(3, 6).map((p) => p.section)).toEqual(["output", "output", "output"]);
    expect(edit.pages[3]!.name).toBe("Contenuti");
    expectValid(edit.pages, "carosello_1_1");
  });

  it("other default pages add no page", () => {
    for (const formatId of FORMAT_IDS) {
      for (const d of defaultPages(formatId, TEMPLATE)) {
        if (formatId === "carosello_1_1" && d.key === "intro") continue;
        const pages = pagesOf(draft(), formatId);
        const target = pages[pages.length - 1]!.pageKey;
        const edit = ok(applyDefaultPage(pages, target, d, fillOf(formatId)));
        expect(edit.pages.map((p) => p.pageKey)).toEqual(pages.map((p) => p.pageKey));
        expectValid(edit.pages, formatId);
      }
    }
  });

  it("Risultati e testimonial on a case with neither changes nothing", () => {
    const pages = pagesOf(draft(), "video_9_16");
    expect(applyDefaultPage(pages, "intro", dp("video_9_16", "results"), fillOf("video_9_16", { resultRows: 0, hasTestimonial: false }))).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("a key with no generated text comes back empty", () => {
    const texts: FormatTexts = { title: { text: "Solo il titolo" } };
    const pages = pagesOf(draft(), "video_9_16");
    const edit = ok(applyDefaultPage(pages, "intro", dp("video_9_16", "intro"), fillOf("video_9_16", { texts })));
    const words = textsOf(edit.pages[0]!).map((t) => t.text);
    expect(words).toContain("Solo il titolo");
    expect(words).toContain("");
    expect(words.some((w) => w?.includes("⟦"))).toBe(false);
    expectValid(edit.pages, "video_9_16");
  });

  it("refuses an unknown page", () => {
    expect(applyDefaultPage(pagesOf(draft(), "video_9_16"), "nope", dp("video_9_16", "intro"), fillOf("video_9_16"))).toEqual({ ok: false, reason: "nothing" });
  });
});
