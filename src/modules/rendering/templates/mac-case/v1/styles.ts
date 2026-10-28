import type { TextStyle } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";
import type { TextStyleSpec } from "@/modules/rendering/templates/types";

/**
 * mac-case v1: the seven text styles (C32, owner 2026-10-27), in px on each format's
 * Figma frame. Desktop sizes are Presentazione's; mobile sizes are Carosello's and
 * Video's. Colour, alignment and columns are settings of each text, not styles; a
 * template text whose Figma size differs from its style carries it in `size`.
 * Source: the `.t-*` rules of the configurator mockup.
 */
const em = (value: number) => ({ unit: "em", value }) as const;
const px = (value: number) => ({ unit: "px", value }) as const;

const DESKTOP: Readonly<Record<TextStyle, TextStyleSpec>> = Object.freeze({
  lab: { name: "Etichetta", size: 13, weight: 600, lineHeight: px(18), letterSpacing: 0, uppercase: true },
  xl: { name: "Titolo XL", size: 56, weight: 700, lineHeight: em(1.1), letterSpacing: -0.02, uppercase: false },
  title: { name: "Titolo", size: 26, weight: 600, lineHeight: em(1.2), letterSpacing: -0.02, uppercase: false },
  sub: { name: "Sottotitolo", size: 20, weight: 400, lineHeight: em(1.4), letterSpacing: 0, uppercase: false },
  text: { name: "Testo", size: 16, weight: 400, lineHeight: px(24), letterSpacing: 0, uppercase: false },
  num: { name: "Numero", size: 56, weight: 700, lineHeight: em(1.07), letterSpacing: 0, uppercase: false },
  quote: { name: "Citazione", size: 39, weight: 500, lineHeight: em(1.1), letterSpacing: -0.02, uppercase: false },
});

const MOBILE: Readonly<Record<TextStyle, TextStyleSpec>> = Object.freeze({
  lab: { ...DESKTOP.lab, size: 16 },
  xl: { ...DESKTOP.xl, size: 68 },
  title: { ...DESKTOP.title, size: 30 },
  sub: { ...DESKTOP.sub, size: 26, lineHeight: em(1.3), letterSpacing: -0.02 },
  text: { ...DESKTOP.text, size: 18, lineHeight: em(1.3) },
  num: { ...DESKTOP.num, size: 75, lineHeight: em(0.9) },
  quote: { ...DESKTOP.quote, size: 40 },
});

const BY_FORMAT: Readonly<Record<FormatId, Readonly<Record<TextStyle, TextStyleSpec>>>> = Object.freeze({
  presentazione_16_9: DESKTOP,
  carosello_1_1: MOBILE,
  video_9_16: MOBILE,
});

export const textStyles = (formatId: FormatId): Readonly<Record<TextStyle, TextStyleSpec>> => BY_FORMAT[formatId];
