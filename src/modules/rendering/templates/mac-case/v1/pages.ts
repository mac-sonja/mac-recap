import type { Background, Binding, Block, DocumentElement, Page, RowElement, TextElement, TextGroupElement } from "@/modules/generation";
import type { FormatId } from "@/modules/rendering/domain/formats";
import { layoutOf } from "@/modules/rendering/templates/mac-case/v1/layouts";
import type { DefaultPage, TemplateContext, TemplateTextKey } from "@/modules/rendering/templates/types";

/**
 * mac-case v1: each format's default pages, from the Figma frames "MAC-TF-AI" as the
 * configurator mockup reproduces them (`applyIntro`, `DEFAULT_PAGES`, `applyOutro`,
 * `closingPage`). A builder lays out the template page and fills it from the context:
 * texts, images in order, how many result rows the case has and whether it has a
 * testimonial. Client name, sector, case year, result rows and the testimonial are
 * bindings; services and logos are their elements; fixed template copy is text with
 * provenance `generated`. Sizes, margins and paddings are px on the Figma frame.
 * The template's spacers become Testi group alignment (a top group grows and pushes
 * what follows it to the bottom of the block).
 */

// Colours of the template.
const WHITE = "#FFFFFF";
const GREY = "#EDEDF0";
const BLUE = "#2977FF";
const LIME = "#DEFE56";
const LINE = "#B0B0B1";
/** Muted text (`rgb(1 34 52 / .6)`). */
const MUTED = "#01223499";
/** A label on blue (`rgb(255 255 255 / .65)`) and on grey (`rgb(1 34 52 / .65)`). */
const LABEL_ON_BLUE = "#FFFFFFA6";
const LABEL_ON_GREY = "#012234A6";
/** On a photo: labels and muted text (`rgb(255 255 255 / .65)` and `/ .75`). */
const LABEL_ON_PHOTO = "#FFFFFFA6";
const MUTED_ON_PHOTO = "#FFFFFFBF";

const colour = (value: string): Background => ({ kind: "colour", value });

/** The case's result rows (Story 2.21) are at most three. */
const MAX_ROWS = 3;
/** Video Intro: the animation shows at most five images. */
const MAX_ANIMATION_IMAGES = 5;

type TextOptions = Pick<TextElement, "colour" | "align" | "columns" | "size">;

/** The builders of one build: every block and element gets a fresh id from `ctx.newId`. */
function kit(ctx: TemplateContext) {
  const textOf = (key: TemplateTextKey) => ctx.texts[key] ?? "";
  const clean = (o: TextOptions): TextOptions => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as TextOptions;

  /** Words of its own: fixed template copy or a text from the context. */
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
  /** The meta line: the client's sector and the case's year, joined by " · ". */
  const meta = (o: TextOptions = {}): TextElement => ({
    elementId: ctx.newId(),
    type: "text",
    style: "text",
    ...clean(o),
    bindings: [
      { record: "client", field: "sector" },
      { record: "case", field: "year" },
    ],
    provenance: "generated",
  });
  const group = (align: TextGroupElement["align"], items: TextElement[], splitAt?: number): TextGroupElement => ({
    elementId: ctx.newId(),
    type: "text_group",
    align,
    ...(splitAt === undefined ? {} : { splitAt }),
    items,
  });
  const row = (align: RowElement["align"], items: RowElement["items"], wide = false): RowElement => ({
    elementId: ctx.newId(),
    type: "row",
    align,
    ...(wide ? { wide } : {}),
    items,
  });
  const logos = () => ({ elementId: ctx.newId(), type: "logos" as const });
  const services = () => ({ elementId: ctx.newId(), type: "services" as const });
  const divider = (lineColour?: string): DocumentElement => ({
    elementId: ctx.newId(),
    type: "divider",
    ...(lineColour === undefined ? {} : { colour: lineColour }),
  });
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
  /** The i-th image of the case, or `null` (an empty block, exported transparent). */
  const imageAt = (i: number): string | null => ctx.images[i] ?? null;
  return { textOf, text, bound, meta, group, row, logos, services, divider, image, block, imageAt };
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
  // Every template page fills its layout exactly (tested); this guards a template bug.
  if (areas.length !== s.blocks.length) throw new Error(`mac-case@1 ${formatId} ${s.pageKey}: ${s.blocks.length} blocks for ${s.layoutId}`);
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

/**
 * The project block with the case's first image behind it. On a photo the ink turns
 * white and labels and muted text get their on-photo colours; with no image the block
 * stays grey.
 */
function photoBlock(k: Kit, elements: (onPhoto: boolean) => DocumentElement[], padding: number): Block {
  const assetId = k.imageAt(0);
  const onPhoto = assetId !== null;
  return k.block("Progetto", elements(onPhoto), {
    background: onPhoto ? { kind: "image", assetId } : colour(GREY),
    padding,
    ...(onPhoto ? { ink: WHITE } : {}),
  });
}

/** The client's name and the meta line, the logos at the end (Carosello and Video). */
const head = (k: Kit) => k.row("centre", [k.group("top", [k.meta({ size: 16 }), k.bound("title", { record: "client", field: "name" })]), k.logos()]);
/** "Servizi" and the case's services as tags. */
const servicesRow = (k: Kit, labelColour?: string) => k.row("top", [k.text("lab", "Servizi", { colour: labelColour }), k.services()]);

/** Video: the project's info, at the top of the Intro and of Risultati e testimonial (room for Instagram's bar). */
const videoInfo = (k: Kit): Block =>
  k.block(
    "Progetto",
    [head(k), k.text("xl", k.textOf("title"), { size: 56 }), k.text("sub", k.textOf("subtitle"), { colour: MUTED }), k.divider(), servicesRow(k)],
    { padding: 60, paddingTop: 220 },
  );

// ---------------------------------------------------------------------------
// Intro
// ---------------------------------------------------------------------------

const intro = (k: Kit, label: string, head: TemplateTextKey, body: TemplateTextKey) =>
  k.group("split", [k.text("lab", label), k.text("title", k.textOf(head)), k.text("text", k.textOf(body), { colour: MUTED })], 1);

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
      layoutId: "intro",
      blocks: [
        photoBlock(
          k,
          (onPhoto) => [
            k.group(
              "split",
              [
                k.text("lab", "01 Progetto", { colour: onPhoto ? LABEL_ON_PHOTO : undefined }),
                k.text("xl", k.textOf("title")),
                k.text("sub", k.textOf("subtitle"), { colour: onPhoto ? MUTED_ON_PHOTO : MUTED }),
              ],
              1,
            ),
          ],
          28,
        ),
        k.block(
          "Cliente",
          [k.row("centre", [k.group("top", [k.text("lab", "02 Cliente"), k.bound("title", { record: "client", field: "name" }), k.meta()]), k.logos()], true)],
          { padding: 28 },
        ),
        k.block("Servizi", [k.group("top", [k.text("lab", "03 Servizi")]), k.services()], { padding: 28 }),
        k.block("Sfida", [intro(k, "04 Sfida", "challengeHead", "challengeBody")], { padding: 28 }),
        k.block("Idea", [intro(k, "05 Idea", "ideaHead", "ideaBody")], { padding: 28 }),
      ],
    }),
  ];
}

