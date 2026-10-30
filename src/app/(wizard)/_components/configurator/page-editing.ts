import type { Block, DocumentElement, Page, TextElement, TextStyle } from "@/modules/generation";
import { layouts, type FormatId } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";
import type { Selection } from "./selection";

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
  | { ok: false; reason: "noBlock" | "pageFull" | "blockFull" | "nothing" };

const refused = (reason: Extract<PageEdit, { ok: false }>["reason"]): PageEdit => ({ ok: false, reason });

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

/** An empty block ("Blocco", the template's grey) after block `after` of page `pageKey`, else at the end. */
export function addBlock(pages: readonly Page[], pageKey: string, after: string | undefined, formatId: FormatId, template: string, newId: () => string): PageEdit {
  const block: Block = { blockId: newId(), name: it.configurator.edit.newBlock, background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [] };
  return insertBlock(pages, pageKey, after, block, formatId, template);
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
