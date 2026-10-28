// @vitest-environment happy-dom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageSchema, type Block, type DocumentElement, type Page } from "@/modules/generation";
import {
  CASE_TEMPLATE,
  FORMAT_IDS,
  layouts,
  measureOverflow,
  renderFormat,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  type BoundValues,
  type FormatId,
  type RenderAsset,
  type RenderInput,
  type TemplateContext,
} from "@/modules/rendering";

// Deterministic ids, so the markup is stable and snapshots compare.
const idFactory = (prefix: string) => {
  let n = 0;
  return () => `${prefix}-0000-4000-8000-${String(++n).padStart(12, "0")}`;
};

const IMAGES = Array.from({ length: 5 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const VIDEO_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const UNKNOWN_ID = "cccccccc-0000-4000-8000-000000000001";
const TEXTS = Object.fromEntries(TEMPLATE_TEXT_KEYS.map((key) => [key, `[${key}]`]));

const ctxOf = (o: Partial<TemplateContext> = {}): TemplateContext => ({
  newId: idFactory("dddddddd"),
  texts: TEXTS,
  images: IMAGES,
  resultRows: 3,
  hasTestimonial: true,
  ...o,
});

const ASSETS: Record<string, RenderAsset> = {
  ...Object.fromEntries(IMAGES.map((id, i) => [id, { url: `https://cdn.test/img-${i + 1}.webp`, kind: "image" as const }])),
  [VIDEO_ID]: { url: "https://cdn.test/clip.mp4", kind: "video", posterUrl: "https://cdn.test/clip-poster.webp" },
};

const VALUES: BoundValues = {
  client: {
    name: "Lumen S.r.l.",
    sector: "Illuminazione",
    description: "Lampade di design.",
    logoUrl: "https://cdn.test/lumen.svg",
    results: [],
    testimonial: null,
  },
  case: {
    year: 2026,
    services: ["Branding", "Web design"],
    results: [
      { label: "richieste dal sito", value: "+38%" },
      { label: "tempo sulle pagine", value: "3×" },
      { label: "prodotti fotografati", value: "120" },
    ],
    testimonial: { quote: "“Finalmente il sito racconta la luce.”", author: "Giulia R., Lumen" },
  },
};

const EMPTY_VALUES = { client: {}, case: {} } as unknown as BoundValues;

const inputOf = (pages: Page[], o: Partial<RenderInput> = {}): RenderInput => ({ pages, assets: ASSETS, values: VALUES, ...o });
const html = (formatId: FormatId, input: RenderInput) => renderToStaticMarkup(renderFormat(CASE_TEMPLATE, formatId, input));

/** The rendered markup as DOM, for queries. */
function dom(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
}

// A page built by hand: one block per test case, in the format's one-block layout.
const ids = idFactory("eeeeeeee");
const text = (o: Partial<Extract<DocumentElement, { type: "text" }>> = {}): Extract<DocumentElement, { type: "text" }> => ({
  elementId: ids(),
  type: "text",
  style: "text",
  provenance: "generated",
  ...(o.binding === undefined && o.bindings === undefined && o.text === undefined ? { text: "Testo" } : {}),
  ...o,
});
const block = (elements: DocumentElement[], o: Partial<Block> = {}): Block => ({
  blockId: ids(),
  name: "Blocco",
  background: { kind: "colour", value: "#EDEDF0" },
  elements,
  ...o,
});
const pageOf = (blocks: Block[], o: Partial<Page> = {}): Page => {
  const layout = { layoutId: "one", rows: [1], cols: [1] };
  return {
    pageKey: `p-${ids().slice(-4)}`,
    name: "Pagina",
    role: "body",
    section: "output",
    background: { kind: "colour", value: "#FFFFFF" },
    grid: layout,
    blocks,
    ...o,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("starter pages", () => {
  it.each(FORMAT_IDS)("%s: one page element per page, blocks in their layout's areas", (formatId) => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", formatId, ctxOf());
    const root = dom(html(formatId, inputOf(pages)));
    const sections = root.querySelectorAll<HTMLElement>("section.mr-page");
    expect(sections).toHaveLength(pages.length);
    pages.forEach((page, i) => {
      const section = sections[i];
      expect(section.dataset.pageKey).toBe(page.pageKey);
      expect(section.dataset.role).toBe(page.role);
      expect(section.dataset.section).toBe(page.section);
      expect(section.dataset.pageNumber).toBe(String(i + 1));
      const layout = layouts(formatId).find((l) => l.layoutId === page.grid.layoutId)!;
      const blocks = section.querySelectorAll<HTMLElement>("[data-block-id]");
      expect(blocks).toHaveLength(page.blocks.length);
      blocks.forEach((b, j) => {
        expect(b.dataset.blockId).toBe(page.blocks[j].blockId);
        const [r1, c1, r2, c2] = layout.areas[j];
        expect(b.getAttribute("style")).toContain(`grid-area:${r1} / ${c1} / ${r2} / ${c2}`);
      });
    });
  });

  it("reads the bound values: client, meta line, services, logos, results and the quote", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "presentazione_16_9", ctxOf());
    const markup = html("presentazione_16_9", inputOf(pages));
    expect(markup).toContain("Lumen S.r.l.");
    expect(markup).toContain("Illuminazione · 2026");
    expect(markup).toContain('<span class="mr-tag">Branding</span><span class="mr-tag">Web design</span>');
    expect(markup).toContain('src="https://cdn.test/lumen.svg"');
    expect(markup).toContain("+38%");
    expect(markup).toContain("prodotti fotografati");
    expect(markup).toContain("«Finalmente il sito racconta la luce.»");
    expect(markup).toContain("Giulia R., Lumen");
  });

  it("puts the Carosello closing page's star in, and the cover's photo behind a dark gradient", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "carosello_1_1", ctxOf());
    const root = dom(html("carosello_1_1", inputOf(pages)));
    expect(root.querySelector('[data-page-key="closing"] .mr-page-deco svg path')?.getAttribute("fill")).toBe("#DEFE56");
    const cover = root.querySelector('[data-page-key="intro"] .mr-blk')!;
    expect(cover.classList.contains("mr-on-photo")).toBe(true);
    expect(cover.querySelector(".mr-bgimg img")?.getAttribute("src")).toBe("https://cdn.test/img-1.webp");
  });

  it("uses the page margin, block padding and paddingTop in frame units", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "video_9_16", ctxOf());
    const root = dom(html("video_9_16", inputOf(pages)));
    const page = root.querySelector<HTMLElement>('[data-page-key="intro"]')!;
    expect(page.getAttribute("style")).toContain("--pad:calc(var(--u) * 24)");
    const info = page.querySelector<HTMLElement>(".mr-blk")!;
    expect(info.classList.contains("mr-vinfo")).toBe(true);
    expect(info.getAttribute("style")).toContain("padding-top:calc(var(--u) * 220)");
  });
});

