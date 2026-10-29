import type { DocumentElement, Page, TextElement } from "@/modules/generation";
import { findElement } from "./selection";

/** A text with its own words: the only kind edited on the page (bound texts are 4.3d). */
export type OwnText = TextElement & { text: string };

/** Whether `el` is a text holding its own words (not a client or case field). */
export const isOwnText = (el: DocumentElement | undefined): el is OwnText => el?.type === "text" && el.text !== undefined;

/** The text element `elementId` of page `pageKey`, inside Testi groups and rows too. */
export function textElementAt(pages: readonly Page[], pageKey: string, elementId: string): TextElement | undefined {
  const page = pages.find((p) => p.pageKey === pageKey);
  if (page === undefined) return undefined;
  for (const block of page.blocks) {
    const el = findElement(block.elements, elementId);
    if (el !== undefined) return el.type === "text" ? el : undefined;
  }
  return undefined;
}

/**
 * `pages` with the own text `elementId` of page `pageKey` set to `text` (Story 4.3a):
 * a generated text becomes `human_edited`, any other keeps its provenance. The same
 * array when nothing changes (unknown element, a bound text, or the same words).
 */
export function withText(pages: readonly Page[], pageKey: string, elementId: string, text: string): readonly Page[] {
  const current = textElementAt(pages, pageKey, elementId);
  if (!isOwnText(current) || current.text === text) return pages;
  return pages.map((page) => {
    if (page.pageKey !== pageKey) return page;
    const copy = structuredClone(page);
    for (const block of copy.blocks) {
      const el = findElement(block.elements, elementId);
      if (el?.type === "text") {
        el.text = text;
        if (el.provenance === "generated") el.provenance = "human_edited";
      }
    }
    return copy;
  });
}
