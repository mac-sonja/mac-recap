import type { Background, Block, DocumentElement, Page, TextElement, TextStyle } from "@/modules/generation";
import { layouts, type FormatId, type Layout } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import type { Selection } from "./selection";
import { parseColour, TEXT_COLOURS } from "./text-editing";

/** The Elementi a click adds to a block (Story 4.3c): Blocco and Animazione are not elements here. */
export const NEW_ELEMENTS = ["group", "title", "text", "number", "quote", "label", "image", "video"] as const;
export type NewElementKind = (typeof NEW_ELEMENTS)[number];

/** The document's limits (`generation`'s `MAX_BLOCKS_PER_PAGE`, `MAX_ELEMENTS_PER_BLOCK`; the tests hold them to the schema). */
export const MAX_BLOCKS_PER_PAGE = 6;
export const MAX_ELEMENTS_PER_BLOCK = 30;

/** A new block's background: the template's block grey (a template value, not a tool token). */
export const NEW_BLOCK_COLOUR = "#ededf0";

/** The grid id of a block count the format has no layout for: no template uses it, so the renderer stacks the blocks. */
export const COLUMN_LAYOUT_ID = "column";

/** What an edit did: the new pages and what to select, or why nothing changed. */
export type PageEdit =
  | { ok: true; pages: readonly Page[]; selection: NonNullable<Selection> }
  /** `empty`: a default page with nothing to show (Story 4.4c). */
  | { ok: false; reason: "noBlock" | "pageFull" | "blockFull" | "nothing" | "empty" }
  /** A layout with fewer cells than the page's filled blocks: `over` blocks too many. */
  | { ok: false; reason: "over"; over: number };

const refused = (reason: Exclude<Extract<PageEdit, { ok: false }>["reason"], "over">): PageEdit => ({ ok: false, reason });

const newText = (newId: () => string, style: TextStyle, text: string): TextElement => ({
  elementId: newId(),
  type: "text",
  style,
  text,
  provenance: "human_added",
});

/** A new element of `kind` (mockup `ELEMENTS`): texts with their placeholder words, an empty image or video. */
export function newElement(kind: NewElementKind, newId: () => string): DocumentElement {
  const words = it.configurator.newTexts;
  switch (kind) {
    case "group":
      return {
        elementId: newId(),
        type: "text_group",
        align: "split",
        splitAt: 1,
        items: [newText(newId, "lab", words.label), newText(newId, "title", words.groupTitle), newText(newId, "text", words.text)],
      };
    case "title":
      return newText(newId, "title", words.title);
    case "text":
      return newText(newId, "text", words.text);
    case "number":
      return newText(newId, "num", words.number);
    case "quote":
      return newText(newId, "quote", words.quote);
    case "label":
      return newText(newId, "lab", words.label);
    case "image":
    case "video":
      return { elementId: newId(), type: kind, assetId: null, fit: "fill" };
  }
}

/** Sets `page`'s grid to the format's first layout for its block count, or one column; at 0 blocks it stays. */
export function restartGrid(page: Page, formatId: FormatId, template: string): void {
  const n = page.blocks.length;
  if (n === 0) return;
  const layout = layouts(formatId, template).find((l) => l.areas.length === n);
  page.grid =
    layout === undefined
      ? { layoutId: COLUMN_LAYOUT_ID, rows: Array.from({ length: n }, () => 1), cols: [1] }
      : { layoutId: layout.layoutId, rows: [...layout.rows], cols: [...layout.cols] };
}

/** A copy of `block` with fresh block and element ids (inside Testi groups and rows too). */
export function withFreshIds(block: Block, newId: () => string): Block {
  const renew = (el: DocumentElement): DocumentElement =>
    el.type === "text_group"
      ? { ...el, elementId: newId(), items: el.items.map((item) => ({ ...item, elementId: newId() })) }
      : el.type === "row"
        ? { ...el, elementId: newId(), items: el.items.map((item) => renew(item) as (typeof el.items)[number]) }
        : { ...el, elementId: newId() };
  const copy = structuredClone(block);
  return { ...copy, blockId: newId(), elements: copy.elements.map(renew) };
}

/** Copies the page at `index`, applies `edit` to the copy, and puts it in place of the original. */
function withPage(pages: readonly Page[], index: number, edit: (page: Page) => void): readonly Page[] {
  const copy = structuredClone(pages[index]!);
  edit(copy);
  return pages.map((p, i) => (i === index ? copy : p));
}

