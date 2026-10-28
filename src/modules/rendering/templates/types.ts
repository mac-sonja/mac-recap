import type { Page, TextStyle } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";

/**
 * The shapes every template version implements (Story 3.4). Kept outside the
 * version folders, which are immutable once published: a version's files may
 * import these, and a new field here must stay optional for older versions.
 */

/** A block's cell in its layout: `[rowStart, colStart, rowEnd, colEnd]`, 1-based, end exclusive. */
export type GridArea = readonly [rowStart: number, colStart: number, rowEnd: number, colEnd: number];

/** One layout grid of a format: track sizes (fractions of the Figma frame) and the cell of block i. */
export interface Layout {
  /** Stable within a template version: an id never moves or changes. */
  layoutId: string;
  /** As the configurator's Layout list shows it. */
  name: string;
  rows: readonly number[];
  cols: readonly number[];
  areas: readonly GridArea[];
}

/** The texts a default page is filled with (AI or test text); a missing one is `""`. */
export const TEMPLATE_TEXT_KEYS = [
  "title",
  "subtitle",
  "challengeHead",
  "challengeBody",
  "ideaHead",
  "ideaBody",
  "outputHead",
  "outputBody",
] as const;
export type TemplateTextKey = (typeof TEMPLATE_TEXT_KEYS)[number];

/** What a default page is built from. Client and case values are never here: they are bindings. */
export interface TemplateContext {
  /** A fresh uuid for each block and element. */
  newId: () => string;
  texts: Partial<Record<TemplateTextKey, string>>;
  /** The case's image asset ids, in order; a missing one leaves its image empty (`null`). */
  images: readonly string[];
  /** How many typed result rows the case has (0–3; Story 2.21). */
  resultRows: number;
  /** Whether the case has a testimonial. */
  hasTestimonial: boolean;
}

/** A template page that can be restored from Pagine di default, and how to build it. */
export interface DefaultPage {
  key: string;
  /** As the configurator's Pagine di default list shows it. */
  name: string;
  /** The page or pages (Carosello Intro: three); `[]` when there is nothing to show. */
  build: (ctx: TemplateContext) => Page[];
}

/** Size, weight and spacing of one of the seven text styles in one format, in px on the Figma frame. */
export interface TextStyleSpec {
  /** Italian name, as the configurator shows it. */
  name: string;
  size: number;
  weight: 400 | 500 | 600 | 700;
  /** A multiple of the size (`em`) or px on the frame. */
  lineHeight: { unit: "em" | "px"; value: number };
  /** In em. */
  letterSpacing: number;
  uppercase: boolean;
}

export interface TemplateVersion {
  /** `{id}@{version}`, as documents store it. */
  ref: string;
  layouts: (formatId: FormatId) => readonly Layout[];
  defaultPages: (formatId: FormatId) => readonly DefaultPage[];
  /** The default pages a new document starts with, in order (the v1 → v2 seam, Story 3.10's test draft). */
  starterPages: (formatId: FormatId, ctx: TemplateContext) => Page[];
  textStyles: (formatId: FormatId) => Readonly<Record<TextStyle, TextStyleSpec>>;
}