describe("elements", () => {
  const everything = (): Page =>
    pageOf([
      block([
        text({ style: "xl", text: "Titolo", colour: "#01223499", align: "centre", columns: 2, size: 56 }),
        text({ binding: { record: "client", field: "name" } }),
        text({ bindings: [{ record: "client", field: "sector" }, { record: "case", field: "year" }] }),
        { elementId: ids(), type: "text_group", align: "top", items: [text({ text: "In alto" })] },
        { elementId: ids(), type: "text_group", align: "centre", items: [text({ text: "Al centro" })] },
        { elementId: ids(), type: "text_group", align: "bottom", items: [text({ text: "In basso" })] },
        { elementId: ids(), type: "text_group", align: "split", splitAt: 1, items: [text({ text: "Sopra" }), text({ text: "Sotto" })] },
        {
          elementId: ids(),
          type: "row",
          align: "top",
          wide: true,
          items: [text({ binding: { record: "case", field: "resultLabel", index: 0 } }), text({ style: "num", binding: { record: "case", field: "resultValue", index: 0 } })],
        },
        { elementId: ids(), type: "row", align: "centre", items: [{ elementId: ids(), type: "services" }, { elementId: ids(), type: "logos" }] },
        { elementId: ids(), type: "divider" },
        { elementId: ids(), type: "divider", colour: "#B0B0B1" },
        { elementId: ids(), type: "image", assetId: IMAGES[0], fit: "fill" },
        { elementId: ids(), type: "image", assetId: IMAGES[1], fit: "fit" },
        { elementId: ids(), type: "image", assetId: IMAGES[2], fit: "crop", crop: { x: 0.25, y: 0.75, zoom: 2 } },
        { elementId: ids(), type: "video", assetId: VIDEO_ID, fit: "fill" },
        { elementId: ids(), type: "animation", animation: "carousel_01", assetIds: IMAGES.slice(0, 2), fit: "fit" },
        { elementId: ids(), type: "animation", animation: "carousel_03", assetIds: IMAGES.slice(0, 3), fit: "fill", size: 50 },
        { elementId: ids(), type: "animation", animation: "carousel_04", assetIds: IMAGES.slice(0, 4), fit: "fit", size: 150 },
        { elementId: ids(), type: "animation", animation: "wheel_02", assetIds: IMAGES, fit: "fill" },
      ]),
    ]);

  it("the test page is a valid v2 page", () => {
    expect(pageSchema.safeParse(everything()).success).toBe(true);
  });

  it("draws every v2 element type", () => {
    const root = dom(html("carosello_1_1", inputOf([everything()])));
    const txt = root.querySelector<HTMLElement>(".mr-t-xl")!;
    expect(txt.className).toContain("mr-al-centre");
    expect(txt.className).toContain("mr-cols-2");
    expect(txt.getAttribute("style")).toContain("color:#01223499");
    expect(txt.getAttribute("style")).toContain("font-size:calc(var(--u) * 56)");
    expect(root.textContent).toContain("Lumen S.r.l.");
    expect(root.textContent).toContain("Illuminazione · 2026");
    for (const align of ["top", "centre", "bottom", "split"]) expect(root.querySelector(`.mr-grp-${align}`)).not.toBeNull();
    expect(root.querySelector(".mr-grp-split > .mr-push")?.textContent).toBe("Sopra");
    const kpi = root.querySelector(".mr-row.mr-kpirow")!;
    expect(kpi.classList.contains("mr-atop")).toBe(true);
    expect(kpi.classList.contains("mr-wide")).toBe(true);
    expect(kpi.querySelector(".mr-t-num")?.textContent).toBe("+38%");
    expect(root.querySelectorAll(".mr-tag")).toHaveLength(2);
    expect(root.querySelector(".mr-brand .mr-clogo")).not.toBeNull();
    expect(root.querySelector(".mr-brand svg.mr-mac")).not.toBeNull();
    expect(root.querySelector(".mr-hr:not(.mr-hr-colour)")).not.toBeNull();
    expect(root.querySelector(".mr-hr.mr-hr-colour")?.getAttribute("style")).toContain("#B0B0B1");
    expect(root.querySelector('.mr-img[data-fit="fill"] img')).not.toBeNull();
    expect(root.querySelector('.mr-img[data-fit="fit"] img')).not.toBeNull();
    const cropped = root.querySelector('.mr-img[data-fit="crop"] img')!.getAttribute("style")!;
    expect(cropped).toContain("object-position:25% 75%");
    expect(cropped).toContain("scale(2)");
    const video = root.querySelector(".mr-img video")!;
    expect(video.getAttribute("src")).toBe("https://cdn.test/clip.mp4");
    expect(video.getAttribute("poster")).toBe("https://cdn.test/clip-poster.webp");
    for (const kind of ["c01", "c03", "c04", "w02"]) expect(root.querySelector(`.mr-an-${kind}`)).not.toBeNull();
    expect(root.querySelector('[data-animation="carousel_03"]')?.getAttribute("style")).toContain("--as:0.5");
    expect(root.querySelector('[data-animation="carousel_04"]')?.getAttribute("style")).toContain("--as:1.5");
    // Carousel 04 with four cards: the cards, then the first again for a seamless loop.
    expect(root.querySelectorAll('[data-animation="carousel_04"] .mr-ac')).toHaveLength(5);
    expect(root.querySelector("style")?.textContent).toContain("@keyframes mr-s2x-4");
    expect(root.querySelector("style")?.textContent).toContain("@keyframes mr-s2y-3");
    expect(root.querySelector(".mr-ring")?.getAttribute("style")).toContain("mr-an-spin");
  });

  it("a block whose only element is a Riempi image ignores its padding", () => {
    const page = pageOf([block([{ elementId: ids(), type: "image", assetId: IMAGES[0], fit: "fill" }], { padding: 40 })]);
    const blk = dom(html("presentazione_16_9", inputOf([page]))).querySelector<HTMLElement>(".mr-blk")!;
    expect(blk.classList.contains("mr-bleed")).toBe(true);
    expect(blk.getAttribute("style") ?? "").not.toContain("padding");
  });

  it("styles come from the template: sizes per format, never tool tokens or Tailwind", () => {
    const desk = html("presentazione_16_9", inputOf([everything()]));
    const mobile = html("video_9_16", inputOf([everything()]));
    expect(desk).toContain(".mr-t-xl{font-size:calc(var(--u) * 56)");
    expect(mobile).toContain(".mr-t-xl{font-size:calc(var(--u) * 68)");
    expect(desk).toContain("--u:calc(100cqw / 1920)");
    expect(desk).not.toMatch(/var\(--(fg|bg|accent|border|fill|raised)/);
    const classes = Array.from(dom(desk).querySelectorAll("[class]")).flatMap((el) => Array.from(el.classList));
    expect(classes.every((c) => c.startsWith("mr-"))).toBe(true);
  });
});

describe("I/O matrix", () => {
  it("missing asset: an empty, transparent media cell and no <img> with an empty src", () => {
    const page = pageOf([
      block([
        { elementId: ids(), type: "image", assetId: null, fit: "fill" },
        { elementId: ids(), type: "image", assetId: UNKNOWN_ID, fit: "fit" },
      ]),
      block([], { background: { kind: "image", assetId: UNKNOWN_ID } }),
    ]);
    const markup = html("carosello_1_1", inputOf([page]));
    const root = dom(markup);
    const cells = root.querySelectorAll(".mr-img");
    expect(cells).toHaveLength(2);
    cells.forEach((cell) => {
      expect(cell.hasAttribute("data-empty")).toBe(true);
      expect(cell.querySelector("img,video")).toBeNull();
    });
    expect(root.querySelector(".mr-bgimg")).toBeNull();
    expect(markup).not.toMatch(/src=""/);
  });

  it("missing value: empty text, no crash", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "presentazione_16_9", ctxOf());
    const root = dom(html("presentazione_16_9", inputOf(pages, { values: EMPTY_VALUES })));
    expect(root.querySelector(".mr-clogo")).toBeNull();
    const bound = root.querySelectorAll('[data-page-key="results"] .mr-kpirow .mr-txt');
    expect(bound.length).toBeGreaterThan(0);
    bound.forEach((t) => expect(t.textContent).toBe(""));
  });

  it("no animation media: three empty 9:16 cards", () => {
    const page = pageOf([block([{ elementId: ids(), type: "animation", animation: "carousel_04", assetIds: [], fit: "fit" }])]);
    const root = dom(html("video_9_16", inputOf([page])));
    const cards = root.querySelectorAll(".mr-ac:not(.mr-ac-copy)");
    expect(cards).toHaveLength(3);
    cards.forEach((c) => expect(c.children).toHaveLength(0));
  });

  it("still: a video shows its poster, no animation on tracks or texts", () => {
    const page = pageOf([
      block([
        text({ text: "Uno" }),
        { elementId: ids(), type: "video", assetId: VIDEO_ID, fit: "fill" },
        { elementId: ids(), type: "animation", animation: "carousel_03", assetIds: [IMAGES[0], VIDEO_ID], fit: "fit" },
        { elementId: ids(), type: "animation", animation: "wheel_02", assetIds: IMAGES, fit: "fit" },
      ]),
    ]);
    const markup = html("video_9_16", inputOf([page], { options: { still: true } }));
    const root = dom(markup);
    expect(root.querySelector("video")).toBeNull();
    expect(root.querySelector(".mr-img img")?.getAttribute("src")).toBe("https://cdn.test/clip-poster.webp");
    expect(root.querySelectorAll('.mr-ac img[src="https://cdn.test/clip-poster.webp"]').length).toBeGreaterThan(0);
    root.querySelectorAll(".mr-trk,.mr-ring").forEach((t) => expect(t.getAttribute("style") ?? "").not.toContain("animation"));
    expect(root.querySelector(".mr-vin")).toBeNull();
    expect(root.querySelector("style")?.textContent).not.toContain("@keyframes mr-s2");
  });

  it("Video: texts animate in sequence by default; off with animateTexts false; never in other formats", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "video_9_16", ctxOf());
    const on = dom(html("video_9_16", inputOf(pages)));
    const vin = Array.from(on.querySelector('[data-page-key="intro"]')!.querySelectorAll<HTMLElement>(".mr-vin"));
    expect(vin.length).toBeGreaterThan(3);
    expect(vin.map((el) => el.style.getPropertyValue("--i"))).toEqual(vin.map((_, i) => String(i)));
    expect(dom(html("video_9_16", inputOf(pages, { options: { animateTexts: false } }))).querySelector(".mr-vin")).toBeNull();
    const caro = starterPages(CASE_TEMPLATE, "case_history", "carosello_1_1", ctxOf());
    expect(dom(html("carosello_1_1", inputOf(caro))).querySelector(".mr-vin")).toBeNull();
  });

  it("reduced motion stops every animation", () => {
    const css = dom(html("video_9_16", inputOf([]))).querySelector("style")!.textContent!;
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.mr-vin{animation:none}.mr-an *{animation:none!important}}");
  });

  it("page numbers start at startPage", () => {
    const pages = [pageOf([]), pageOf([]), pageOf([])];
    const root = dom(html("presentazione_16_9", inputOf(pages, { options: { startPage: 7 } })));
    expect(Array.from(root.querySelectorAll<HTMLElement>("[data-page-key]")).map((p) => p.dataset.pageNumber)).toEqual(["7", "8", "9"]);
  });

  it("an unknown layout, or fewer areas than blocks, puts the blocks in an even one-column grid", () => {
    const unknown = pageOf([block([text()]), block([text()])], { grid: { layoutId: "nope", rows: [1], cols: [1] } });
    const tooMany = pageOf([block([text()]), block([text()]), block([text()])]);
    const root = dom(html("carosello_1_1", inputOf([unknown, tooMany])));
    const grids = root.querySelectorAll<HTMLElement>(".mr-bento");
    expect(grids[0].getAttribute("style")).toContain("repeat(2,minmax(0,1fr)) / minmax(0,1fr)");
    expect(grids[1].getAttribute("style")).toContain("repeat(3,minmax(0,1fr)) / minmax(0,1fr)");
    root.querySelectorAll(".mr-blk").forEach((b) => expect(b.getAttribute("style") ?? "").not.toContain("grid-area"));
  });

  it("overflow: a block whose content is taller than it, and its page", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "carosello_1_1", ctxOf());
    const root = dom(html("carosello_1_1", inputOf(pages)));
    document.body.appendChild(root);
    const tall = root.querySelector<HTMLElement>('[data-page-key="intro-sfida"] [data-block-id]')!;
    Object.defineProperty(tall, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(tall, "clientHeight", { configurable: true, value: 400 });
    const report = measureOverflow(root);
    expect(report.pages.map((p) => p.pageKey)).toEqual(pages.map((p) => p.pageKey));
    for (const page of report.pages) {
      expect(page.overflow).toBe(page.pageKey === "intro-sfida");
      for (const b of page.blocks) expect(b.overflow).toBe(b.blockId === tall.dataset.blockId);
    }
    expect(report.pages.find((p) => p.pageKey === "intro-sfida")!.blocks).toHaveLength(1);
    root.remove();
  });

  it("SSR: renderToString output hydrates without a mismatch", async () => {
    for (const formatId of FORMAT_IDS) {
      const pages = starterPages(CASE_TEMPLATE, "case_history", formatId, ctxOf());
      const all = [...pages, pageOf([block([{ elementId: ids(), type: "video", assetId: VIDEO_ID, fit: "crop", crop: { x: 0.5, y: 0.5, zoom: 1.5 } }])])];
      for (const options of [{}, { still: true }, { animateTexts: false, startPage: 4 }]) {
        const input = inputOf(all, { options });
        const container = document.createElement("div");
        container.innerHTML = renderToString(renderFormat(CASE_TEMPLATE, formatId, input));
        document.body.appendChild(container);
        const errors: unknown[] = [];
        const consoleError = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => {
          root = hydrateRoot(container, renderFormat(CASE_TEMPLATE, formatId, input), {
            onRecoverableError: (error) => errors.push(error),
          });
        });
        expect(errors, `${formatId} ${JSON.stringify(options)}`).toEqual([]);
        await act(async () => root?.unmount());
        consoleError.mockRestore();
        container.remove();
      }
    }
  });
});

