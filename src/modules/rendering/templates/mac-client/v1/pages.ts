import type { Background, Binding, Block, DocumentElement, Page, RowElement, TextElement, TextGroupElement } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";
import { layoutOf } from "@/modules/rendering/templates/mac-case/v1/layouts";
import type { ClientTemplateTextKey, DefaultPage, TemplateContext } from "@/modules/rendering/templates/types";

/**
 * mac-client v1: a client's intro and outro pages per format (Story 3.11). A placeholder
 * (owner, 2026-11-06): the design team's cover and outro will ship as mac-client@2. It
 * lays its pages out on mac-case@1's layouts with its colours and text styles:
 *
 * - Intro (role `intro`): the "01 Cliente" block, with the client's name and sector bound
 *   and the intro's head and body, and the client's first three images.
 * - Risultati e testimonial (role `outro`): bound to the client's record, only when the
 *   client has result rows or a testimonial. Presentazione and Video open it with the
 *   outro's head and body.
 * - Carosello only: Chiusura, "Al prossimo progetto" with the outro's head and body.
 *
 * Client values are bindings (and its logo the `logos` element); fixed template copy and
 * the texts from the context are text with provenance `generated`.
 */

const WHITE = "#FFFFFF";
const GREY = "#EDEDF0";
const BLUE = "#2977FF";
const LIME = "#DEFE56";
const LINE = "#B0B0B1";
const MUTED = "#01223499";
const LABEL_ON_BLUE = "#FFFFFFA6";
const LABEL_ON_GREY = "#012234A6";

const colour = (value: string): Background => ({ kind: "colour", value });

/** A client's result rows are at most three. */
const MAX_ROWS = 3;
/** The intro shows the client's first three images. */
const INTRO_IMAGES = 3;

type TextOptions = Pick<TextElement, "colour" | "align" | "columns" | "size">;

/** The builders of one build: every block and element gets a fresh id from `ctx.newId`. */
function kit(ctx: TemplateContext) {
  const textOf = (key: ClientTemplateTextKey) => ctx.texts[key] ?? "";
  const clean = (o: TextOptions): TextOptions => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as TextOptions;
  const text = (style: TextElement["style"], words: string, o: TextOptions = {}): TextElement => ({
    elementId: ctx.newId(),
    type: "text",
    style,
    ...clean(o),
    text: words,
    provenance: "generated",
  });
  const bound = (style: TextElement["style"], binding: Binding, o: TextOptions = {}): TextElement => ({
    elementId: ctx.newId(),
    type: "text",
    style,
    ...clean(o),
    binding,
    provenance: "generated",
  });
  const group = (align: TextGroupElement["align"], items: TextElement[], splitAt?: number): TextGroupElement => ({
    elementId: ctx.newId(),
    type: "text_group",
    align,
    ...(splitAt === undefined ? {} : { splitAt }),
    items,
  });
  const row = (align: RowElement["align"], items: RowElement["items"]): RowElement => ({ elementId: ctx.newId(), type: "row", align, items });
  const logos = () => ({ elementId: ctx.newId(), type: "logos" as const });
  const divider = (lineColour: string): DocumentElement => ({ elementId: ctx.newId(), type: "divider", colour: lineColour });
  const image = (assetId: string | null): DocumentElement => ({ elementId: ctx.newId(), type: "image", assetId, fit: "fill" });
  const block = (name: string, elements: DocumentElement[], o: Partial<Pick<Block, "background" | "padding" | "paddingTop" | "ink">> = {}): Block => ({
    blockId: ctx.newId(),
    name,
    background: o.background ?? colour(GREY),
    ...(o.padding === undefined ? {} : { padding: o.padding }),
    ...(o.paddingTop === undefined ? {} : { paddingTop: o.paddingTop }),
    ...(o.ink === undefined ? {} : { ink: o.ink }),
    elements,
  });
  /** The i-th image of the client, or `null` (an empty block, exported transparent). */
  const imageAt = (i: number): string | null => ctx.images[i] ?? null;
  return { textOf, text, bound, group, row, logos, divider, image, block, imageAt };
}
type Kit = ReturnType<typeof kit>;

interface PageSpec {
  pageKey: string;
  name: string;
  role: Page["role"];
  section: Page["section"];
  background: string;
  margin: number;
  layoutId: string;
  decoration?: Page["decoration"];
  blocks: Block[];
}

