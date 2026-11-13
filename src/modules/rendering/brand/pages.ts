import type { Page } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";

/**
 * MAC's own opening and closing pages of a Presentazione file (Figma `lUcMm0xOxW7Y50M93buTDb`:
 * "Our projects", node 1047:291, and the company details with the "Mac" wordmark, node
 * 1031:218). Code constants, never stored in a document or a revision: the renderer adds them
 * around every Presentazione file (`composeParts`), and every surface draws them from here.
 * Their element ids never change, so a collection's text edits can name them: only the "Our
 * projects" title is a free text (editable in a collection only); every other MAC text is fixed
 * markup of the renderer (`brand/render.tsx`), not a document element.
 */

/** The ref the brand pages are drawn with (`renderFormat`): not a template of the registry, no document holds it. */
export const BRAND_TEMPLATE = "mac-brand@1";

/** The only format with MAC's pages. */
export const BRAND_FORMAT = "presentazione_16_9" satisfies FormatId;

export const BRAND_INTRO_KEY = "mac-brand-intro";
export const BRAND_OUTRO_KEY = "mac-brand-outro";

/** The layout id the brand pages carry: how a page is known as MAC's wherever it is drawn. */
export const BRAND_LAYOUT = "mac-brand";

/** The brand's id as a collection part (`part_kind` 'brand'): a fixed sentinel, "MAC" in hex. */
export const BRAND_PART_ID = "4d414300-0000-4000-8000-000000000000";

/** The "Our projects" title: the one free text of MAC's pages. */
export const BRAND_TITLE_ELEMENT_ID = "4d414300-0000-4000-8000-000000000001";
const BRAND_TITLE_BLOCK_ID = "4d414300-0000-4000-8000-000000000002";
export const BRAND_TITLE = "Our projects";

/** The gradient's middle stop: what a page's background stands for where the gradient isn't drawn. */
const BRAND_BLUE = "#1455C7";

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

/** "Our projects": the title, MAC's name and site, the lime star. */
export const BRAND_INTRO: Page = deepFreeze({
  pageKey: BRAND_INTRO_KEY,
  name: "MAC · Our projects",
  role: "intro",
  section: "intro",
  background: { kind: "colour", value: BRAND_BLUE },
  grid: { layoutId: BRAND_LAYOUT, rows: [1], cols: [1] },
  blocks: [
    {
      blockId: BRAND_TITLE_BLOCK_ID,
      name: "Titolo",
      background: { kind: "transparent" },
      elements: [{ elementId: BRAND_TITLE_ELEMENT_ID, type: "text", style: "xl", text: BRAND_TITLE, provenance: "human_added" }],
    },
  ],
} satisfies Page);

/** MAC's company details and the "Mac" wordmark: nothing in it is a document element. */
export const BRAND_OUTRO: Page = deepFreeze({
  pageKey: BRAND_OUTRO_KEY,
  name: "MAC · Contatti",
  role: "outro",
  section: "risultati",
  background: { kind: "colour", value: BRAND_BLUE },
  grid: { layoutId: BRAND_LAYOUT, rows: [1], cols: [1] },
  blocks: [],
} satisfies Page);

/** MAC's pages, in the order they sit around a file: the intro first, the outro last. */
export const BRAND_PAGES: readonly Page[] = Object.freeze([BRAND_INTRO, BRAND_OUTRO]);

/** Whether a file in `formatId` opens and closes with MAC's pages: Presentazione only. */
export const hasBrandPages = (formatId: string): boolean => formatId === BRAND_FORMAT;

/** How many MAC pages a file in `formatId` adds (a non-empty one). */
export const brandPageCount = (formatId: string): number => (hasBrandPages(formatId) ? BRAND_PAGES.length : 0);

/** Whether `page` is one of MAC's pages (or a copy of one: a collection's worded or keyed copy). */
export const isBrandPage = (page: Pick<Page, "grid">): boolean => page.grid.layoutId === BRAND_LAYOUT;

/** A page key of MAC's pages (the bare key; a collection's shown key ends with it). */
export const isBrandPageKey = (pageKey: string): boolean =>
  pageKey === BRAND_INTRO_KEY || pageKey === BRAND_OUTRO_KEY || pageKey.endsWith(`|${BRAND_INTRO_KEY}`) || pageKey.endsWith(`|${BRAND_OUTRO_KEY}`);

/**
 * `pages` as a reader sees them in `formatId`: in Presentazione, MAC's intro first and its outro
 * last (only around at least one page); every other format, `pages` itself.
 */
export function withBrandPages(formatId: string, pages: readonly Page[]): readonly Page[] {
  if (!hasBrandPages(formatId) || pages.length === 0) return pages;
  return [BRAND_INTRO, ...pages, BRAND_OUTRO];
}

/** The ref a page is drawn with: MAC's for its own pages, else the part's `template`. */
export const templateOfPage = (page: Pick<Page, "grid">, template: string): string => (isBrandPage(page) ? BRAND_TEMPLATE : template);
