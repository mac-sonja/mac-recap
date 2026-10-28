/**
 * Overflow of rendered pages (Story 3.5): which blocks hold more than they show, and
 * which pages have such a block. Reads the DOM a renderer drew (`data-page-key` on each
 * page, `data-block-id` on each block); run it in a browser after layout (the
 * configurator, the export's headless browser). Measure a render made with
 * `animateTexts: false` (or `still`): Video texts mid-loop are translated and would skew it.
 * A page overflows only when one of its blocks does: the page clips its own decoration
 * (the closing page's star reaches past its edges), which is not overflow.
 */
export interface BlockOverflow {
  blockId: string;
  overflow: boolean;
}

export interface PageOverflow {
  pageKey: string;
  /** True when any of its blocks overflows. */
  overflow: boolean;
  blocks: BlockOverflow[];
}

export interface OverflowReport {
  pages: PageOverflow[];
}

/** One pixel of slack for sub-pixel rounding. */
const SLACK = 1;

const overflows = (el: Element) => el.scrollHeight > el.clientHeight + SLACK || el.scrollWidth > el.clientWidth + SLACK;

export function measureOverflow(root: ParentNode): OverflowReport {
  const found = Array.from(root.querySelectorAll<HTMLElement>("[data-page-key]"));
  // `root` may itself be a page.
  if (root instanceof HTMLElement && root.matches("[data-page-key]")) found.unshift(root);
  const pages = found.map((page) => {
    const blocks = Array.from(page.querySelectorAll<HTMLElement>("[data-block-id]")).map((block) => ({
      blockId: block.dataset.blockId ?? "",
      overflow: overflows(block),
    }));
    return { pageKey: page.dataset.pageKey ?? "", overflow: blocks.some((b) => b.overflow), blocks };
  });
  return { pages };
}