const page = (formatId: FormatId, s: PageSpec): Page => {
  const { rows, cols, areas } = layoutOf(formatId, s.layoutId);
  if (areas.length !== s.blocks.length) throw new Error(`mac-client@1 ${formatId} ${s.pageKey}: ${s.blocks.length} blocks for ${s.layoutId}`);
  return {
    pageKey: s.pageKey,
    name: s.name,
    role: s.role,
    section: s.section,
    background: colour(s.background),
    grid: { layoutId: s.layoutId, rows: [...rows], cols: [...cols] },
    margin: s.margin,
    ...(s.decoration === undefined ? {} : { decoration: s.decoration }),
    blocks: s.blocks,
  };
};

// ---------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------

/** "01 Cliente": the client's name and sector with the logos, then the intro's head and body at the bottom. */
const clientBlock = (k: Kit, o: { padding: number; paddingTop?: number; nameSize?: number; bodySize?: number }): Block =>
  k.block(
    "Cliente",
    [
      k.row("centre", [
        k.group("top", [
          k.text("lab", "01 Cliente"),
          k.bound("xl", { record: "client", field: "name" }, { size: o.nameSize }),
          k.bound("sub", { record: "client", field: "sector" }, { colour: MUTED }),
        ]),
        k.logos(),
      ]),
      k.group("bottom", [k.text("title", k.textOf("introHead")), k.text("text", k.textOf("introBody"), { colour: MUTED, size: o.bodySize })]),
    ],
    { padding: o.padding, ...(o.paddingTop === undefined ? {} : { paddingTop: o.paddingTop }) },
  );

const imageBlocks = (k: Kit) => Array.from({ length: INTRO_IMAGES }, (_, i) => k.block("Immagine", [k.image(k.imageAt(i))]));

/** Presentazione Intro: the client's block, then its three images (the Contenuti grid). */
function presentazioneIntro(ctx: TemplateContext): Page[] {
  const k = kit(ctx);
  return [
    page("presentazione_16_9", {
      pageKey: "intro",
      name: "Intro",
      role: "intro",
      section: "intro",
      background: WHITE,
      margin: 40,
      layoutId: "content_3",
      blocks: [clientBlock(k, { padding: 28 }), ...imageBlocks(k)],
    }),
  ];
}

/** Carosello Intro: the client's cover, then its three images on their own slide. */
function caroselloIntro(ctx: TemplateContext): Page[] {
  const k = kit(ctx);
  return [
    page("carosello_1_1", {
      pageKey: "intro",
      name: "Copertina",
      role: "intro",
      section: "intro",
      background: WHITE,
      margin: 24,
      layoutId: "one",
      blocks: [clientBlock(k, { padding: 60, nameSize: 56, bodySize: 22 })],
    }),
    page("carosello_1_1", {
      pageKey: "intro-images",
      name: "Immagini",
      role: "intro",
      section: "intro",
      background: WHITE,
      margin: 24,
      layoutId: "three_a",
      blocks: imageBlocks(k),
    }),
  ];
}