const caroselloSfida = (k: Kit, pageKey: string): Page =>
  page("carosello_1_1", {
    pageKey,
    name: "Sfida",
    role: "intro",
    section: "intro",
    background: WHITE,
    margin: 24,
    layoutId: "one",
    blocks: [
      k.block(
        "Sfida",
        [k.group("split", [k.text("lab", "Sfida", { size: 18 }), k.text("xl", k.textOf("challengeHead")), k.text("sub", k.textOf("challengeBody"), { colour: MUTED, size: 22 })], 1)],
        { padding: 40 },
      ),
    ],
  });

const caroselloIdea = (k: Kit, pageKey: string): Page =>
  page("carosello_1_1", {
    pageKey,
    name: "Idea",
    role: "intro",
    section: "intro",
    background: WHITE,
    margin: 24,
    layoutId: "one",
    blocks: [
      k.block(
        "Idea",
        [k.group("split", [k.text("lab", "Idea", { size: 18 }), k.text("xl", k.textOf("ideaHead")), k.text("text", k.textOf("ideaBody"), { colour: MUTED, columns: 2 })], 1)],
        { padding: 40 },
      ),
    ],
  });

/** Carosello Intro: the cover, then Sfida and Idea, each its own slide. */
function caroselloIntro(ctx: TemplateContext): Page[] {
  const k = kit(ctx);
  const cover = page("carosello_1_1", {
    pageKey: "intro",
    name: "Copertina",
    role: "intro",
    section: "intro",
    background: GREY,
    margin: 24,
    layoutId: "one",
    blocks: [
      photoBlock(
        k,
        (onPhoto) => [
          head(k),
          k.group("bottom", [k.text("xl", k.textOf("title"), { size: 56 }), k.text("sub", k.textOf("subtitle"), { colour: onPhoto ? MUTED_ON_PHOTO : MUTED })]),
          k.divider(),
          servicesRow(k, onPhoto ? LABEL_ON_PHOTO : undefined),
        ],
        60,
      ),
    ],
  });
  return [cover, caroselloSfida(k, "intro-sfida"), caroselloIdea(k, "intro-idea")];
}

/** Video Intro: the info above, an animation of the case's images below (cards at 105 %). */
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
        videoInfo(k),
        k.block(
          "Animazione",
          [
            {
              elementId: ctx.newId(),
              type: "animation",
              animation: "carousel_04",
              assetIds: ctx.images.slice(0, MAX_ANIMATION_IMAGES),
              fit: "fit",
              size: 105,
            },
          ],
          { padding: 0 },
        ),
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Contenuti (Presentazione): 1, 3 or 5 images and the output's text block
// ---------------------------------------------------------------------------

