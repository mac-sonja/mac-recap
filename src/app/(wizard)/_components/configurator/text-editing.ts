import type { Block, DocumentElement, Page, TextAlign, TextElement, TextGroupAlign, TextStyle } from "@/modules/generation";
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

/**
 * The text panel's colours (C32): the template's palette, then no colour. Template
 * output values, not tool UI tokens.
 */
export const TEXT_COLOURS = ["#ffffff", "#ededf0", "#012234", "#defe56", "#2977ff", "transparent"] as const;

/** A text's colour where none is set (the renderer's): the block's ink, else white on a photo, else the template's ink. */
export function shownColour(text: TextElement, block: Block): string {
  if (text.colour !== undefined) return text.colour;
  if (block.ink !== undefined) return block.ink;
  return block.background.kind === "image" ? "#ffffff" : "#012234";
}

/**
 * A typed colour, as stored: `#rrggbb` or `#rrggbbaa` (the `#` optional, any case) in
 * lower case, or `transparent` for "trasparente"; undefined for anything else.
 */
export function parseColour(typed: string): TextColour | undefined {
  const value = typed.trim().toLowerCase();
  if (value === "trasparente" || value === "transparent") return "transparent";
  const hex = value.startsWith("#") ? value.slice(1) : value;
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex) ? `#${hex}` : undefined;
}

export type TextColour = NonNullable<TextElement["colour"]>;

/** What the text panel sets. `align: "left"` and `columns: 1` are the defaults and remove the key. */
export type TextSettings = { style: TextStyle } | { align: TextAlign } | { colour: TextColour } | { columns: 1 | 2 };

/** Copies `pages`, applies `edit` to element `elementId` of page `pageKey`, and keeps `pages` when nothing changed. */
function withElement(pages: readonly Page[], pageKey: string, elementId: string, edit: (el: DocumentElement) => void): readonly Page[] {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return pages;
  const copy = structuredClone(pages[index]!);
  for (const block of copy.blocks) {
    const el = findElement(block.elements, elementId);
    if (el === undefined) continue;
    const before = JSON.stringify(el);
    edit(el);
    if (JSON.stringify(el) === before) return pages;
    return pages.map((p, i) => (i === index ? copy : p));
  }
  return pages;
}

/**
 * `pages` with the text `elementId` of page `pageKey` restyled (Story 4.3b): a new style
 * drops the template's own `size`, so the text takes the style's. The words, binding
 * and provenance never change. The same array when nothing changes.
 */
export function withTextSettings(pages: readonly Page[], pageKey: string, elementId: string, settings: TextSettings): readonly Page[] {
  return withElement(pages, pageKey, elementId, (el) => {
    if (el.type !== "text") return;
    if ("style" in settings) {
      if (el.style === settings.style) return;
      el.style = settings.style;
      delete el.size;
    } else if ("align" in settings) {
      // An explicit default ("left", 1 column) is already what shows: no change.
      if (settings.align === "left") {
        if (el.align !== "left") delete el.align;
      } else el.align = settings.align;
    } else if ("colour" in settings) {
      // The templates write some colours in upper case: the same colour is no change.
      if (el.colour?.toLowerCase() !== settings.colour) el.colour = settings.colour;
    } else if (settings.columns === 1) {
      if (el.columns !== 1) delete el.columns;
    } else {
      el.columns = settings.columns;
    }
  });
}

/**
 * `pages` with the Testi group `elementId` of page `pageKey` aligned in its block (C30):
 * `split` keeps its `splitAt`, or puts the first text on top; the others drop it.
 */
export function withGroupAlign(pages: readonly Page[], pageKey: string, elementId: string, align: TextGroupAlign): readonly Page[] {
  return withElement(pages, pageKey, elementId, (el) => {
    if (el.type !== "text_group" || el.align === align) return;
    el.align = align;
    if (align === "split") el.splitAt = 1;
    else delete el.splitAt;
  });
}
