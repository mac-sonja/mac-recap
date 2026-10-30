import type { CaseStudyDocument, ClaimAspect, DocumentElement, DocumentMaterialRef, Page, TextElement } from "@/modules/generation";
import { FORMAT_IDS, starterPages, TEMPLATE_TEXT_KEYS, type DefaultPage, type FormatId, type TemplateTextKey } from "@/modules/rendering";
import type { PageEdit } from "./page-editing";

/**
 * **Pagine di default** (Story 4.4c, C31): a page laid out again as one of the format's
 * template pages, filled with the case's generated texts (owner, 2026-10-30) and its
 * own images first. Pure.
 *
 * `generated_doc` keeps no texts by key, but it was built by the same template
 * builders (`buildCaseDocument` → `starterPages`). Building them again with a marker as
 * each key's text shows where every key's words sit, and the generated document holds
 * the AI's (or the test draft's) words in that place.
 */

/** One generated text: its words and, as generated, the material it cites and the side of the work it covers. */
export interface GeneratedText {
  text: string;
  sourceRefs?: readonly DocumentMaterialRef[];
  aspect?: ClaimAspect;
}

/** A format's generated texts by template key; a key it doesn't show is missing. */
export type FormatTexts = Readonly<Partial<Record<TemplateTextKey, GeneratedText>>>;
export type GeneratedTexts = Readonly<Partial<Record<FormatId, FormatTexts>>>;

/** Never typed by a person or written by the AI: the brackets and the prefix keep it apart from any real text. */
const marker = (key: TemplateTextKey) => `⟦mac-recap:${key}⟧`;
const MARKERS: Readonly<Partial<Record<TemplateTextKey, string>>> = Object.fromEntries(TEMPLATE_TEXT_KEYS.map((key) => [key, marker(key)]));
const KEY_OF: ReadonlyMap<string, TemplateTextKey> = new Map(TEMPLATE_TEXT_KEYS.map((key) => [marker(key), key]));

/** A block's text elements in reading order, inside Testi groups and rows too. */
function textsIn(elements: readonly DocumentElement[]): TextElement[] {
  return elements.flatMap((el): TextElement[] => {
    if (el.type === "text") return [el];
    if (el.type === "text_group") return [...el.items];
    if (el.type === "row") return textsIn(el.items as readonly DocumentElement[]);
    return [];
  });
}

/** Ids for marker builds only: never stored. */
const throwawayIds = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

/**
 * Each format's generated texts, read from `generated_doc` where the template's starter
 * pages put each key. Pages are matched by `pageKey` and texts by their place in the
 * block; a block whose texts don't line up gives nothing, so a key it holds is missing.
 */
export function generatedTextsOf(doc: CaseStudyDocument | null): GeneratedTexts {
  if (doc === null) return {};
  return Object.fromEntries(
    FORMAT_IDS.map((formatId) => {
      const found: Partial<Record<TemplateTextKey, GeneratedText>> = {};
      const generated = doc.formats[formatId]?.pages ?? [];
      const marked = starterPages(doc.template, doc.kind, formatId, { newId: throwawayIds(), texts: MARKERS, images: [], resultRows: 0, hasTestimonial: false });
      for (const page of marked) {
        const twin = generated.find((p) => p.pageKey === page.pageKey);
        if (twin === undefined || twin.blocks.length !== page.blocks.length) continue;
        page.blocks.forEach((block, b) => {
          const places = textsIn(block.elements);
          const texts = textsIn(twin.blocks[b]!.elements);
          if (places.length !== texts.length) return;
          places.forEach((place, i) => {
            const key = place.text === undefined ? undefined : KEY_OF.get(place.text);
            const text = texts[i]!;
            if (key === undefined || key in found || text.text === undefined) return;
            found[key] = {
              text: text.text,
              ...(text.sourceRefs === undefined ? {} : { sourceRefs: text.sourceRefs }),
              ...(text.aspect === undefined ? {} : { aspect: text.aspect }),
            };
          });
        });
      }
      return [formatId, found];
    }),
  );
}

/** Every asset id a page shows, in document order: the page's and blocks' image backgrounds, media and animations. */
function assetsOf(page: Page): string[] {
  const ids: string[] = [];
  const walk = (elements: readonly DocumentElement[]) => {
    for (const el of elements) {
      if ((el.type === "image" || el.type === "video") && el.assetId !== null) ids.push(el.assetId);
      else if (el.type === "animation") ids.push(...el.assetIds);
      else if (el.type === "row") walk(el.items as readonly DocumentElement[]);
    }
  };
  if (page.background.kind === "image") ids.push(page.background.assetId);
  for (const block of page.blocks) {
    if (block.background.kind === "image") ids.push(block.background.assetId);
    walk(block.elements);
  }
  return ids;
}