function presentazioneContent(pageKey: string, layoutId: string, images: number) {
  return (ctx: TemplateContext): Page[] => {
    const k = kit(ctx);
    return [
      page("presentazione_16_9", {
        pageKey,
        name: "Contenuti",
        role: "body",
        section: "output",
        background: WHITE,
        margin: 40,
        layoutId,
        blocks: [
          ...Array.from({ length: images }, (_, i) => k.block("Immagine", [k.image(k.imageAt(i))])),
          k.block("Testo", [intro(k, "06 Deliverable — Output", "outputHead", "outputBody")], { padding: 28 }),
        ],
      }),
    ];
  };
}

// ---------------------------------------------------------------------------
// Risultati e testimonial, and the Carosello closing page
// ---------------------------------------------------------------------------

interface OutroSizes {
  /** The section labels' Figma size, where it differs from the style's. */
  label?: number;
  /** A result's label and number. */
  rowLabel?: number;
  rowValue?: number;
  author?: number;
}

/** One row per result: a line, then what it measures and the number in lime. */
function resultsBlock(k: Kit, rows: number, sizes: OutroSizes): Block {
  const resultRows = Array.from({ length: rows }, (_, index) => [
    k.divider(LINE),
    k.row("top", [
      k.bound("text", { record: "case", field: "resultLabel", index }, { size: sizes.rowLabel }),
      k.bound("num", { record: "case", field: "resultValue", index }, { colour: LIME, align: "right", size: sizes.rowValue }),
    ]),
  ]).flat();
  return k.block("Risultati", [k.group("top", [k.text("lab", "06 — Risultati", { colour: LABEL_ON_BLUE, size: sizes.label })]), ...resultRows], {
    background: colour(BLUE),
    padding: 28,
    ink: WHITE,
  });
}

/** The client's words (shown between « »), then who said them. */
const testimonialBlock = (k: Kit, sizes: OutroSizes): Block =>
  k.block(
    "Testimonianza",
    [
      k.group(
        "split",
        [
          k.text("lab", "08 — Voce del cliente", { colour: LABEL_ON_GREY, size: sizes.label }),
          k.bound("quote", { record: "case", field: "testimonialQuote" }),
          k.bound("text", { record: "case", field: "testimonialAuthor" }, { colour: MUTED, size: sizes.author }),
        ],
        2,
      ),
    ],
    { padding: 28 },
  );

const rowsOf = (ctx: TemplateContext) => (Number.isFinite(ctx.resultRows) ? Math.max(0, Math.min(MAX_ROWS, Math.trunc(ctx.resultRows))) : 0);

/**
 * Risultati e testimonial. Results only with result rows, the testimonial only with a
 * testimonial, and no page with neither. Presentazione adds an image first; Carosello
 * puts the blocks side by side (as the mockup's `applyOutro` does); Video starts with
 * the Intro's info block. With one of the two blocks the page takes the format's
 * layout for its block count.
 */
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
      return [
        page(formatId, {
          ...spec,
          margin: 40,
          layoutId: both ? "results" : "content_1",
          // The visual: the first image that isn't the Intro's.
          blocks: [k.block("Visual", [k.image(k.imageAt(1))]), ...outro],
        }),
      ];
    }
    if (formatId === "carosello_1_1") {
      return [page(formatId, { ...spec, margin: 24, layoutId: both ? "two" : "one", blocks: outro })];
    }
    return [page(formatId, { ...spec, margin: 24, layoutId: both ? "results" : "stack", blocks: [videoInfo(k), ...outro] })];
  };
}

/** Carosello Chiusura: the same for every carousel, its text editable per carousel. */
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
              k.text("quote", "Non perderti i nostri progetti, continua a seguirci per scoprire tutte le novità che stiamo costruendo per voi", {
                align: "centre",
              }),
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
    { key: "content_1", name: "1 immagine", build: presentazioneContent("content-1", "content_1", 1) },
    { key: "content_3", name: "3 immagini", build: presentazioneContent("content", "content_3", 3) },
    { key: "content_5", name: "5 immagini", build: presentazioneContent("content-5", "content_5", 5) },
    { key: "results", name: "Risultati e testimonial", build: results("presentazione_16_9") },
  ]),
  carosello_1_1: Object.freeze([
    { key: "intro", name: "Intro", build: caroselloIntro },
    { key: "sfida", name: "Sfida", build: (ctx: TemplateContext) => [caroselloSfida(kit(ctx), "sfida")] },
    { key: "idea", name: "Idea", build: (ctx: TemplateContext) => [caroselloIdea(kit(ctx), "idea")] },
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

/** The default pages a new document starts with (by `DefaultPage.key`), in order. */
const STARTER_KEYS: Readonly<Record<FormatId, readonly string[]>> = Object.freeze({
  presentazione_16_9: ["intro", "content_3", "results"],
  carosello_1_1: ["intro", "results", "closing"],
  video_9_16: ["intro", "results"],
});

export function starterPages(formatId: FormatId, ctx: TemplateContext): Page[] {
  return STARTER_KEYS[formatId].flatMap((key) => {
    const found = BY_FORMAT[formatId].find((d) => d.key === key);
    if (found === undefined) throw new Error(`mac-case@1 has no default page ${key} in ${formatId}`);
    return found.build(ctx);
  });
}