describe("review follow-ups", () => {
  it("each format's text styles are scoped to its pages, so two formats can share a document", () => {
    const root = dom(html("presentazione_16_9", inputOf([])) + html("video_9_16", inputOf([])));
    const [desk, video] = Array.from(root.querySelectorAll("style")).map((st) => st.textContent!);
    const rules = (css: string) => css.split("\n").filter((line) => /\.mr-t-(lab|xl|title|sub|text|num|quote)\{font-size/.test(line));
    expect(rules(desk)).toHaveLength(7);
    expect(rules(video)).toHaveLength(7);
    for (const line of rules(desk)) expect(line.startsWith(':where(.mr-page[data-format="presentazione_16_9"]) .mr-t-')).toBe(true);
    for (const line of rules(video)) expect(line.startsWith(':where(.mr-page[data-format="video_9_16"]) .mr-t-')).toBe(true);
    expect(desk).toContain(':where(.mr-page[data-format="presentazione_16_9"]) .mr-t-xl{font-size:calc(var(--u) * 56)');
    expect(video).toContain(':where(.mr-page[data-format="video_9_16"]) .mr-t-xl{font-size:calc(var(--u) * 68)');
  });

  it("client-record bindings read the client's values, not the case's", () => {
    const values: BoundValues = {
      ...VALUES,
      client: { ...VALUES.client, results: [{ label: "clienti nuovi", value: "+52%" }], testimonial: { quote: "Ci conoscono come pochi.", author: "Paolo L." } },
    };
    const page = pageOf([
      block([
        text({ binding: { record: "client", field: "resultLabel", index: 0 } }),
        text({ style: "num", binding: { record: "client", field: "resultValue", index: 0 } }),
        text({ style: "quote", binding: { record: "client", field: "testimonialQuote" } }),
        text({ binding: { record: "client", field: "testimonialAuthor" } }),
      ]),
    ]);
    const texts = Array.from(dom(html("carosello_1_1", inputOf([page], { values }))).querySelectorAll(".mr-txt")).map((t) => t.textContent);
    expect(texts).toEqual(["clienti nuovi", "+52%", "«Ci conoscono come pochi.»", "Paolo L."]);
  });

  it("still: a video without a poster is missing — no <img>, no src=\"\", no photo styling, an empty cell", () => {
    const NO_POSTER = "bbbbbbbb-0000-4000-8000-000000000002";
    const assets = { ...ASSETS, [NO_POSTER]: { url: "https://cdn.test/raw.mp4", kind: "video" as const } };
    const page = pageOf(
      [block([text(), { elementId: ids(), type: "video", assetId: NO_POSTER, fit: "fit" }], { background: { kind: "image", assetId: NO_POSTER } })],
      { background: { kind: "image", assetId: NO_POSTER } },
    );
    const markup = html("carosello_1_1", inputOf([page], { assets, options: { still: true } }));
    const root = dom(markup);
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("video")).toBeNull();
    expect(markup).not.toMatch(/src=""/);
    expect(root.querySelector(".mr-on-photo,.mr-bgimg,.mr-page-bg")).toBeNull();
    expect(root.querySelector(".mr-img")?.hasAttribute("data-empty")).toBe(true);
  });

  it("a lone Riempi video goes edge to edge too", () => {
    const page = pageOf([block([{ elementId: ids(), type: "video", assetId: VIDEO_ID, fit: "fill" }], { padding: 40 })]);
    const blk = dom(html("carosello_1_1", inputOf([page]))).querySelector(".mr-blk")!;
    expect(blk.classList.contains("mr-bleed")).toBe(true);
    expect(blk.getAttribute("style") ?? "").not.toContain("padding");
  });

  it("Video info spacing only with a positive paddingTop", () => {
    const page = pageOf([block([text()], { paddingTop: 0 })]);
    expect(dom(html("video_9_16", inputOf([page]))).querySelector(".mr-vinfo")).toBeNull();
  });

  it("Wheel 02 with one card doesn't spin (it moves only when the carousels do)", () => {
    for (const assetIds of [[IMAGES[0]]]) {
      const page = pageOf([block([{ elementId: ids(), type: "animation", animation: "wheel_02", assetIds, fit: "fit" }])]);
      expect(dom(html("video_9_16", inputOf([page]))).querySelector(".mr-ring")?.getAttribute("style") ?? "").not.toContain("animation");
    }
  });

  it("the meta line leaves empty values out", () => {
    const meta = () => pageOf([block([text({ bindings: [{ record: "client", field: "sector" }, { record: "case", field: "year" }] })])]);
    const noYear = { ...VALUES, case: { ...VALUES.case, year: null } };
    expect(dom(html("carosello_1_1", inputOf([meta()], { values: noYear }))).querySelector(".mr-txt")?.textContent).toBe("Illuminazione");
    const neither = { client: { ...VALUES.client, sector: "" }, case: { ...VALUES.case, year: null } };
    expect(dom(html("carosello_1_1", inputOf([meta()], { values: neither }))).querySelector(".mr-txt")?.textContent).toBe("");
  });

  it("overflow: only blocks count; a page's own clipped decoration doesn't; width counts", () => {
    const pages = starterPages(CASE_TEMPLATE, "case_history", "carosello_1_1", ctxOf());
    const root = dom(html("carosello_1_1", inputOf(pages)));
    document.body.appendChild(root);
    const closing = root.querySelector<HTMLElement>('[data-page-key="closing"]')!;
    Object.defineProperty(closing, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(closing, "clientHeight", { configurable: true, value: 1000 });
    const wide = root.querySelector<HTMLElement>('[data-page-key="intro-idea"] [data-block-id]')!;
    Object.defineProperty(wide, "scrollWidth", { configurable: true, value: 900 });
    Object.defineProperty(wide, "clientWidth", { configurable: true, value: 400 });
    const report = measureOverflow(root);
    expect(report.pages.find((p) => p.pageKey === "closing")!.overflow).toBe(false);
    expect(report.pages.find((p) => p.pageKey === "intro-idea")!.overflow).toBe(true);
    // A page element passed as the root is measured too.
    expect(measureOverflow(closing).pages.map((p) => p.pageKey)).toEqual(["closing"]);
    root.remove();
  });
});

describe("renderToStaticMarkup", () => {
  it.each(FORMAT_IDS)("%s: the starter pages render the same markup every time (snapshot)", (formatId) => {
    const render = () => html(formatId, inputOf(starterPages(CASE_TEMPLATE, "case_history", formatId, ctxOf())));
    const first = render();
    expect(render()).toBe(first);
    expect(first).toMatchSnapshot();
  });

  it("throws for a template that isn't registered", () => {
    expect(() => renderFormat("nope@1", "video_9_16", inputOf([]))).toThrow(/nope@1/);
  });
});
