import type { Block, DocumentElement, Page } from "@/modules/generation";

/**
 * What is selected on the canvas: a page, a block of it, or an element of that block
 * (a Testi group's or a row's item included). `null`: nothing.
 */
export type Selection = { pageKey: string; blockId?: string; elementId?: string } | null;

/** Esc steps out one level: element → block → page → nothing. */
export function stepOut(selection: Selection): Selection {
  if (selection === null) return null;
  if (selection.elementId !== undefined) return { pageKey: selection.pageKey, blockId: selection.blockId };
  if (selection.blockId !== undefined) return { pageKey: selection.pageKey };
  return null;
}

/** An element of `elements` by id, looking inside Testi groups and rows. */
export function findElement(elements: readonly DocumentElement[], elementId: string): DocumentElement | undefined {
  for (const el of elements) {
    if (el.elementId === elementId) return el;
    if (el.type === "text_group" || el.type === "row") {
      const inner = findElement(el.items, elementId);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

/** The selected page, block and element, as far as they still exist in `pages`. */
export function resolveSelection(pages: readonly Page[], selection: Selection): { page?: Page; block?: Block; element?: DocumentElement } {
  if (selection === null) return {};
  const page = pages.find((p) => p.pageKey === selection.pageKey);
  if (page === undefined) return {};
  const block = selection.blockId === undefined ? undefined : page.blocks.find((b) => b.blockId === selection.blockId);
  if (block === undefined) return { page };
  const element = selection.elementId === undefined ? undefined : findElement(block.elements, selection.elementId);
  return { page, block, element };
}

/**
 * What a click at `target` inside a rendered page selects: the innermost element
 * (its block framed), else the block, else the page.
 */
export function selectionAt(target: Element, pageKey: string): NonNullable<Selection> {
  const block = target.closest("[data-block-id]");
  const blockId = block?.getAttribute("data-block-id") ?? undefined;
  if (blockId === undefined) return { pageKey };
  const element = target.closest("[data-element-id]");
  const elementId = element !== null && block?.contains(element) ? (element.getAttribute("data-element-id") ?? undefined) : undefined;
  return elementId === undefined ? { pageKey, blockId } : { pageKey, blockId, elementId };
}