/** What a default page is filled from. */
export interface DefaultPageFill {
  /** The format's generated texts. */
  texts: FormatTexts;
  /** The case's images a page may show (those the document or `generated_doc` uses), oldest first. */
  pool: readonly string[];
  resultRows: number;
  hasTestimonial: boolean;
  newId: () => string;
}

/** Puts each key's generated text (or `""`) in place of its marker, with its refs and aspect, as generated. */
function fillTexts(page: Page, texts: FormatTexts): Page {
  const fillText = (el: TextElement): TextElement => {
    const key = el.text === undefined ? undefined : KEY_OF.get(el.text);
    if (key === undefined) return el;
    const found = texts[key];
    const filled: TextElement = { ...el, text: found?.text ?? "", provenance: "generated" };
    delete filled.sourceRefs;
    delete filled.aspect;
    if (found?.sourceRefs !== undefined && found.sourceRefs.length > 0) filled.sourceRefs = [...found.sourceRefs];
    if (found?.aspect !== undefined) filled.aspect = found.aspect;
    return filled;
  };
  const fillElement = (el: DocumentElement): DocumentElement => {
    if (el.type === "text") return fillText(el);
    if (el.type === "text_group") return { ...el, items: el.items.map(fillText) };
    if (el.type === "row") return { ...el, items: el.items.map((item) => fillElement(item) as (typeof el.items)[number]) };
    return el;
  };
  return { ...page, blocks: page.blocks.map((block) => ({ ...block, elements: block.elements.map(fillElement) })) };
}

/**
 * `ordered` (the page's own images, then the pool) put where `defaultPage` reads them:
 * a probe build shows which `ctx.images` indexes it places, in page order (Presentazione
 * Risultati starts at 1), and those take `ordered` first; the other indexes take the rest.
 */
function imagesFor(defaultPage: DefaultPage, ordered: readonly string[], fill: DefaultPageFill): string[] {
  const probes = ordered.map((_, i) => `ffffffff-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const probed = defaultPage.build({ newId: throwawayIds(), texts: {}, images: probes, resultRows: fill.resultRows, hasTestimonial: fill.hasTestimonial });
  const slots = [...new Set(probed.flatMap(assetsOf).map((id) => probes.indexOf(id)).filter((i) => i >= 0))];
  const rest = ordered.map((_, i) => i).filter((i) => !slots.includes(i));
  const images: string[] = [];
  [...slots, ...rest].forEach((index, n) => (images[index] = ordered[n]!));
  return images;
}

/**
 * Page `pageKey` laid out as `defaultPage`: its blocks, grid, background, margin,
 * decoration and role, filled from `fill` with the page's own images first; the page
 * keeps its key, name and section, and is selected. Carosello Intro's other pages
 * (Sfida, Idea) replace the ones keyed `{pageKey}-…` and follow it, in its section.
 * Refused as `empty` when the default page builds nothing.
 */
export function applyDefaultPage(pages: readonly Page[], pageKey: string, defaultPage: DefaultPage, fill: DefaultPageFill): PageEdit {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return { ok: false, reason: "nothing" };
  const page = pages[index]!;
  const pool = new Map(fill.pool.map((id) => [id.toLowerCase(), id]));
  const own = assetsOf(page).flatMap((id) => pool.get(id.toLowerCase()) ?? []);
  const images = imagesFor(defaultPage, [...new Set([...own, ...fill.pool])], fill);
  const built = defaultPage.build({ newId: fill.newId, texts: MARKERS, images, resultRows: fill.resultRows, hasTestimonial: fill.hasTestimonial });
  const [first, ...more] = built.map((p) => fillTexts(p, fill.texts));
  if (first === undefined) return { ok: false, reason: "empty" };

  const keep = { pageKey, name: page.name, section: page.section };
  const extras = more.map((p) => ({
    ...p,
    pageKey: p.pageKey.startsWith(`${first.pageKey}-`) ? `${pageKey}${p.pageKey.slice(first.pageKey.length)}` : `${pageKey}-${p.pageKey}`,
    section: page.section,
  }));
  const replaced = new Set(extras.map((p) => p.pageKey));
  const next = pages.filter((p) => p.pageKey === pageKey || !replaced.has(p.pageKey));
  const at = next.findIndex((p) => p.pageKey === pageKey);
  next.splice(at, 1, { ...first, ...keep }, ...extras);
  return { ok: true, pages: next, selection: { pageKey } };
}