/** `kind` appended to the selected block (or the selected element's block), and selected. */
export function addElement(pages: readonly Page[], selection: Selection, kind: NewElementKind, newId: () => string): PageEdit {
  const index = selection === null ? -1 : pages.findIndex((p) => p.pageKey === selection.pageKey);
  const blockId = selection?.blockId;
  const block = index < 0 || blockId === undefined ? undefined : pages[index]!.blocks.find((b) => b.blockId === blockId);
  if (block === undefined) return refused("noBlock");
  if (block.elements.length >= MAX_ELEMENTS_PER_BLOCK) return refused("blockFull");
  const element = newElement(kind, newId);
  const next = withPage(pages, index, (page) => page.blocks.find((b) => b.blockId === blockId)!.elements.push(element));
  return { ok: true, pages: next, selection: { pageKey: pages[index]!.pageKey, blockId, elementId: element.elementId } };
}

/** `block` put on page `pageKey` after block `after` (else at the end), the grid restarted, and selected. */
function insertBlock(pages: readonly Page[], pageKey: string, after: string | undefined, block: Block, formatId: FormatId, template: string): PageEdit {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return refused("nothing");
  if (pages[index]!.blocks.length >= MAX_BLOCKS_PER_PAGE) return refused("pageFull");
  const next = withPage(pages, index, (page) => {
    const at = page.blocks.findIndex((b) => b.blockId === after);
    page.blocks.splice(at < 0 ? page.blocks.length : at + 1, 0, block);
    restartGrid(page, formatId, template);
  });
  return { ok: true, pages: next, selection: { pageKey, blockId: block.blockId } };
}

/** An empty block: "Blocco", the template's grey. */
const emptyBlock = (newId: () => string): Block => ({
  blockId: newId(),
  name: it.configurator.edit.newBlock,
  background: { kind: "colour", value: NEW_BLOCK_COLOUR },
  elements: [],
});

/** An empty block ("Blocco", the template's grey) after block `after` of page `pageKey`, else at the end. */
export function addBlock(pages: readonly Page[], pageKey: string, after: string | undefined, formatId: FormatId, template: string, newId: () => string): PageEdit {
  return insertBlock(pages, pageKey, after, emptyBlock(newId), formatId, template);
}

/** A block with no elements and no image background: a layout may add or remove it. */
const isEmpty = (block: Block) => block.elements.length === 0 && block.background.kind !== "image";

const sameTracks = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Page `pageKey` laid out as `layout` (Story 4.4a), its track sizes reset and the page
 * selected. More cells add empty blocks at the end; fewer remove empty blocks, last
 * first, and refuse (`over`) when filled blocks would have to go.
 */
export function applyLayout(pages: readonly Page[], pageKey: string, layout: Layout, newId: () => string): PageEdit {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return refused("nothing");
  const page = pages[index]!;
  const cells = layout.areas.length;
  const n = page.blocks.length;
  if (cells === n && page.grid.layoutId === layout.layoutId && sameTracks(page.grid.rows, layout.rows) && sameTracks(page.grid.cols, layout.cols)) {
    return refused("nothing");
  }
  const over = n - cells - page.blocks.filter(isEmpty).length;
  if (over > 0) return { ok: false, reason: "over", over };
  const next = withPage(pages, index, (copy) => {
    while (copy.blocks.length < cells) copy.blocks.push(emptyBlock(newId));
    for (let i = copy.blocks.length - 1; i >= 0 && copy.blocks.length > cells; i--) if (isEmpty(copy.blocks[i]!)) copy.blocks.splice(i, 1);
    copy.grid = { layoutId: layout.layoutId, rows: [...layout.rows], cols: [...layout.cols] };
  });
  return { ok: true, pages: next, selection: { pageKey } };
}

/** The layouts **Mescola** cycles through for a page of `blocks` blocks: shown only when there are two or more. */
export const shuffleChoices = (formatId: FormatId, template: string, blocks: number): readonly Layout[] =>
  layouts(formatId, template).filter((l) => l.areas.length === blocks);

/**
 * **Mescola**: page `pageKey` on the next layout with its number of blocks, back to the
 * first after the last (the first from a grid not among them); track sizes reset, the
 * blocks stay. `pages` itself when there is nothing to cycle through.
 */