/** Video Intro: the client's block above (room for Instagram's bar), an animation of its three images below. */
function videoIntro(ctx: TemplateContext): Page[] {
  const k = kit(ctx);
  return [
    page("video_9_16", {
      pageKey: "intro",
      name: "Intro",
      role: "intro",
      section: "intro",
      background: WHITE,
      margin: 24,
      layoutId: "intro",
      blocks: [
        clientBlock(k, { padding: 60, paddingTop: 220, nameSize: 56 }),
        k.block(
          "Animazione",
          [{ elementId: ctx.newId(), type: "animation", animation: "carousel_04", assetIds: ctx.images.slice(0, INTRO_IMAGES), fit: "fit", size: 105 }],
          { padding: 0 },
        ),
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Outro: Risultati e testimonial, and the Carosello closing page
// ---------------------------------------------------------------------------

interface OutroSizes {
  label?: number;
  rowLabel?: number;
  rowValue?: number;
  author?: number;
}

/** The outro's head and body (Presentazione and Video open Risultati e testimonial with it). */
const outroText = (k: Kit, o: { padding: number; paddingTop?: number }): Block =>
  k.block("Chiusura", [k.group("split", [k.text("lab", "Chiusura"), k.text("title", k.textOf("outroHead")), k.text("text", k.textOf("outroBody"), { colour: MUTED })], 1)], {
    padding: o.padding,
    ...(o.paddingTop === undefined ? {} : { paddingTop: o.paddingTop }),
  });

/** One row per client result: a line, then what it measures and the number in lime. */
function resultsBlock(k: Kit, rows: number, sizes: OutroSizes): Block {
  const resultRows = Array.from({ length: rows }, (_, index) => [
    k.divider(LINE),
    k.row("top", [
      k.bound("text", { record: "client", field: "resultLabel", index }, { size: sizes.rowLabel }),
      k.bound("num", { record: "client", field: "resultValue", index }, { colour: LIME, align: "right", size: sizes.rowValue }),
    ]),
  ]).flat();
  return k.block("Risultati", [k.group("top", [k.text("lab", "Risultati", { colour: LABEL_ON_BLUE, size: sizes.label })]), ...resultRows], {
    background: colour(BLUE),
    padding: 28,
    ink: WHITE,
  });
}

/** The client's testimonial (shown between « »), then who said it. */
const testimonialBlock = (k: Kit, sizes: OutroSizes): Block =>
  k.block(
    "Testimonianza",
    [
      k.group(
        "split",
        [
          k.text("lab", "Voce del cliente", { colour: LABEL_ON_GREY, size: sizes.label }),
          k.bound("quote", { record: "client", field: "testimonialQuote" }),
          k.bound("text", { record: "client", field: "testimonialAuthor" }, { colour: MUTED, size: sizes.author }),
        ],
        2,
      ),
    ],
    { padding: 28 },
  );

const rowsOf = (ctx: TemplateContext) => (Number.isFinite(ctx.resultRows) ? Math.max(0, Math.min(MAX_ROWS, Math.trunc(ctx.resultRows))) : 0);

/** Risultati e testimonial from the client's record; no page with neither results nor a testimonial. */
function results(formatId: FormatId) {
  return (ctx: TemplateContext): Page[] => {
    const rows = rowsOf(ctx);
    if (rows === 0 && !ctx.hasTestimonial) return [];
    const k = kit(ctx);
    const sizes: OutroSizes =
      formatId === "carosello_1_1" ? { label: 13, rowLabel: 16, author: 16 } : formatId === "video_9_16" ? { rowLabel: 30, rowValue: 120 } : {};
    const outro = [...(rows > 0 ? [resultsBlock(k, rows, sizes)] : []), ...(ctx.hasTestimonial ? [testimonialBlock(k, sizes)] : [])];
    const both = outro.length === 2;
    const spec = { pageKey: "results", name: "Risultati e testimonial", role: "outro", section: "risultati", background: WHITE } as const;
    if (formatId === "presentazione_16_9") {
      return [page(formatId, { ...spec, margin: 40, layoutId: both ? "results" : "content_1", blocks: [outroText(k, { padding: 28 }), ...outro] })];
    }
    if (formatId === "carosello_1_1") {
      return [page(formatId, { ...spec, margin: 24, layoutId: both ? "two" : "one", blocks: outro })];
    }
    return [page(formatId, { ...spec, margin: 24, layoutId: both ? "results" : "stack", blocks: [outroText(k, { padding: 60, paddingTop: 220 }), ...outro] })];
  };
}

/** Carosello Chiusura: "Al prossimo progetto", then the outro's head and body. */
function caroselloClosing(ctx: TemplateContext): Page[] {
  const k = kit(ctx);
  return [
    page("carosello_1_1", {
      pageKey: "closing",
      name: "Chiusura",
      role: "outro",
      section: "risultati",
      background: GREY,
      margin: 0,
      layoutId: "one",
      decoration: "star",
      blocks: [
        k.block(
          "Chiusura",
          [
            k.group("centre", [
              k.text("lab", "Al prossimo progetto", { align: "centre", size: 18 }),
              k.text("quote", k.textOf("outroHead"), { align: "centre" }),
              k.text("text", k.textOf("outroBody"), { align: "centre", colour: MUTED }),
            ]),
          ],
          { background: { kind: "transparent" }, padding: 92 },
        ),
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------

const BY_FORMAT: Readonly<Record<FormatId, readonly DefaultPage[]>> = Object.freeze({
  presentazione_16_9: Object.freeze([
    { key: "intro", name: "Intro", build: presentazioneIntro },
    { key: "results", name: "Risultati e testimonial", build: results("presentazione_16_9") },
  ]),
  carosello_1_1: Object.freeze([
    { key: "intro", name: "Intro", build: caroselloIntro },
    { key: "results", name: "Risultati e testimonial", build: results("carosello_1_1") },
    { key: "closing", name: "Chiusura", build: caroselloClosing },
  ]),
  video_9_16: Object.freeze([
    { key: "intro", name: "Intro", build: videoIntro },
    { key: "results", name: "Risultati e testimonial", build: results("video_9_16") },
  ]),
});

/** A format's default pages, in the configurator's order. */
export const defaultPages = (formatId: FormatId): readonly DefaultPage[] => BY_FORMAT[formatId];

/** A new client intro starts with every default page of its format, in order. */
export function starterPages(formatId: FormatId, ctx: TemplateContext): Page[] {
  return BY_FORMAT[formatId].flatMap((d) => d.build(ctx));
}