export function shuffleLayout(pages: readonly Page[], pageKey: string, formatId: FormatId, template: string): readonly Page[] {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return pages;
  const page = pages[index]!;
  const choices = shuffleChoices(formatId, template, page.blocks.length);
  if (choices.length < 2) return pages;
  const at = choices.findIndex((l) => l.layoutId === page.grid.layoutId);
  const layout = choices[(at + 1) % choices.length]!;
  return withPage(pages, index, (copy) => {
    copy.grid = { layoutId: layout.layoutId, rows: [...layout.rows], cols: [...layout.cols] };
  });
}

/** Sfondo's swatches (C30): the template's palette and transparent, the same as the text's. */
export const BACKGROUND_SWATCHES = TEXT_COLOURS;
export type BackgroundSwatch = (typeof BACKGROUND_SWATCHES)[number];

/** A swatch as a background. */
export const swatchBackground = (swatch: BackgroundSwatch): Background =>
  swatch === "transparent" ? { kind: "transparent" } : { kind: "colour", value: swatch };

/** A typed background colour: `#rrggbb` (the `#` optional, any case) or "Trasparente"; undefined for anything else. */
export function parseBackground(typed: string): Background | undefined {
  const parsed = parseColour(typed);
  if (parsed === "transparent") return { kind: "transparent" };
  // A background has no alpha: `#rrggbbaa` is not one.
  return parsed !== undefined && parsed.length === 7 ? { kind: "colour", value: parsed } : undefined;
}

const sameBackground = (a: Background, b: Background) =>
  a.kind === b.kind && (a.kind !== "colour" || a.value.toLowerCase() === (b as Extract<Background, { kind: "colour" }>).value.toLowerCase()) && (a.kind !== "image" || a.assetId === (b as Extract<Background, { kind: "image" }>).assetId);

/** Sets the background of block `blockId`, or of page `pageKey` without one; `pages` itself when it already has it. */
export function setBackground(pages: readonly Page[], pageKey: string, blockId: string | undefined, background: Background): readonly Page[] {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return pages;
  const page = pages[index]!;
  const target = blockId === undefined ? page : page.blocks.find((b) => b.blockId === blockId);
  if (target === undefined || sameBackground(target.background, background)) return pages;
  return withPage(pages, index, (copy) => {
    const into = blockId === undefined ? copy : copy.blocks.find((b) => b.blockId === blockId)!;
    into.background = background;
  });
}

/** A copy of `block`, with fresh ids, after the selected block, else at the end of the selected page. */
export function pasteBlock(pages: readonly Page[], selection: Selection, block: Block, formatId: FormatId, template: string, newId: () => string): PageEdit {
  if (selection === null) return refused("nothing");
  return insertBlock(pages, selection.pageKey, selection.blockId, withFreshIds(block, newId), formatId, template);
}

/**
 * Removes element `elementId` from `elements`, inside Testi groups and rows too. A group
 * or row left empty goes with it; a split group's `splitAt` is clamped to its texts.
 */
function removeFrom(elements: DocumentElement[], elementId: string): boolean {
  const at = elements.findIndex((el) => el.elementId === elementId);
  if (at >= 0) {
    elements.splice(at, 1);
    return true;
  }
  for (const [i, el] of elements.entries()) {
    if (el.type !== "text_group" && el.type !== "row") continue;
    if (!removeFrom(el.items as DocumentElement[], elementId)) continue;
    if (el.items.length === 0) elements.splice(i, 1);
    else if (el.type === "text_group" && el.splitAt !== undefined && el.splitAt > el.items.length) el.splitAt = el.items.length;
    return true;
  }
  return false;
}

/**
 * The selected element removed (its block then selected), or the selected block (its page
 * then selected, the grid restarted). A page alone is not removed here (4.13).
 */
export function removeSelection(pages: readonly Page[], selection: Selection, formatId: FormatId, template: string): PageEdit {
  if (selection?.blockId === undefined) return refused("nothing");
  const { pageKey, blockId, elementId } = selection;
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  const block = index < 0 ? undefined : pages[index]!.blocks.find((b) => b.blockId === blockId);
  if (block === undefined) return refused("nothing");
  if (elementId !== undefined) {
    let removed = false;
    const next = withPage(pages, index, (page) => {
      removed = removeFrom(page.blocks.find((b) => b.blockId === blockId)!.elements, elementId);
    });
    return removed ? { ok: true, pages: next, selection: { pageKey, blockId } } : refused("nothing");
  }
  const next = withPage(pages, index, (page) => {
    page.blocks = page.blocks.filter((b) => b.blockId !== blockId);
    restartGrid(page, formatId, template);
  });
  return { ok: true, pages: next, selection: { pageKey } };
}
