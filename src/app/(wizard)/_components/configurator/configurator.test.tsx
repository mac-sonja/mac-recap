// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORMAT_IDS, layouts, starterPages, type BoundValues, type FormatId } from "@/modules/rendering";
import {
  buildTestDraft,
  caseHistoryV2,
  testDraftTexts,
  validateNewDocument,
  type DocumentElement,
  type Page,
  type TextElement,
  type TextGroupElement,
} from "@/modules/generation";
import { fill, it as dict } from "@/shared/i18n/it";
import type { ListedAsset } from "@/modules/material";
import { Configurator, type ConfiguratorProps } from "./configurator";
import type { MediaUploadRules } from "./media-files";
import { generatedTextsOf, type GeneratedTexts } from "./default-pages";
import { ownTextIds } from "./in-place-text";
import { STATUS_MESSAGE_MS } from "./status-message";
import { BACKGROUND_SWATCHES, NEW_BLOCK_COLOUR } from "./page-editing";
import { TEXT_COLOURS, textElementAt } from "./text-editing";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The Media tab's server actions (Story 4.5a).
const actions = vi.hoisted(() => ({
  listAssets: vi.fn(),
  presignAssetUpload: vi.fn(),
  confirmAssetUpload: vi.fn(),
  setAssetFavourite: vi.fn(),
}));
vi.mock("@/app/(tool)/case-studies/actions", () => actions);
const uploads = vi.hoisted(() => ({ uploadFile: vi.fn() }));
vi.mock("../../_lib/upload", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../_lib/upload")>()), uploadFile: uploads.uploadFile }));

const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const VIDEO = "bbbbbbbb-0000-4000-8000-000000000002";
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const REVISION_ID = "dddddddd-0000-4000-8000-000000000001";

/** Each format's starter pages, with ids that differ per format. */
function starterFormats(): Record<FormatId, Page[]> {
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return Object.fromEntries(
    FORMAT_IDS.map((id) => [id, starterPages("mac-case@1", "case_history", id, { newId, texts: {}, images: [IMAGE], resultRows: 2, hasTestimonial: true })]),
  ) as Record<FormatId, Page[]>;
}

const VALUES: BoundValues = {
  client: { name: "Lumen Srl", sector: "Illuminazione", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: 2026, services: ["Branding"], results: [], testimonial: null },
};

const formats = starterFormats();

const listed = (id: string, kind: "image" | "video", name: string, over: Partial<ListedAsset> = {}): ListedAsset => ({
  id,
  kind,
  originalFileName: name,
  contentType: kind === "image" ? "image/jpeg" : "video/mp4",
  sizeBytes: 1000,
  createdAt: "2026-10-30T10:00:00Z",
  isFavourite: false,
  thumbnailUrl: `https://cdn.test/${name}.webp`,
  thumbnailPending: false,
  ...over,
});
const MEDIA: readonly ListedAsset[] = [listed(IMAGE, "image", "LUM_cover.jpg", { isFavourite: true }), listed(VIDEO, "video", "LUM_reel.mp4")];
const MEDIA_RULES: MediaUploadRules = { maxFiles: 20, maxFileBytes: 50 * 1024 * 1024, contentTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"] };

type SaveFn = ConfiguratorProps["onSave"];
const savedOk: SaveFn = async (input) => ({ ok: true, value: { version: input.expectedVersion + 1 } });

function setup(
  trial = false,
  pagesByFormat: Record<FormatId, Page[]> = formats,
  {
    editable = true,
    onSave = vi.fn(savedOk),
    generatedTexts = {},
    images = [],
    values = VALUES,
    media = MEDIA,
  }: { editable?: boolean; onSave?: SaveFn; generatedTexts?: GeneratedTexts; images?: readonly string[]; values?: BoundValues; media?: readonly ListedAsset[] } = {},
) {
  return render(
    <Configurator
      caseId={CASE_ID}
      revision={trial ? null : { id: REVISION_ID, version: 4, editable, kind: "case_history" }}
      onSave={onSave}
      header={{ name: "Rebrand Lumen", code: "LUM-2026-01", status: "in_review" }}
      back={{ href: "/case-studies", label: dict.configurator.back }}
      template="mac-case@1"
      formats={pagesByFormat}
      assets={{ [IMAGE]: { url: "https://cdn.test/a.webp", kind: "image" } }}
      values={values}
      generatedTexts={generatedTexts}
      images={images}
      trial={trial}
      theme="system"
      media={media}
      mediaRules={MEDIA_RULES}
    />,
  );
}

const canvas = () => screen.getByRole("region", { name: dict.configurator.canvas.label, hidden: true });
// By label, not role: a hidden panel stays mounted but has no accessible name.
const leftPanel = () => document.querySelector<HTMLElement>(`aside[aria-label="${dict.configurator.panels.left}"]`)!;
const rightPanel = () => document.querySelector<HTMLElement>(`aside[aria-label="${dict.configurator.panels.right}"]`)!;
const pageNode = (pageKey: string) => canvas().querySelector<HTMLElement>(`[data-canvas-page="${pageKey}"]`)!;
const button = (name: string | RegExp, within_: HTMLElement = document.body) => within(within_).getByRole("button", { name, hidden: true });
const status = () => screen.getByRole("status", { hidden: true });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Configurator", () => {
  it("shows the top bar: back, name, code, badge, formats, Salvato, undo, redo, Approva", () => {
    setup();
    expect(screen.getByRole("link", { name: dict.configurator.back, hidden: true }).getAttribute("href")).toBe("/case-studies");
    expect(screen.getByText("Rebrand Lumen")).toBeTruthy();
    expect(screen.getByText("LUM-2026-01")).toBeTruthy();
    const formatsGroup = screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true });
    expect(within(formatsGroup).getAllByRole("button", { hidden: true }).map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Presentazione16:9", "true"],
      ["Carosello1:1", "false"],
      ["Video9:16", "false"],
    ]);
    expect(screen.getByText(dict.configurator.saved)).toBeTruthy();
    // Nothing to undo or redo yet; Approva arrives with Story 4.8.
    for (const name of [dict.configurator.undo, dict.configurator.redo]) expect(button(name).hasAttribute("disabled")).toBe(true);
    expect(button(dict.configurator.approve).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(dict.configurator.narrowScreen)).toBeTruthy();
  });

  it("draws Presentazione's pages grouped Intro, Output, Risultati and labelled {n} · {name}", () => {
    setup();
    const text = canvas().textContent ?? "";
    expect(text).toMatch(/Intro.*1 · Intro.*Output.*2 · Contenuti.*Risultati.*3 · Risultati e testimonial/s);
    expect(canvas().querySelectorAll(".mr-page")).toHaveLength(3);
  });

  it("switches format: that format's own pages and thumbnails", () => {
    setup();
    fireEvent.click(button(/Carosello/));
    expect(button(/Carosello/).getAttribute("aria-pressed")).toBe("true");
    const pages = [...canvas().querySelectorAll<HTMLElement>("[data-canvas-page]")].map((p) => p.dataset.canvasPage);
    expect(pages).toEqual(formats.carosello_1_1.map((p) => p.pageKey));
    expect(canvas().querySelector('.mr-page[data-format="carosello_1_1"]')).not.toBeNull();
    expect(canvas().querySelector('.mr-page[data-format="presentazione_16_9"]')).toBeNull();
    const thumbs = [...rightPanel().querySelectorAll<HTMLElement>("[data-thumb]")].map((t) => t.dataset.thumb);
    expect(thumbs).toEqual(formats.carosello_1_1.map((p) => p.pageKey));
  });

  it("frames a clicked block with Sposta; an element selects it inside its block; Esc steps out to nothing", () => {
    setup();
    const page = formats.presentazione_16_9[0];
    const block = page.blocks[0];
    const blockNode = pageNode(page.pageKey).querySelector(`[data-block-id="${block.blockId}"]`)!;
    fireEvent.click(blockNode);
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')?.textContent).toBe(dict.configurator.canvas.move);
    // The left panel names the selection first: the crumb Blocco, then the block's name and Rimuovi blocco (4.3c).
    expect(leftPanel().textContent).toMatch(
      new RegExp(`^${dict.configurator.crumbs.block}${block.name}${dict.configurator.edit.removeBlock}${dict.configurator.crumbs.page}`),
    );

    const elementNode = blockNode.querySelector("[data-element-id]")!;
    fireEvent.click(elementNode);
    expect(pageNode(page.pageKey).querySelector('[data-frame="element"]')).not.toBeNull();
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')?.textContent).toBe("");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(pageNode(page.pageKey).querySelector('[data-frame="element"]')).toBeNull();
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')?.textContent).toBe(dict.configurator.canvas.move);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).toBeNull();
    expect(pageNode(page.pageKey).hasAttribute("data-selected")).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(pageNode(page.pageKey).hasAttribute("data-selected")).toBe(false);
  });

  it("selects a page from its thumbnail and scrolls it to the middle", () => {
    setup();
    const page = formats.presentazione_16_9[2];
    const thumb = rightPanel().querySelector<HTMLElement>(`[data-thumb="${page.pageKey}"]`)!;
    expect(thumb.querySelector("small")?.textContent).toBe(`3 · ${page.name}`);
    fireEvent.click(thumb);
    expect(thumb.getAttribute("aria-current")).toBe("true");
    expect(pageNode(page.pageKey).hasAttribute("data-selected")).toBe(true);
    expect(pageNode(page.pageKey).scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    // The left panel's tools act on the selected page.
    expect(leftPanel().textContent?.startsWith(`${dict.configurator.crumbs.page}${page.name}`)).toBe(true);
  });

  it("filters the thumbnails with Cerca", () => {
    setup();
    fireEvent.change(within(rightPanel()).getByRole("searchbox", { hidden: true }), { target: { value: "risultati" } });
    expect([...rightPanel().querySelectorAll<HTMLElement>("[data-thumb]")].map((t) => t.dataset.thumb)).toEqual(["results"]);
    fireEvent.change(within(rightPanel()).getByRole("searchbox", { hidden: true }), { target: { value: "zzz" } });
    expect(rightPanel().textContent).toContain("Nessuna pagina per “zzz”.");
  });

  it("hides each panel from its own bar and reopens it from the canvas edge, moving focus", () => {
    setup();
    fireEvent.click(button(dict.configurator.panels.hideLeft));
    expect(leftPanel().hidden).toBe(true);
    const reopen = button(dict.configurator.panels.showLeft);
    expect(document.activeElement).toBe(reopen);
    fireEvent.click(reopen);
    expect(leftPanel().hidden).toBe(false);
    expect(document.activeElement).toBe(button(dict.configurator.panels.hideLeft));

    fireEvent.click(button(dict.configurator.panels.hideRight));
    expect(rightPanel().hidden).toBe(true);
    expect(document.activeElement).toBe(button(dict.configurator.panels.showRight));
    fireEvent.click(button(dict.configurator.panels.showRight));
    expect(document.activeElement).toBe(button(dict.configurator.panels.hideRight));
  });

  it("keeps the theme picked in the left panel across a hide and reopen", () => {
    setup();
    fireEvent.click(within(leftPanel()).getByRole("radio", { name: dict.shell.theme.dark, hidden: true }));
    fireEvent.click(button(dict.configurator.panels.hideLeft));
    fireEvent.click(button(dict.configurator.panels.showLeft));
    expect(within(leftPanel()).getByRole("radio", { name: dict.shell.theme.dark, hidden: true }).getAttribute("aria-checked")).toBe("true");
    expect(within(leftPanel()).getByRole("radio", { name: dict.shell.theme.system, hidden: true }).getAttribute("aria-checked")).toBe("false");
  });

  it("keeps the selection when Esc is pressed in the Cerca field", () => {
    setup();
    const page = formats.presentazione_16_9[0];
    fireEvent.click(pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0].blockId}"]`)!);
    fireEvent.keyDown(within(rightPanel()).getByRole("searchbox", { hidden: true }), { key: "Escape" });
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).not.toBeNull();
  });

  it("clears the selection when the empty canvas around the pages is clicked", () => {
    setup();
    const page = formats.presentazione_16_9[0];
    fireEvent.click(pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0].blockId}"]`)!);
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).not.toBeNull();
    fireEvent.click(canvas());
    expect(canvas().querySelector("[data-frame]")).toBeNull();
    expect(canvas().querySelector("[data-selected]")).toBeNull();
  });

  it("names the page in the middle of the canvas in the left panel when nothing is selected", () => {
    setup();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 800, width: 800, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    canvas().getBoundingClientRect = () => rect(0, 800);
    const pages = formats.presentazione_16_9;
    pages.forEach((p, i) => {
      pageNode(p.pageKey).getBoundingClientRect = () => rect(i * 400 - 100, 300);
    });
    // Page 2 spans 300–600, across the middle (400).
    fireEvent.scroll(canvas());
    expect(leftPanel().textContent?.startsWith(`${dict.configurator.crumbs.page}${pages[1].name}`)).toBe(true);
  });

  it("clears the selected page and thumbnail when the format changes", () => {
    setup();
    const page = formats.presentazione_16_9[1];
    fireEvent.click(rightPanel().querySelector<HTMLElement>(`[data-thumb="${page.pageKey}"]`)!);
    expect(canvas().querySelector("[data-selected]")).not.toBeNull();
    fireEvent.click(button(/Carosello/));
    expect(canvas().querySelector("[data-selected]")).toBeNull();
    expect(rightPanel().querySelector('[aria-current="true"]')).toBeNull();
  });

  it.each([
    [false, "smooth"],
    [true, "auto"],
  ] as const)("scrolls to a thumbnail's page (reduced motion %s: %s)", (reduce, behavior) => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" }) as MediaQueryList);
    try {
      setup();
      const page = formats.presentazione_16_9[2];
      fireEvent.click(rightPanel().querySelector<HTMLElement>(`[data-thumb="${page.pageKey}"]`)!);
      expect(pageNode(page.pageKey).scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior });
    } finally {
      window.matchMedia = original;
    }
  });

  it("shows the left panel's tools in place, inactive; pressing one says it comes soon for 3.5 s and changes nothing", () => {
    vi.useFakeTimers();
    setup();
    const panel = leftPanel();
    for (const tool of ["Layout", "Pagine di default", "Elementi", "Sfondo", "Elimina pagina"]) expect(panel.textContent).toContain(tool);
    expect(status().textContent).toBe("");
    const before = canvas().innerHTML;
    fireEvent.click(button(dict.configurator.tools.deletePage, panel));
    expect(status().textContent).toBe("Elimina pagina arriva presto.");
    expect(canvas().innerHTML).toBe(before);
    act(() => vi.advanceTimersByTime(STATUS_MESSAGE_MS));
    expect(status().textContent).toBe("");
    fireEvent.click(button(dict.configurator.approve));
    expect(status().textContent).toBe("Approva arriva presto.");
  });

  it("marks the page's layout among the Layout thumbnails", () => {
    setup();
    const pressed = within(leftPanel())
      .getAllByRole("button", { hidden: true })
      .filter((b) => b.getAttribute("aria-pressed") === "true" && b.getAttribute("aria-label")?.startsWith("Layout"));
    expect(pressed.map((b) => b.getAttribute("aria-label"))).toEqual(["Layout Intro"]);
  });

  it("shows the Bozza di prova note for starter pages", () => {
    setup(true);
    expect(canvas().textContent).toContain(dict.configurator.trial.title);
  });
});

describe("Configurator · Anteprima (Story 4.2b)", () => {
  const preview = dict.configurator.preview;
  const format = (name: string) => button(new RegExp(`^${name}`), screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true }));
  const eye = () => button(preview.enter);
  const pencil = () => button(preview.leave);
  const slideCaption = () => canvas().querySelector("[data-slideshow] p")?.textContent;
  const overlay = () => canvas().querySelector<HTMLElement>("[data-instagram]");
  const withReducedMotion = (reduce: boolean, run: () => void) => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" }) as MediaQueryList);
    try {
      run();
    } finally {
      window.matchMedia = original;
    }
  };

  it("puts the eye right of the format switch, not pressed", () => {
    setup();
    const formatsGroup = screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true });
    expect(formatsGroup.nextElementSibling).toBe(eye());
    expect(eye().getAttribute("aria-pressed")).toBe("false");
    expect(eye().getAttribute("title")).toBe(preview.enter);
  });

  it("on Presentazione: hides both panels, stacks the pages at 1600 px with their labels, and the eye becomes Torna all’editor", () => {
    setup();
    fireEvent.click(eye());
    expect(pencil().getAttribute("aria-pressed")).toBe("true");
    expect(pencil().getAttribute("title")).toBe(preview.leave);
    expect(leftPanel().hidden).toBe(true);
    expect(rightPanel().hidden).toBe(true);
    const pages = [...canvas().querySelectorAll<HTMLElement>("[data-canvas-page]")];
    expect(pages.map((p) => p.dataset.canvasPage)).toEqual(formats.presentazione_16_9.map((p) => p.pageKey));
    for (const page of pages) expect(page.className).toContain("max-w-[1600px]");
    expect(canvas().textContent).toMatch(/Intro.*1 · Intro.*Output.*2 · Contenuti.*Risultati.*3 · Risultati e testimonial/s);
    expect(canvas().querySelector("[data-slideshow]")).toBeNull();
  });

  it("hides the panels' reopen buttons too, and brings the panels back as they were", () => {
    setup();
    fireEvent.click(button(dict.configurator.panels.hideLeft));
    fireEvent.click(eye());
    expect(screen.queryByRole("button", { name: dict.configurator.panels.showLeft, hidden: true })).toBeNull();
    fireEvent.click(pencil());
    expect(leftPanel().hidden).toBe(true);
    expect(rightPanel().hidden).toBe(false);
    expect(button(dict.configurator.panels.showLeft)).toBeTruthy();
  });

  it("selects nothing on a click, shows no frames, and brings the selection back on return", () => {
    setup();
    const page = formats.presentazione_16_9[0];
    const block = () => pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0].blockId}"]`)!;
    fireEvent.click(block());
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).not.toBeNull();
    fireEvent.click(eye());
    expect(canvas().querySelector("[data-frame]")).toBeNull();
    const other = formats.presentazione_16_9[1];
    fireEvent.click(pageNode(other.pageKey).querySelector(`[data-block-id="${other.blocks[0].blockId}"]`)!);
    fireEvent.click(canvas());
    expect(canvas().querySelector("[data-frame]")).toBeNull();
    expect(canvas().querySelector("[data-selected]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(eye().getAttribute("aria-pressed")).toBe("false");
    expect(leftPanel().hidden).toBe(false);
    expect(rightPanel().hidden).toBe(false);
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')?.textContent).toBe(dict.configurator.canvas.move);
  });

  it("on Carosello with page 3 selected: a slideshow on page 3", () => {
    setup();
    fireEvent.click(format("Carosello"));
    const pages = formats.carosello_1_1;
    expect(pages.length).toBeGreaterThan(3);
    fireEvent.click(rightPanel().querySelector<HTMLElement>(`[data-thumb="${pages[2].pageKey}"]`)!);
    fireEvent.click(eye());
    expect(slideCaption()).toBe(`3 di ${pages.length} · ${pages[2].name}`);
    expect(canvas().querySelectorAll("[data-canvas-page]")).toHaveLength(1);
    expect(canvas().querySelector(`[data-canvas-page="${pages[2].pageKey}"]`)).not.toBeNull();
    expect(canvas().querySelector("[data-slideshow] [data-on]")).toBe(canvas().querySelectorAll("[data-slideshow] i")[2]);
  });

  it("starts at the first page when nothing is selected, and steps with ‹ ›, ← → up to the ends", () => {
    setup();
    fireEvent.click(format("Video"));
    fireEvent.click(eye());
    const pages = formats.video_9_16;
    const n = pages.length;
    expect(slideCaption()).toBe(`1 di ${n} · ${pages[0].name}`);
    expect(button(preview.previous).getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(slideCaption()).toBe(`1 di ${n} · ${pages[0].name}`);
    fireEvent.click(button(preview.next));
    expect(slideCaption()).toBe(`2 di ${n} · ${pages[1].name}`);
    expect(button(preview.previous).getAttribute("aria-disabled")).toBe("false");
    for (let i = 0; i < n + 2; i++) fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(slideCaption()).toBe(`${n} di ${n} · ${pages[n - 1].name}`);
    expect(button(preview.next).getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(slideCaption()).toBe(`${n - 1} di ${n} · ${pages[n - 2].name}`);
  });

  it("leaves ⌥/⌘/Ctrl + arrows to the browser and prevents the default of a stepping arrow", () => {
    setup();
    fireEvent.click(format("Carosello"));
    fireEvent.click(eye());
    for (const mod of ["altKey", "metaKey", "ctrlKey"] as const) {
      expect(fireEvent.keyDown(document, { key: "ArrowRight", [mod]: true })).toBe(true);
      expect(slideCaption()?.startsWith("1 di ")).toBe(true);
    }
    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.keyDown(document, { key: "ArrowRight" })).toBe(false);
    expect(slideCaption()?.startsWith("2 di ")).toBe(true);
  });

  it("keeps focus on ‹ › at the ends (aria-disabled, a click does nothing)", () => {
    setup();
    fireEvent.click(format("Carosello"));
    fireEvent.click(eye());
    const previous = button(preview.previous);
    expect(previous.hasAttribute("disabled")).toBe(false);
    expect(previous.getAttribute("aria-keyshortcuts")).toBe("ArrowLeft");
    expect(button(preview.next).getAttribute("aria-keyshortcuts")).toBe("ArrowRight");
    previous.focus();
    fireEvent.click(previous);
    expect(slideCaption()?.startsWith("1 di ")).toBe(true);
    expect(document.activeElement).toBe(previous);
  });

  it("Esc leaving Anteprima moves focus to the eye and brings the shown page to the middle", () => {
    setup();
    fireEvent.click(format("Video"));
    fireEvent.click(eye());
    fireEvent.click(button("Reel"));
    fireEvent.click(button(preview.next));
    button(preview.next).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(eye());
    const shown = formats.video_9_16[1];
    const scroll = vi.mocked(Element.prototype.scrollIntoView).mock;
    expect(scroll.contexts.at(-1)).toBe(pageNode(shown.pageKey));
    expect(scroll.calls.at(-1)).toEqual([{ block: "center", behavior: "auto" }]);
  });

  it("Esc with focus on the Animazione testi switch steps the selection out", () => {
    setup();
    fireEvent.click(format("Video"));
    const page = formats.video_9_16[0];
    fireEvent.click(pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0].blockId}"]`)!);
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).not.toBeNull();
    const toggle = screen.getByRole("switch", { name: dict.configurator.textAnimation, hidden: true });
    toggle.focus();
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).toBeNull();
    expect(pageNode(page.pageKey).hasAttribute("data-selected")).toBe(true);
  });

  it("switching format stays in Anteprima and starts at the first page; Presentazione is stacked again", () => {
    setup();
    fireEvent.click(format("Video"));
    fireEvent.click(eye());
    fireEvent.click(button(preview.next));
    fireEvent.click(format("Carosello"));
    expect(pencil().getAttribute("aria-pressed")).toBe("true");
    expect(slideCaption()).toBe(`1 di ${formats.carosello_1_1.length} · ${formats.carosello_1_1[0].name}`);
    fireEvent.click(format("Presentazione"));
    expect(pencil().getAttribute("aria-pressed")).toBe("true");
    expect(canvas().querySelector("[data-slideshow]")).toBeNull();
    expect(canvas().querySelectorAll("[data-canvas-page]")).toHaveLength(formats.presentazione_16_9.length);
    expect(leftPanel().hidden).toBe(true);
  });

  it("draws Instagram's Reel or Story over a Video page, Nessuna by default and removing it", () => {
    setup();
    fireEvent.click(format("Video"));
    expect(screen.queryByRole("group", { name: preview.instagram.label, hidden: true })).toBeNull();
    fireEvent.click(eye());
    const group = screen.getByRole("group", { name: preview.instagram.label, hidden: true });
    expect(within(group).getAllByRole("button", { hidden: true }).map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Nessuna", "true"],
      ["Reel", "false"],
      ["Storia", "false"],
    ]);
    expect(overlay()).toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "Reel", hidden: true }));
    const reel = overlay()!;
    expect(reel.dataset.instagram).toBe("reel");
    expect(reel.getAttribute("aria-hidden")).toBe("true");
    expect(reel.className).toContain("pointer-events-none");
    expect(reel.textContent).toContain("mac.creativetech");
    expect(reel.textContent).toContain(preview.instagram.follow);
    expect(reel.querySelector(".ig-text")?.textContent).toBe("Rebrand Lumen");
    // Over the rendered page, outside the renderer's own markup.
    expect(reel.closest(".mr-root")).toBeNull();
    expect(reel.parentElement?.querySelector(".mr-page")).not.toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "Storia", hidden: true }));
    const story = overlay()!;
    expect(story.dataset.instagram).toBe("story");
    expect(story.textContent).toContain(preview.instagram.message);
    expect(story.textContent).toContain(preview.instagram.time);
    expect(story.textContent).not.toContain("Rebrand Lumen");

    fireEvent.click(within(group).getByRole("button", { name: "Nessuna", hidden: true }));
    expect(overlay()).toBeNull();
  });

  it("never draws the overlay on Carosello or in the editor", () => {
    setup();
    fireEvent.click(format("Video"));
    fireEvent.click(eye());
    fireEvent.click(button("Reel"));
    fireEvent.click(format("Carosello"));
    expect(overlay()).toBeNull();
    fireEvent.click(format("Video"));
    expect(overlay()).not.toBeNull();
    fireEvent.click(pencil());
    expect(overlay()).toBeNull();
  });

  it("leaves with the pencil too", () => {
    setup();
    fireEvent.click(eye());
    fireEvent.click(pencil());
    expect(eye().getAttribute("aria-pressed")).toBe("false");
    expect(leftPanel().hidden).toBe(false);
  });

  it("Animazione testi: on by default in the Video editor; off stills the texts, thumbnails unchanged; Anteprima animates", () => {
    setup();
    expect(screen.queryByRole("switch", { name: dict.configurator.textAnimation, hidden: true })).toBeNull();
    fireEvent.click(format("Video"));
    const toggle = screen.getByRole("switch", { name: dict.configurator.textAnimation, hidden: true }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(canvas().querySelectorAll(".mr-vin").length).toBeGreaterThan(0);
    const thumbs = rightPanel().innerHTML;
    expect(rightPanel().querySelectorAll(".mr-vin")).toHaveLength(0);

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(canvas().querySelectorAll(".mr-vin")).toHaveLength(0);
    expect(rightPanel().innerHTML).toBe(thumbs);

    fireEvent.click(eye());
    expect(screen.queryByRole("switch", { name: dict.configurator.textAnimation, hidden: true })).toBeNull();
    expect(canvas().querySelectorAll(".mr-vin").length).toBeGreaterThan(0);
    fireEvent.click(pencil());
    expect((screen.getByRole("switch", { name: dict.configurator.textAnimation, hidden: true }) as HTMLInputElement).checked).toBe(false);
  });

  it("a format with one page: both buttons disabled, one dot", () => {
    setup(false, { ...formats, carosello_1_1: formats.carosello_1_1.slice(0, 1) });
    fireEvent.click(format("Carosello"));
    fireEvent.click(eye());
    expect(button(preview.previous).getAttribute("aria-disabled")).toBe("true");
    expect(button(preview.next).getAttribute("aria-disabled")).toBe("true");
    expect(canvas().querySelectorAll("[data-slideshow] i")).toHaveLength(1);
    expect(slideCaption()).toBe(`1 di 1 · ${formats.carosello_1_1[0].name}`);
  });

  it.each([
    [false, true],
    [true, false],
  ] as const)("slides with a short entrance unless motion is reduced (reduced %s: entrance %s)", (reduce, entrance) => {
    withReducedMotion(reduce, () => {
      setup();
      fireEvent.click(format("Carosello"));
      fireEvent.click(eye());
      expect(canvas().querySelector("[data-slide]")!.className.includes("animate-enter")).toBe(entrance);
    });
  });

  it("Esc in the Cerca field neither steps out nor leaves the editor", () => {
    setup();
    const page = formats.presentazione_16_9[0];
    fireEvent.click(pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0].blockId}"]`)!);
    fireEvent.keyDown(within(rightPanel()).getByRole("searchbox", { hidden: true }), { key: "Escape" });
    expect(eye().getAttribute("aria-pressed")).toBe("false");
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).not.toBeNull();
  });
});

/** Story 4.3a: texts typed in on the page, the autosave, undo/redo and the overflow marker. */
describe("Configurator editing", () => {
  const fixture = () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    return Object.fromEntries(FORMAT_IDS.map((id) => [id, doc.formats[id]!.pages])) as Record<FormatId, Page[]>;
  };
  /** The first page of `pages` with an own text, and that text's id. */
  const ownText = (pages: readonly Page[]) => {
    for (const page of pages) {
      const id = ownTextIds(page)[0];
      if (id !== undefined) return { page, id };
    }
    throw new Error("no own text in the fixture");
  };
  /** The first text bound to the client or the case. */
  const boundText = (pages: readonly Page[]) => {
    for (const page of pages) {
      const own = new Set(ownTextIds(page));
      for (const node of pageNode(page.pageKey).querySelectorAll<HTMLElement>(".mr-txt[data-element-id]")) {
        if (!own.has(node.dataset.elementId!)) return { page, id: node.dataset.elementId! };
      }
    }
    throw new Error("no bound text in the fixture");
  };
  const textNode = (pageKey: string, id: string) => pageNode(pageKey).querySelector<HTMLElement>(`[data-element-id="${id}"]`)!;
  const saveState = () => document.querySelector<HTMLElement>("[data-save-state]")!;

  function type(node: HTMLElement, text: string) {
    node.textContent = text;
    fireEvent.input(node);
  }

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    refresh.mockClear();
  });

  it("a double-click types in a generated text; Esc finishes; it saves as human_edited with the version", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, id } = ownText(pages.presentazione_16_9);
    fireEvent.doubleClick(textNode(page.pageKey, id));
    const node = textNode(page.pageKey, id);
    expect(node.getAttribute("contenteditable")).toBe("plaintext-only");
    expect(document.activeElement).toBe(node);
    type(node, "Parole nuove\nsu due righe");
    fireEvent.keyDown(node, { key: "Escape" });
    expect(textNode(page.pageKey, id).hasAttribute("contenteditable")).toBe(false);
    expect(textNode(page.pageKey, id).textContent).toBe("Parole nuove\nsu due righe");
    await advance(0);
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = onSave.mock.calls[0]![0];
    expect(sent).toMatchObject({ caseId: CASE_ID, revisionId: REVISION_ID, expectedVersion: 4, doc: { schemaVersion: 2, kind: "case_history", template: "mac-case@1" } });
    expect(textElementAt(sent.doc.formats.presentazione_16_9.pages, page.pageKey, id)).toMatchObject({ text: "Parole nuove\nsu due righe", provenance: "human_edited" });
    // Only the format in view changes, and the document is what the server validates.
    expect(sent.doc.formats.carosello_1_1.pages).toEqual(pages.carosello_1_1);
    expect(validateNewDocument(sent.doc)).toMatchObject({ ok: true });
    expect(saveState().textContent).toBe(dict.configurator.saved);
  });

  it("Enter on a selected text types in it; Esc inside it doesn't step the selection out", () => {
    const pages = fixture();
    setup(false, pages);
    const { page, id } = ownText(pages.presentazione_16_9);
    fireEvent.click(textNode(page.pageKey, id));
    fireEvent.keyDown(document.body, { key: "Enter" });
    const node = textNode(page.pageKey, id);
    expect(node.getAttribute("contenteditable")).toBe("plaintext-only");
    fireEvent.keyDown(node, { key: "Escape" });
    expect(pageNode(page.pageKey).querySelector('[data-frame="element"]')).not.toBeNull();
  });

  it("a failed save says Non salvato. Nuovo tentativo…, and after 3 failures the banner shows", async () => {
    const pages = fixture();
    const onSave = vi.fn<SaveFn>().mockRejectedValue(new Error("offline"));
    setup(false, pages, { onSave });
    const { page, id } = ownText(pages.presentazione_16_9);
    fireEvent.doubleClick(textNode(page.pageKey, id));
    type(textNode(page.pageKey, id), "x");
    fireEvent.keyDown(textNode(page.pageKey, id), { key: "Escape" });
    await advance(0);
    expect(saveState().textContent).toBe(dict.configurator.retrying);
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
    await advance(2_000);
    await advance(4_000);
    expect(onSave).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("alert", { hidden: true }).textContent).toBe(dict.configurator.saveBanner);
  });

  it.each(["STALE_REVISION", "CASE_NOT_EDITABLE"])("%s reloads the page from the server, with no retry", async (code) => {
    const pages = fixture();
    const onSave = vi.fn<SaveFn>().mockResolvedValue({ ok: false, status: 409, error: { code, message: "m" } });
    setup(false, pages, { onSave });
    const { page, id } = ownText(pages.presentazione_16_9);
    fireEvent.doubleClick(textNode(page.pageKey, id));
    type(textNode(page.pageKey, id), "x");
    fireEvent.keyDown(textNode(page.pageKey, id), { key: "Escape" });
    await advance(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("⌘Z after switching format goes back to the format, restores the text and saves; ⇧⌘Z redoes", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, id } = ownText(pages.presentazione_16_9);
    const before = textNode(page.pageKey, id).textContent;
    fireEvent.doubleClick(textNode(page.pageKey, id));
    type(textNode(page.pageKey, id), "Cambiato");
    fireEvent.keyDown(textNode(page.pageKey, id), { key: "Escape" });
    fireEvent.click(button(/Carosello/));
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(false);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(button(/Presentazione/).getAttribute("aria-pressed")).toBe("true");
    expect(textNode(page.pageKey, id).textContent).toBe(before);
    await advance(1_000);
    const last = onSave.mock.calls.at(-1)![0];
    expect(textElementAt(last.doc.formats.presentazione_16_9.pages, page.pageKey, id)?.text).toBe(before);
    fireEvent.click(button(dict.configurator.redo));
    expect(textNode(page.pageKey, id).textContent).toBe("Cambiato");
  });

  it.each([
    ["a text bound to the client or the case", true],
    ["any text of a case that can't be edited (approved)", false],
  ] as const)("a double-click on %s says it can't be edited yet", (_name, editable) => {
    const pages = fixture();
    setup(false, pages, { editable });
    const { page, id } = editable ? boundText(pages.presentazione_16_9) : ownText(pages.presentazione_16_9);
    fireEvent.doubleClick(textNode(page.pageKey, id));
    expect(textNode(page.pageKey, id).hasAttribute("contenteditable")).toBe(false);
    expect(status().textContent).toBe(dict.configurator.editSoon);
  });

  it("marks a block whose text doesn't fit, in the editor only", () => {
    const pages = fixture();
    const { page, id } = ownText(pages.presentazione_16_9);
    const blockId = page.blocks.find((b) => JSON.stringify(b).includes(id))!.blockId;
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset?.blockId === blockId ? 500 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    setup(false, pages);
    const marks = pageNode(page.pageKey).querySelectorAll('[data-frame="overflow"]');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe(dict.configurator.overflow);
    expect(canvas().querySelectorAll('[data-frame="overflow"]')).toHaveLength(1);
    fireEvent.click(button(dict.configurator.preview.enter));
    expect(canvas().querySelectorAll('[data-frame="overflow"]')).toHaveLength(0);
  });

  it("in Anteprima every own text takes typing, and it saves", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    fireEvent.click(button(dict.configurator.preview.enter));
    const { page, id } = ownText(pages.presentazione_16_9);
    const node = textNode(page.pageKey, id);
    expect(node.getAttribute("contenteditable")).toBe("plaintext-only");
    node.focus();
    type(node, "Dall’anteprima");
    node.blur();
    await advance(0);
    expect(textElementAt(onSave.mock.calls[0]![0].doc.formats.presentazione_16_9.pages, page.pageKey, id)?.text).toBe("Dall’anteprima");
  });

  it("the trial pages take no typing", () => {
    setup(true);
    const page = formats.presentazione_16_9.find((p) => ownTextIds(p).length > 0);
    expect(page).toBeDefined();
    const id = ownTextIds(page!)[0]!;
    fireEvent.doubleClick(textNode(page!.pageKey, id));
    expect(textNode(page!.pageKey, id).hasAttribute("contenteditable")).toBe(false);
  });

  it("a double-click inside the text being typed in keeps one editing session (one undo step)", () => {
    const pages = fixture();
    setup(false, pages);
    const { page, id } = ownText(pages.presentazione_16_9);
    const before = textNode(page.pageKey, id).textContent;
    fireEvent.doubleClick(textNode(page.pageKey, id));
    type(textNode(page.pageKey, id), "uno");
    fireEvent.doubleClick(textNode(page.pageKey, id));
    type(textNode(page.pageKey, id), "uno due");
    fireEvent.keyDown(textNode(page.pageKey, id), { key: "Escape" });
    fireEvent.click(button(dict.configurator.undo));
    expect(textNode(page.pageKey, id).textContent).toBe(before);
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("in Anteprima of Carosello the slide's own texts take typing, saved to Carosello", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    fireEvent.click(button(/Carosello/));
    fireEvent.click(button(dict.configurator.preview.enter));
    const { page, id } = ownText(pages.carosello_1_1.slice(0, 1));
    const node = canvas().querySelector<HTMLElement>(`[data-slide] [data-element-id="${id}"]`)!;
    expect(node.getAttribute("contenteditable")).toBe("plaintext-only");
    node.focus();
    type(node, "Dal carosello");
    node.blur();
    await advance(0);
    const sent = onSave.mock.calls[0]![0].doc.formats;
    expect(textElementAt(sent.carosello_1_1.pages, page.pageKey, id)?.text).toBe("Dal carosello");
    expect(sent.presentazione_16_9.pages).toEqual(pages.presentazione_16_9);
  });
});

describe("Configurator text panel (Story 4.3b)", () => {
  const fixture = () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    return Object.fromEntries(FORMAT_IDS.map((id) => [id, doc.formats[id]!.pages])) as Record<FormatId, Page[]>;
  };
  /** The first text of `pages` matching `test`, inside groups and rows too, with its page. */
  const findText = (pages: readonly Page[], test: (el: TextElement) => boolean) => {
    for (const page of pages) {
      for (const block of page.blocks) {
        const walk = (elements: readonly DocumentElement[]): TextElement | undefined => {
          for (const el of elements) {
            if (el.type === "text" && test(el)) return el;
            if (el.type === "text_group" || el.type === "row") {
              const inner = walk(el.items);
              if (inner !== undefined) return inner;
            }
          }
          return undefined;
        };
        const el = walk(block.elements);
        if (el !== undefined) return { page, el };
      }
    }
    throw new Error("no such text in the fixture");
  };
  const findGroup = (pages: readonly Page[]) => {
    for (const page of pages) {
      for (const block of page.blocks) {
        const el = block.elements.find((e): e is TextGroupElement => e.type === "text_group" && e.align !== "split" && e.items.length > 1);
        if (el !== undefined) return { page, el };
      }
    }
    throw new Error("no group in the fixture");
  };
  const node = (pageKey: string, id: string) => pageNode(pageKey).querySelector<HTMLElement>(`[data-element-id="${id}"]`)!;
  const names: Record<TextGroupElement["align"], string> = {
    top: dict.configurator.group.top,
    centre: dict.configurator.group.centre,
    bottom: dict.configurator.group.bottom,
    split: dict.configurator.group.splitOne,
  };
  const groupSection = () => within(leftPanel()).getByRole("region", { name: dict.configurator.group.heading, hidden: true });
  const textSection = () => within(leftPanel()).getByRole("region", { name: /^Testo · /, hidden: true });
  /** The template's lime, from the palette (no raw colours in components). */
  const LIME = TEXT_COLOURS[3];
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("shows Testo · {format} with the text's style, alignment, colour and columns", () => {
    const pages = fixture();
    setup(false, pages);
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.colour === undefined && t.align === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    const panel = textSection();
    expect(within(panel).getByText("Testo · Presentazione")).toBeTruthy();
    const select = within(panel).getByLabelText(dict.configurator.text.style) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Etichetta", "Titolo XL", "Titolo", "Sottotitolo", "Testo", "Numero", "Citazione"]);
    expect(select.value).toBe(el.style);
    expect(button(dict.configurator.text.alignLeft, panel).getAttribute("aria-pressed")).toBe("true");
    expect((within(panel).getByLabelText(dict.configurator.text.colourField) as HTMLInputElement).value).toMatch(/^#[0-9A-F]{6}/);
    expect(button(dict.configurator.text.oneColumn, panel).getAttribute("aria-pressed")).toBe("true");
  });

  it("a new style drops the template size, saves once in the format in view, and ⌘Z brings it back", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.size !== undefined);
    const style = el.style === "text" ? "title" : "text";
    fireEvent.click(node(page.pageKey, el.elementId));
    fireEvent.change(within(textSection()).getByLabelText(dict.configurator.text.style), { target: { value: style } });
    expect(node(page.pageKey, el.elementId).classList.contains(`mr-t-${style}`)).toBe(true);
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = lastDoc(onSave);
    const saved = textElementAt(sent.formats.presentazione_16_9.pages, page.pageKey, el.elementId)!;
    expect(saved).toMatchObject({ style, provenance: el.provenance });
    expect(saved.size).toBeUndefined();
    expect(sent.formats.carosello_1_1.pages).toEqual(pages.carosello_1_1);
    expect(validateNewDocument(sent)).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(node(page.pageKey, el.elementId).classList.contains(`mr-t-${el.style}`)).toBe(true);
    await settle();
    expect(textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)).toMatchObject({ style: el.style, size: el.size });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(node(page.pageKey, el.elementId).classList.contains(`mr-t-${style}`)).toBe(true);
    await settle();
    expect(textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)?.style).toBe(style);
  });

  it("pressing the pressed alignment changes nothing and saves nothing", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.align === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    fireEvent.click(button(dict.configurator.text.alignLeft, textSection()));
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("sets alignment, a swatch colour and two columns, each one undo step", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.align === undefined && t.columns === undefined && t.colour === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    fireEvent.click(button(dict.configurator.text.alignCentre, textSection()));
    fireEvent.click(button(LIME.toUpperCase(), textSection()));
    fireEvent.click(button(dict.configurator.text.twoColumns, textSection()));
    const shown = node(page.pageKey, el.elementId);
    expect(shown.classList.contains("mr-al-centre")).toBe(true);
    expect(shown.classList.contains("mr-cols-2")).toBe(true);
    expect(shown.style.color.toLowerCase()).toBe(LIME);
    expect(button(LIME.toUpperCase(), textSection()).getAttribute("aria-pressed")).toBe("true");
    await settle();
    expect(textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)).toMatchObject({ align: "centre", colour: LIME, columns: 2 });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(node(page.pageKey, el.elementId).classList.contains("mr-cols-2")).toBe(false);
    expect(node(page.pageKey, el.elementId).classList.contains("mr-al-centre")).toBe(true);
    // A second ⌘Z takes the colour back, and saves it.
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(node(page.pageKey, el.elementId).style.color).toBe("");
    expect(button(LIME.toUpperCase(), textSection()).getAttribute("aria-pressed")).toBe("false");
    await settle();
    expect(textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)?.colour).toBeUndefined();
    fireEvent.click(button(dict.configurator.text.oneColumn, textSection()));
    fireEvent.click(button(dict.configurator.text.alignLeft, textSection()));
    await settle();
    const back = textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)!;
    expect("align" in back || "columns" in back).toBe(false);
  });

  it("takes a typed colour on Enter, and puts the current value back for anything else", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.colour === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    const field = () => within(textSection()).getByLabelText(dict.configurator.text.colourField) as HTMLInputElement;
    const before = field().value;
    fireEvent.change(field(), { target: { value: "blu" } });
    fireEvent.blur(field());
    expect(field().value).toBe(before);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    const blue = TEXT_COLOURS[4];
    fireEvent.change(field(), { target: { value: blue.slice(1).toUpperCase() } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe(blue.toUpperCase());
    // Enter in the field doesn't open the text for typing.
    expect(node(page.pageKey, el.elementId).hasAttribute("contenteditable")).toBe(false);
    await settle();
    expect(textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)?.colour).toBe(blue);
    fireEvent.click(button(dict.configurator.text.transparent, textSection()));
    expect(field().value).toBe(dict.configurator.text.transparent);
  });

  it("visiting the colour field, Escape in it, or the pressed swatch keeps an inherited colour inherited", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.colour === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    const field = () => within(textSection()).getByLabelText(dict.configurator.text.colourField) as HTMLInputElement;
    fireEvent.focus(field());
    fireEvent.blur(field());
    fireEvent.change(field(), { target: { value: TEXT_COLOURS[4] } });
    fireEvent.keyDown(field(), { key: "Escape" });
    const pressed = within(textSection())
      .getAllByRole("button", { hidden: true })
      .find((b) => b.getAttribute("aria-pressed") === "true" && TEXT_COLOURS.some((c) => c.toUpperCase() === b.getAttribute("aria-label")))!;
    fireEvent.click(pressed);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("restyles a text bound to the client, keeping its binding", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.text === undefined && t.align === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    fireEvent.click(button(dict.configurator.text.alignRight, textSection()));
    await settle();
    const saved = textElementAt(lastDoc(onSave).formats.presentazione_16_9.pages, page.pageKey, el.elementId)!;
    expect(saved).toMatchObject({ align: "right", provenance: el.provenance });
    expect(saved.binding ?? saved.bindings).toEqual(el.binding ?? el.bindings);
  });

  it("aligns a Testi group in its block: Distanziati puts the first text on top, In alto drops it", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const { page, el } = findGroup(pages.presentazione_16_9);
    fireEvent.click(node(page.pageKey, el.elementId));
    const section = groupSection();
    expect(within(section).getAllByRole("button", { hidden: true }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "In alto",
      "Al centro",
      "In basso",
      "Distanziati: il primo testo in alto, il resto in basso",
    ]);
    expect(button(names[el.align], section).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button(dict.configurator.group.splitOne, section));
    expect(node(page.pageKey, el.elementId).classList.contains("mr-grp-split")).toBe(true);
    expect(button(dict.configurator.group.splitOne, section).getAttribute("aria-pressed")).toBe("true");
    expect(button(names[el.align], section).getAttribute("aria-pressed")).toBe("false");
    await settle();
    const group = () => {
      for (const block of lastDoc(onSave).formats.presentazione_16_9.pages.find((p) => p.pageKey === page.pageKey)!.blocks) {
        const found = block.elements.find((e) => e.elementId === el.elementId);
        if (found !== undefined) return found as TextGroupElement;
      }
      throw new Error("group gone");
    };
    expect(group()).toMatchObject({ align: "split", splitAt: 1 });
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    expect(lastDoc(onSave).formats.carosello_1_1.pages).toEqual(pages.carosello_1_1);
    fireEvent.click(button(dict.configurator.group.top, section));
    await settle();
    expect(group().align).toBe("top");
    expect("splitAt" in group()).toBe(false);
  });

  it("names Distanziati by how many texts stay on top", () => {
    const pages = fixture();
    const { page, el } = findGroup(pages.presentazione_16_9);
    el.align = "split";
    el.splitAt = 2;
    setup(false, pages);
    fireEvent.click(node(page.pageKey, el.elementId));
    const split = button(fill(dict.configurator.group.splitMany, { n: 2 }), groupSection());
    expect(split.getAttribute("aria-label")).toBe("Distanziati: i primi 2 testi in alto, il resto in basso");
    expect(split.getAttribute("aria-pressed")).toBe("true");
  });

  it("on a case that can't be edited, shows the values but changes nothing and says it comes soon", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { editable: false, onSave });
    const { page, el } = findText(pages.presentazione_16_9, (t) => t.align === undefined);
    fireEvent.click(node(page.pageKey, el.elementId));
    const centre = button(dict.configurator.text.alignCentre, textSection());
    expect(centre.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(centre);
    expect(status().textContent).toBe(`${dict.configurator.text.align} arriva presto.`);
    expect(node(page.pageKey, el.elementId).classList.contains("mr-al-centre")).toBe(false);
    expect((within(textSection()).getByLabelText(dict.configurator.text.style) as HTMLSelectElement).disabled).toBe(true);
    for (const name of [LIME.toUpperCase(), dict.configurator.text.twoColumns]) {
      expect(button(name, textSection()).getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(button(name, textSection()));
    }
    const field = within(textSection()).getByLabelText(dict.configurator.text.colourField) as HTMLInputElement;
    expect(field.readOnly).toBe(true);
    fireEvent.change(field, { target: { value: LIME } });
    fireEvent.blur(field);
    // A Testi group's buttons too.
    const { page: groupPage, el: group } = findGroup(pages.presentazione_16_9);
    fireEvent.click(node(groupPage.pageKey, group.elementId));
    const bottom = button(dict.configurator.group.bottom, groupSection());
    expect(bottom.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(bottom);
    expect(status().textContent).toBe(`${dict.configurator.group.heading} arriva presto.`);
    expect(node(groupPage.pageKey, group.elementId).classList.contains("mr-grp-bottom")).toBe(group.align === "bottom");
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });
});

describe("Configurator elements and blocks (Story 4.3c)", () => {
  const fixture = () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    return Object.fromEntries(FORMAT_IDS.map((id) => [id, doc.formats[id]!.pages])) as Record<FormatId, Page[]>;
  };
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const blockNode = (pageKey: string, blockId: string) => pageNode(pageKey).querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!;
  const blockIds = (pageKey: string) => [...pageNode(pageKey).querySelectorAll<HTMLElement>("[data-block-id]")].map((b) => b.dataset.blockId);
  const elementsSection = () => within(leftPanel()).getByRole("region", { name: dict.configurator.tools.elements, hidden: true });
  const elementButton = (name: string) => button(name, elementsSection());
  /** Clicks a block's own background (not one of its elements). */
  const selectBlock = (pageKey: string, blockId: string) => fireEvent.click(blockNode(pageKey, blockId));

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("Titolo goes at the end of the selected element's block, selected, saved once in the format in view; ⌘Z and ⇧⌘Z undo and redo it", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const page = pages.presentazione_16_9[0]!;
    const block = page.blocks[0]!;
    fireEvent.click(blockNode(page.pageKey, block.blockId).querySelector("[data-element-id]")!);
    expect(within(elementsSection()).queryByText(dict.configurator.soon)).toBeNull();
    fireEvent.click(elementButton(dict.configurator.elements.title));
    const added = blockNode(page.pageKey, block.blockId).querySelectorAll(":scope > [data-element-id]");
    expect(added).toHaveLength(block.elements.length + 1);
    expect(added[added.length - 1]!.textContent).toBe(dict.configurator.newTexts.title);
    // The new title is selected: its name heads the left panel.
    expect(pageNode(page.pageKey).querySelector('[data-frame="element"]')).not.toBeNull();
    expect(button(dict.configurator.edit.removeElement, leftPanel())).toBeTruthy();
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = lastDoc(onSave);
    const saved = sent.formats.presentazione_16_9.pages[0].blocks[0].elements.at(-1);
    expect(saved).toMatchObject({ type: "text", style: "title", text: dict.configurator.newTexts.title, provenance: "human_added" });
    expect(sent.formats.carosello_1_1.pages).toEqual(pages.carosello_1_1);
    expect(validateNewDocument(sent)).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(blockNode(page.pageKey, block.blockId).querySelectorAll(":scope > [data-element-id]")).toHaveLength(block.elements.length);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(blockNode(page.pageKey, block.blockId).querySelectorAll(":scope > [data-element-id]")).toHaveLength(block.elements.length + 1);
  });

  it("an element with no block selected says to select one; Animazione arrives with 4.5", () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    fireEvent.click(elementButton(dict.configurator.elements.text));
    expect(status().textContent).toBe(dict.configurator.edit.needBlock);
    const animation = elementButton(dict.configurator.elements.animation);
    expect(animation.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(animation);
    expect(status().textContent).toBe(`${dict.configurator.elements.animation} arriva presto.`);
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("Blocco adds an empty block after the selected one, with its hint, until the page has 6", () => {
    const pages = fixture();
    setup(false, pages);
    const page = pages.presentazione_16_9[0]!;
    const first = page.blocks[0]!.blockId;
    selectBlock(page.pageKey, first);
    fireEvent.click(elementButton(dict.configurator.elements.block));
    const after = blockIds(page.pageKey);
    expect(after).toHaveLength(page.blocks.length + 1);
    expect(after[0]).toBe(first);
    expect(after.slice(2)).toEqual(page.blocks.slice(1).map((b) => b.blockId));
    // The new block is selected (Sposta, Rimuovi blocco) and shows the hint.
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')?.textContent).toBe(dict.configurator.canvas.move);
    expect(button(dict.configurator.edit.removeBlock, leftPanel())).toBeTruthy();
    expect(pageNode(page.pageKey).querySelector('[data-frame="empty"]')?.textContent).toBe(dict.configurator.edit.emptyBlock);
    for (let n = after.length; n < 6; n++) fireEvent.click(elementButton(dict.configurator.elements.block));
    expect(blockIds(page.pageKey)).toHaveLength(6);
    fireEvent.click(elementButton(dict.configurator.elements.block));
    expect(status().textContent).toBe(dict.configurator.edit.pageFull);
    expect(blockIds(page.pageKey)).toHaveLength(6);
  });

  it("⌘C copies a block and ⌘V pastes it after the selected block of another page, with new ids; ⌘X cuts", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const [from, to] = [pages.presentazione_16_9[0]!, pages.presentazione_16_9[1]!];
    const copied = from.blocks[0]!;
    selectBlock(from.pageKey, copied.blockId);
    fireEvent.keyDown(document.body, { key: "c", metaKey: true });
    expect(status().textContent).toBe(dict.configurator.edit.copied);
    selectBlock(to.pageKey, to.blocks[0]!.blockId);
    fireEvent.keyDown(document.body, { key: "v", metaKey: true });
    const ids = blockIds(to.pageKey);
    expect(ids).toHaveLength(to.blocks.length + 1);
    expect(ids).not.toContain(copied.blockId);
    expect(blockNode(to.pageKey, ids[1]!).textContent).toBe(blockNode(from.pageKey, copied.blockId).textContent);
    await settle();
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });

    const cut = to.blocks[0]!.blockId;
    selectBlock(to.pageKey, cut);
    fireEvent.keyDown(document.body, { key: "x", metaKey: true });
    expect(status().textContent).toBe(dict.configurator.edit.cut);
    expect(blockIds(to.pageKey)).not.toContain(cut);
    // The page is selected now: ⌘V puts the cut block at its end.
    fireEvent.keyDown(document.body, { key: "v", ctrlKey: true });
    expect(blockIds(to.pageKey)).toHaveLength(ids.length);
    await settle();
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
  });

  it("⌘C with an element selected is left to the browser", () => {
    const pages = fixture();
    setup(false, pages);
    const page = pages.presentazione_16_9[0]!;
    fireEvent.click(blockNode(page.pageKey, page.blocks[0]!.blockId).querySelector("[data-element-id]")!);
    const event = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    fireEvent.keyDown(document.body, { key: "v", metaKey: true });
    expect(blockIds(page.pageKey)).toHaveLength(page.blocks.length);
  });

  it("Backspace removes the selected element, then Rimuovi blocco its block, each with its message and undoable", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const page = pages.presentazione_16_9[0]!;
    const block = page.blocks[0]!;
    const element = blockNode(page.pageKey, block.blockId).querySelector<HTMLElement>("[data-element-id]")!;
    const elementId = element.dataset.elementId!;
    fireEvent.click(element);
    fireEvent.keyDown(document.body, { key: "Backspace" });
    expect(status().textContent).toBe(dict.configurator.edit.elementRemoved);
    expect(pageNode(page.pageKey).querySelector(`[data-element-id="${elementId}"]`)).toBeNull();
    // Its block is selected now.
    fireEvent.click(button(dict.configurator.edit.removeBlock, leftPanel()));
    expect(status().textContent).toBe(dict.configurator.edit.blockRemoved);
    expect(blockIds(page.pageKey)).not.toContain(block.blockId);
    await settle();
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(pageNode(page.pageKey).querySelector(`[data-element-id="${elementId}"]`)).not.toBeNull();
  });

  it("Delete in a field removes nothing; Rimuovi elemento removes the element", () => {
    const pages = fixture();
    setup(false, pages);
    const page = pages.presentazione_16_9[0]!;
    // Any own text of the page, inside Testi groups and rows too.
    const all = (els: readonly DocumentElement[]): DocumentElement[] => els.flatMap((e) => (e.type === "text_group" || e.type === "row" ? all(e.items) : [e]));
    const own = all(page.blocks.flatMap((b) => b.elements)).find((e) => e.type === "text" && e.text !== undefined)!;
    const text = pageNode(page.pageKey).querySelector<HTMLElement>(`[data-element-id="${own.elementId}"]`)!;
    fireEvent.click(text);
    const field = within(leftPanel()).getByLabelText(dict.configurator.text.colourField);
    fireEvent.keyDown(field, { key: "Delete" });
    expect(pageNode(page.pageKey).querySelector(`[data-element-id="${own.elementId}"]`)).not.toBeNull();
    fireEvent.click(button(dict.configurator.edit.removeElement, leftPanel()));
    expect(pageNode(page.pageKey).querySelector(`[data-element-id="${text.dataset.elementId}"]`)).toBeNull();
  });

  it("when not editable, Elementi and Rimuovi say they arrive soon and the keys change nothing", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { editable: false, onSave });
    const page = pages.presentazione_16_9[0]!;
    const block = page.blocks[0]!;
    selectBlock(page.pageKey, block.blockId);
    expect(within(elementsSection()).getByText(dict.configurator.soon)).toBeTruthy();
    fireEvent.click(elementButton(dict.configurator.elements.title));
    expect(status().textContent).toBe(`${dict.configurator.tools.elements} arriva presto.`);
    const remove = button(dict.configurator.edit.removeBlock, leftPanel());
    expect(remove.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(remove);
    expect(status().textContent).toBe(`${dict.configurator.edit.removeBlock} arriva presto.`);
    for (const key of [{ key: "Backspace" }, { key: "x", metaKey: true }, { key: "v", metaKey: true }]) fireEvent.keyDown(document.body, key);
    expect(blockIds(page.pageKey)).toEqual(page.blocks.map((b) => b.blockId));
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("in Anteprima Backspace, ⌘X and ⌘V change nothing, though the selection is kept", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const page = pages.presentazione_16_9[0]!;
    selectBlock(page.pageKey, page.blocks[0]!.blockId);
    fireEvent.keyDown(document.body, { key: "c", metaKey: true });
    fireEvent.click(button(dict.configurator.preview.enter));
    for (const key of [{ key: "Backspace" }, { key: "Delete" }, { key: "x", metaKey: true }, { key: "v", metaKey: true }]) fireEvent.keyDown(document.body, key);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(blockIds(page.pageKey)).toEqual(page.blocks.map((b) => b.blockId));
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a held Backspace removes the element only, not its block next", () => {
    const pages = fixture();
    setup(false, pages);
    const page = pages.presentazione_16_9[0]!;
    const block = page.blocks[0]!;
    fireEvent.click(blockNode(page.pageKey, block.blockId).querySelector("[data-element-id]")!);
    fireEvent.keyDown(document.body, { key: "Backspace" });
    fireEvent.keyDown(document.body, { key: "Backspace", repeat: true });
    expect(blockIds(page.pageKey)).toContain(block.blockId);
  });

  it("⌘C with text highlighted is the browser’s; Ctrl+Escape still steps out", () => {
    const pages = fixture();
    setup(false, pages);
    const page = pages.presentazione_16_9[0]!;
    selectBlock(page.pageKey, page.blocks[0]!.blockId);
    vi.spyOn(document, "getSelection").mockReturnValue({ isCollapsed: false } as Selection);
    const event = new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    vi.mocked(document.getSelection).mockRestore();
    // A modifier with any other key reaches the rest of the handler: Ctrl+Escape steps out.
    fireEvent.keyDown(document.body, { key: "Escape", ctrlKey: true });
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).toBeNull();
  });

  it("shows no empty-block hint in Anteprima", () => {
    const pages = fixture();
    setup(false, pages);
    const page = pages.presentazione_16_9[0]!;
    selectBlock(page.pageKey, page.blocks[0]!.blockId);
    fireEvent.click(elementButton(dict.configurator.elements.block));
    expect(canvas().querySelector('[data-frame="empty"]')).not.toBeNull();
    fireEvent.click(button(dict.configurator.preview.enter));
    expect(canvas().querySelector('[data-frame="empty"]')).toBeNull();
  });
});

describe("Configurator layout and background (Story 4.4a)", () => {
  const fixture = () => {
    const doc = caseHistoryV2(FORMAT_IDS);
    return Object.fromEntries(FORMAT_IDS.map((id) => [id, doc.formats[id]!.pages])) as Record<FormatId, Page[]>;
  };
  const tools = dict.configurator.tools;
  // The palette by name, so no raw colour is written here (test/tokens.test.ts).
  const [WHITE, , , LIME, BLUE] = BACKGROUND_SWATCHES;
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const section = (name: string) => within(leftPanel()).getByRole("region", { name, hidden: true });
  const layoutButton = (name: string) => button(fill(tools.layoutOption, { name }), section(tools.layout));
  const pressedLayout = () =>
    within(section(tools.layout))
      .getAllByRole("button", { hidden: true })
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.getAttribute("aria-label"));
  const shuffleButton = () => within(section(tools.layout)).queryByRole("button", { name: tools.shuffle, hidden: true });
  const swatch = (name: string) => button(name, section(tools.background));
  const colourField = () => within(section(tools.background)).getByRole("textbox", { name: tools.colourField, hidden: true }) as HTMLInputElement;
  const blockIds = (pageKey: string) => [...pageNode(pageKey).querySelectorAll<HTMLElement>("[data-block-id]")].map((b) => b.dataset.blockId);
  const selectBlock = (pageKey: string, blockId: string) => fireEvent.click(pageNode(pageKey).querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!);
  const carosello = () => fireEvent.click(button(/^Carosello/, screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true })));

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("a layout with more cells adds empty blocks, in this format only, saved once; ⌘Z and ⇧⌘Z undo and redo it", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const page = pages.carosello_1_1[0]!;
    expect(section(tools.layout).textContent).not.toContain(dict.configurator.soon);
    fireEvent.click(layoutButton("4 immagini"));
    expect(blockIds(page.pageKey)).toHaveLength(4);
    expect(blockIds(page.pageKey).slice(0, 3)).toEqual(page.blocks.map((b) => b.blockId));
    expect(pressedLayout()).toEqual(["Layout 4 immagini"]);
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = lastDoc(onSave);
    expect(sent.formats.carosello_1_1.pages[0].grid.layoutId).toBe("four");
    expect(sent.formats.carosello_1_1.pages[0].blocks[3]).toMatchObject({ elements: [], background: { kind: "colour", value: NEW_BLOCK_COLOUR } });
    expect(sent.formats.presentazione_16_9.pages).toEqual(pages.presentazione_16_9);
    expect(validateNewDocument(sent)).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(blockIds(page.pageKey)).toHaveLength(3);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(blockIds(page.pageKey)).toHaveLength(4);
  });

  it("refuses a layout that would drop filled blocks, saying how many are over", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const [intro, content] = pages.carosello_1_1;
    fireEvent.click(layoutButton("2 immagini"));
    expect(status().textContent).toBe(dict.configurator.edit.layoutOverOne);
    expect(blockIds(intro!.pageKey)).toHaveLength(3);
    selectBlock(content!.pageKey, content!.blocks[0]!.blockId);
    fireEvent.click(layoutButton("2 immagini"));
    expect(status().textContent).toBe(fill(dict.configurator.edit.layoutOver, { k: 2 }));
    expect(blockIds(content!.pageKey)).toHaveLength(4);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("Mescola cycles the page through the layouts with its number of blocks, and hides with only one", () => {
    const pages = fixture();
    setup(false, pages);
    carosello();
    fireEvent.click(shuffleButton()!);
    expect(pressedLayout()).toEqual(["Layout 3 immagini · A"]);
    fireEvent.click(shuffleButton()!);
    expect(pressedLayout()).toEqual(["Layout 3 immagini · B"]);
    fireEvent.click(shuffleButton()!);
    expect(pressedLayout()).toEqual(["Layout 3 immagini · A"]);
    fireEvent.click(button(/^Video/, screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true })));
    expect(shuffleButton()).toBeNull();
  });

  it("Mescola is saved, keeps the selection, and ⌘Z and ⇧⌘Z undo and redo it", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const page = pages.carosello_1_1[0]!;
    selectBlock(page.pageKey, page.blocks[1]!.blockId);
    fireEvent.click(shuffleButton()!);
    fireEvent.click(shuffleButton()!);
    expect(pressedLayout()).toEqual(["Layout 3 immagini · B"]);
    expect(button(dict.configurator.edit.removeBlock, leftPanel())).toBeTruthy();
    await settle();
    expect(lastDoc(onSave).formats.carosello_1_1.pages[0].grid.layoutId).toBe("three_b");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(pressedLayout()).toEqual(["Layout 3 immagini · A"]);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(pressedLayout()).toEqual(["Layout 3 immagini · B"]);
  });

  it("Sfondo sets the selected block's colour, else the page's, from a swatch or a typed colour", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const page = pages.presentazione_16_9[0]!;
    expect(section(tools.background).textContent).toContain(fill(tools.backgroundOf, { what: tools.backgroundPage }));
    expect(swatch(tools.swatches[WHITE]).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(swatch(tools.swatches.transparent));
    expect(colourField().value).toBe(tools.swatches.transparent);

    // An element selected: Sfondo acts on its block.
    fireEvent.click(pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0]!.blockId}"] [data-element-id]`)!);
    expect(section(tools.background).textContent).toContain(fill(tools.backgroundOf, { what: tools.backgroundBlock }));
    fireEvent.click(swatch(tools.swatches[BLUE]));
    expect(swatch(tools.swatches[BLUE]).getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(colourField(), { target: { value: "defe56" } });
    fireEvent.keyDown(colourField(), { key: "Enter" });
    expect(colourField().value).toBe(LIME.toUpperCase());
    await settle();
    const sent = lastDoc(onSave).formats.presentazione_16_9.pages[0];
    expect(sent.background).toEqual({ kind: "transparent" });
    expect(sent.blocks[0].background).toEqual({ kind: "colour", value: LIME });
    expect(sent.blocks[1].background).toEqual(page.blocks[1]!.background);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(swatch(tools.swatches[BLUE]).getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(colourField().value).toBe(LIME.toUpperCase());
  });

  it("Enter keeps the focus in the colour field; Escape puts the colour back and changes nothing", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const field = colourField();
    field.focus();
    fireEvent.change(field, { target: { value: "2977ff" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(colourField()).toBe(field);
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: "defe56" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(field.value).toBe(BLUE.toUpperCase());
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(lastDoc(onSave).formats.presentazione_16_9.pages[0].background).toEqual({ kind: "colour", value: BLUE });
  });

  it("Tinta unita on an image background goes back to the default colour", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    const page = pages.presentazione_16_9[2]!;
    expect(page.background.kind).toBe("image");
    fireEvent.click(rightPanel().querySelector<HTMLElement>(`[data-thumb="${page.pageKey}"]`)!);
    expect(button(tools.image, section(tools.background)).getAttribute("aria-pressed")).toBe("true");
    expect(colourField().value).toBe("");
    fireEvent.click(button(tools.solid, section(tools.background)));
    expect(swatch(tools.swatches[WHITE]).getAttribute("aria-pressed")).toBe("true");
    await settle();
    expect(lastDoc(onSave).formats.presentazione_16_9.pages[2].background).toEqual({ kind: "colour", value: WHITE });
  });

  it("a typed value that isn't a colour says how to write one and changes nothing; Immagine arrives with 4.5", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    fireEvent.change(colourField(), { target: { value: "blu" } });
    fireEvent.blur(colourField());
    expect(status().textContent).toBe(dict.configurator.edit.badColour);
    expect(colourField().value).toBe(WHITE.toUpperCase());
    fireEvent.click(button(tools.image, section(tools.background)));
    expect(status().textContent).toBe(`${tools.image} arriva presto.`);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("when not editable, Layout, Mescola and Sfondo say they arrive soon and change nothing", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { editable: false, onSave });
    carosello();
    expect(section(tools.layout).textContent).toContain(dict.configurator.soon);
    fireEvent.click(layoutButton("4 immagini"));
    expect(status().textContent).toBe(`${tools.layout} arriva presto.`);
    fireEvent.click(shuffleButton()!);
    expect(status().textContent).toBe(`${tools.shuffle} arriva presto.`);
    fireEvent.click(swatch(tools.swatches[BLUE]));
    expect(status().textContent).toBe(`${tools.background} arriva presto.`);
    fireEvent.change(colourField(), { target: { value: BLUE } });
    fireEvent.blur(colourField());
    expect(blockIds(pages.carosello_1_1[0]!.pageKey)).toHaveLength(3);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Configurator resize (Story 4.4b)", () => {
  /** Carosello's first page on `layoutId`, cut to as many blocks as it has cells. */
  const withLayout = (layoutId: string) => {
    const doc = caseHistoryV2(FORMAT_IDS);
    const pages = Object.fromEntries(FORMAT_IDS.map((id) => [id, doc.formats[id]!.pages])) as Record<FormatId, Page[]>;
    const layout = layouts("carosello_1_1", "mac-case@1").find((l) => l.layoutId === layoutId)!;
    const page = pages.carosello_1_1[1]!; // four blocks
    page.blocks = page.blocks.slice(0, layout.areas.length);
    page.grid = { layoutId, rows: [...layout.rows], cols: [...layout.cols] };
    return { pages, page };
  };
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const handles = (pageKey: string) => [...pageNode(pageKey).querySelectorAll<HTMLElement>("[data-resize]")].map((h) => h.dataset.resize);
  const handle = (pageKey: string, key: string) => pageNode(pageKey).querySelector<HTMLElement>(`[data-resize="${key}"]`)!;
  const bento = (pageKey: string) => pageNode(pageKey).querySelector<HTMLElement>(".mr-bento")!;
  const carosello = () => fireEvent.click(button(/^Carosello/, screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true })));

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    // happy-dom has no layout: the grid is 1000 × 1000 px at the page's corner, with no gap.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const size = this.classList.contains("mr-bento") ? 1000 : 0;
      return { top: 0, left: 0, right: size, bottom: size, width: size, height: size, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
  });

  it("draws a handle on each border of the page's layout, and none on a grid that isn't a layout", () => {
    const { pages, page } = withLayout("three_a");
    const fallback = pages.carosello_1_1[2]!;
    fallback.grid = { layoutId: "column", rows: fallback.blocks.map(() => 1), cols: [1] };
    setup(false, pages);
    carosello();
    expect(handles(page.pageKey)).toEqual(["col-0-0", "row-0-0"]);
    // The fixture's first page is on a layout id the format doesn't have.
    expect(handles(pages.carosello_1_1[0]!.pageKey)).toEqual([]);
    expect(handles(fallback.pageKey)).toEqual([]);
  });

  it("a drag moves the line live and saves the new sizes once on release; ⌘Z and ⇧⌘Z undo and redo it", async () => {
    const { pages, page } = withLayout("two");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const line = handle(page.pageKey, "col-0-0");
    fireEvent.pointerDown(line, { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 600, clientY: 500, pointerId: 1 });
    expect(bento(page.pageKey).style.gridTemplate).toContain("minmax(0,1.2fr) minmax(0,0.8fr)");
    expect(line.hasAttribute("data-warn")).toBe(false);
    fireEvent.pointerUp(line, { clientX: 600, clientY: 500, pointerId: 1 });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = lastDoc(onSave);
    expect(saved.formats.carosello_1_1.pages[1].grid).toEqual({ layoutId: "two", rows: [1], cols: [1.2, 0.8] });
    expect(saved.formats.presentazione_16_9.pages).toEqual(pages.presentazione_16_9);
    expect(validateNewDocument(saved)).toMatchObject({ ok: true });
    expect(bento(page.pageKey).style.gridTemplate).toContain("1.2fr");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(bento(page.pageKey).style.gridTemplate).toContain("minmax(0,1fr) minmax(0,1fr)");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(bento(page.pageKey).style.gridTemplate).toContain("1.2fr");
  });

  it("a press without a move saves nothing and keeps the selection", async () => {
    const { pages, page } = withLayout("two");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    fireEvent.click(pageNode(page.pageKey).querySelector(`[data-block-id="${page.blocks[0]!.blockId}"]`)!);
    const line = handle(page.pageKey, "col-0-0");
    fireEvent.pointerDown(line, { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(line, { clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.click(line);
    expect(pageNode(page.pageKey).querySelector('[data-frame="block"]')).not.toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("holds a track at 12% and refuses a move that overflows a text, turning the handle orange; the last good sizes are saved", async () => {
    const { pages, page } = withLayout("two");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const line = handle(page.pageKey, "col-0-0");
    fireEvent.pointerDown(line, { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: -500, clientY: 500, pointerId: 1 });
    expect(line.hasAttribute("data-warn")).toBe(true);
    expect(bento(page.pageKey).style.gridTemplate).toContain("minmax(0,0.24fr)");
    // The right block's text no longer fits once it is narrower than 0.7fr.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      const narrow = /minmax\(0,0\.[0-6]\d*fr\)$/.test(this.parentElement?.style.gridTemplate ?? "");
      return this.dataset.blockId === page.blocks[1]!.blockId && narrow ? 50 : 0;
    });
    fireEvent.pointerMove(line, { clientX: 650, clientY: 500, pointerId: 1 });
    expect(line.hasAttribute("data-warn")).toBe(false);
    fireEvent.pointerMove(line, { clientX: 700, clientY: 500, pointerId: 1 });
    expect(line.hasAttribute("data-warn")).toBe(true);
    expect(bento(page.pageKey).style.gridTemplate).toContain("minmax(0,1.3fr) minmax(0,0.7fr)");
    fireEvent.pointerUp(line, { clientX: 700, clientY: 500, pointerId: 1 });
    await settle();
    expect(lastDoc(onSave).formats.carosello_1_1.pages[1].grid.cols).toEqual([1.3, 0.7]);
  });

  it("drags a row border along y and saves the rows only", async () => {
    const { pages, page } = withLayout("four");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const line = handle(page.pageKey, "row-0-0");
    fireEvent.pointerDown(line, { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 900, clientY: 400, pointerId: 1 });
    expect(bento(page.pageKey).style.gridTemplate).toMatch(/^minmax\(0,0\.8fr\) minmax\(0,1\.2fr\) \//);
    fireEvent.pointerUp(line, { clientX: 900, clientY: 400, pointerId: 1 });
    await settle();
    expect(lastDoc(onSave).formats.carosello_1_1.pages[1].grid).toEqual({ layoutId: "four", rows: [0.8, 1.2], cols: [1, 1] });
  });

  it("allows a move while a text overflows already, warning only for a new overflow", async () => {
    const { pages, page } = withLayout("two");
    const onSave = vi.fn(savedOk);
    // The left block overflows from the start, whatever the sizes.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.dataset.blockId === page.blocks[0]!.blockId ? 50 : 0;
    });
    setup(false, pages, { onSave });
    carosello();
    const line = handle(page.pageKey, "col-0-0");
    fireEvent.pointerDown(line, { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 400, clientY: 500, pointerId: 1 });
    expect(line.hasAttribute("data-warn")).toBe(false);
    fireEvent.pointerUp(line, { clientX: 400, clientY: 500, pointerId: 1 });
    await settle();
    expect(lastDoc(onSave).formats.carosello_1_1.pages[1].grid.cols).toEqual([0.8, 1.2]);
  });

  it("a cancelled pointer, or another pointer, saves nothing and puts the grid back", async () => {
    const { pages, page } = withLayout("two");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const line = handle(page.pageKey, "col-0-0");
    const before = bento(page.pageKey).style.gridTemplate;
    fireEvent.pointerDown(line, { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 600, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line, { clientX: 900, clientY: 500, pointerId: 2 });
    fireEvent.pointerUp(line, { clientX: 900, clientY: 500, pointerId: 2 });
    expect(bento(page.pageKey).style.gridTemplate).toContain("1.2fr");
    fireEvent.pointerCancel(line, { pointerId: 1 });
    expect(bento(page.pageKey).style.gridTemplate).toBe(before);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("drops a drag when the page changes under it (⌘Z mid-drag): the release saves nothing", async () => {
    const { pages, page } = withLayout("two");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    carosello();
    const line = () => handle(page.pageKey, "col-0-0");
    fireEvent.pointerDown(line(), { button: 0, clientX: 500, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line(), { clientX: 600, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(line(), { clientX: 600, clientY: 500, pointerId: 1 });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(line(), { button: 0, clientX: 600, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(line(), { clientX: 300, clientY: 500, pointerId: 1 });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(bento(page.pageKey).style.gridTemplate).toContain("minmax(0,1fr) minmax(0,1fr)");
    fireEvent.pointerUp(line(), { clientX: 300, clientY: 500, pointerId: 1 });
    await settle();
    expect(lastDoc(onSave).formats.carosello_1_1.pages[1].grid.cols).toEqual([1, 1]);
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(bento(page.pageKey).style.gridTemplate).toContain("minmax(0,1fr) minmax(0,1fr)");
  });

  it("shows no handles when the case can't be edited, or in Anteprima", () => {
    const { pages, page } = withLayout("two");
    setup(false, pages, { editable: false });
    carosello();
    expect(handles(page.pageKey)).toEqual([]);
    cleanup();
    setup(false, pages);
    fireEvent.click(button(dict.configurator.preview.enter));
    expect(document.querySelectorAll("[data-resize]")).toHaveLength(0);
  });
});

describe("Configurator Pagine di default (Story 4.4c)", () => {
  const draft = () =>
    buildTestDraft({
      images: [IMAGE],
      assetIds: [IMAGE],
      form: { context: "Lumen non aveva una voce online.", solution: "", results: [], testimonialQuote: "" },
      newId: (() => {
        let n = 0;
        return () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, "0")}`;
      })(),
    });
  const TEXTS = testDraftTexts({ context: "Lumen non aveva una voce online.", solution: "" }, [IMAGE]);
  const pagesOf = (doc: ReturnType<typeof draft>) => Object.fromEntries(FORMAT_IDS.map((id) => [id, doc.formats[id]!.pages])) as Record<FormatId, Page[]>;
  const tools = dict.configurator.tools;
  const section = () => within(leftPanel()).getByRole("region", { name: tools.defaultPages, hidden: true });
  const defaultButton = (name: string) => button(name, section());
  const pageKeys = () => [...canvas().querySelectorAll<HTMLElement>("[data-canvas-page]")].map((p) => p.dataset.canvasPage);
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const carosello = () => fireEvent.click(button(/^Carosello/, screen.getByRole("group", { name: dict.configurator.formats.label, hidden: true })));

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("Carosello Intro brings back Sfida and Idea after the cover, in this format only, saved once; ⌘Z and ⇧⌘Z undo and redo it", async () => {
    const doc = draft();
    const pages = pagesOf(doc);
    pages.carosello_1_1 = pages.carosello_1_1.filter((p) => p.pageKey !== "intro-sfida" && p.pageKey !== "intro-idea");
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave, generatedTexts: generatedTextsOf(doc), images: [IMAGE] });
    carosello();
    expect(section().textContent).not.toContain(dict.configurator.soon);
    fireEvent.click(defaultButton("Intro"));
    expect(pageKeys()).toEqual(["intro", "intro-sfida", "intro-idea", "content", "closing"]);
    expect(pageNode("intro-sfida").textContent).toContain(TEXTS.challengeHead.text);
    expect(leftPanel().textContent).toContain(dict.configurator.crumbs.page);
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = lastDoc(onSave);
    expect(sent.formats.carosello_1_1.pages.map((p: Page) => p.pageKey)).toEqual(["intro", "intro-sfida", "intro-idea", "content", "closing"]);
    // The cover's photo comes from the image pool.
    expect(sent.formats.carosello_1_1.pages[0].blocks[0].background).toEqual({ kind: "image", assetId: IMAGE });
    expect(sent.formats.presentazione_16_9.pages).toEqual(pages.presentazione_16_9);
    expect(validateNewDocument(sent)).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(pageKeys()).toEqual(["intro", "content", "closing"]);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(pageKeys()).toEqual(["intro", "intro-sfida", "intro-idea", "content", "closing"]);
  });

  it("puts the generated texts back on the selected page", async () => {
    const doc = draft();
    const pages = pagesOf(doc);
    const edited = structuredClone(pages.presentazione_16_9);
    const titleId = ownTextIds(edited[0]!).find((id) => textElementAt(edited, "intro", id)?.text === TEXTS.title.text)!;
    const title = textElementAt(edited, "intro", titleId)!;
    title.text = "Un titolo riscritto";
    pages.presentazione_16_9 = edited;
    setup(false, pages, { generatedTexts: generatedTextsOf(doc), images: [IMAGE] });
    expect(pageNode("intro").textContent).toContain("Un titolo riscritto");
    fireEvent.click(defaultButton("Intro"));
    expect(pageNode("intro").textContent).not.toContain("Un titolo riscritto");
    expect(pageNode("intro").textContent).toContain(TEXTS.title.text);
  });

  it("Risultati e testimonial takes the case's result rows", async () => {
    const doc = draft();
    const onSave = vi.fn(savedOk);
    const results = [
      { label: "richieste", value: "+38%" },
      { label: "visite", value: "2x" },
    ];
    setup(false, pagesOf(doc), { onSave, generatedTexts: generatedTextsOf(doc), images: [IMAGE], values: { ...VALUES, case: { ...VALUES.case, results } } });
    fireEvent.click(defaultButton("Risultati e testimonial"));
    await settle();
    const restored = JSON.stringify(lastDoc(onSave).formats.presentazione_16_9.pages[0]);
    expect(restored.match(/"field":"resultValue"/g)).toHaveLength(2);
  });

  it("Risultati e testimonial on a case with neither says so and changes nothing", async () => {
    const doc = draft();
    const onSave = vi.fn(savedOk);
    setup(false, pagesOf(doc), { onSave, generatedTexts: generatedTextsOf(doc), images: [IMAGE] });
    fireEvent.click(defaultButton("Risultati e testimonial"));
    expect(status().textContent).toBe(dict.configurator.edit.defaultEmpty);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("when not editable, Pagine di default says it arrives soon and changes nothing", async () => {
    const doc = draft();
    const onSave = vi.fn(savedOk);
    setup(false, pagesOf(doc), { editable: false, onSave, generatedTexts: generatedTextsOf(doc), images: [IMAGE] });
    expect(section().textContent).toContain(dict.configurator.soon);
    fireEvent.click(defaultButton("3 immagini"));
    expect(status().textContent).toBe(`${tools.defaultPages} arriva presto.`);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("with no revision yet (Bozza di prova), Pagine di default says it arrives soon and changes nothing", () => {
    const doc = draft();
    setup(true, pagesOf(doc), { generatedTexts: generatedTextsOf(doc), images: [IMAGE] });
    const before = pageNode("intro").innerHTML;
    fireEvent.click(defaultButton("Intro"));
    expect(status().textContent).toBe(`${tools.defaultPages} arriva presto.`);
    expect(pageNode("intro").innerHTML).toBe(before);
  });
});

describe("Configurator Media tab (Story 4.5a)", () => {
  const openMedia = () => fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
  const tiles = () => [...rightPanel().querySelectorAll<HTMLElement>("[data-media]")];
  const star = (name: string, on: boolean) =>
    button(`${on ? dict.configurator.media.favourite.remove : dict.configurator.media.favourite.add}: ${name}`, rightPanel());
  const dropZone = () => button(`${dict.configurator.media.drop.lead}, ${dict.configurator.media.drop.choose}`, rightPanel());
  const drop = (files: File[]) => fireEvent.drop(dropZone(), { dataTransfer: { files, dropEffect: "copy" } });
  const flush = async () => {
    for (let i = 0; i < 10; i++) await act(async () => {});
  };

  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset();
    uploads.uploadFile.mockReset().mockResolvedValue(undefined);
    actions.listAssets.mockResolvedValue({ ok: true, value: MEDIA });
    actions.setAssetFavourite.mockResolvedValue({ ok: true, value: undefined });
  });

  it("lists the case's images and videos, marks those on a page of the format in view, and searches by file name", () => {
    setup();
    expect(button(dict.configurator.tabs.pages, rightPanel()).getAttribute("aria-pressed")).toBe("true");
    openMedia();
    expect(button(dict.configurator.tabs.media, rightPanel()).getAttribute("aria-pressed")).toBe("true");
    expect(tiles().map((t) => t.dataset.media)).toEqual([IMAGE, VIDEO]);
    expect(tiles().map((t) => t.dataset.onPage !== undefined)).toEqual([true, false]);
    expect(tiles()[0].textContent).toContain(dict.configurator.media.onPage);
    expect(rightPanel().querySelector("[data-thumb]")?.closest("[hidden]")).not.toBeNull();

    const search = within(rightPanel()).getByLabelText(dict.configurator.search.mediaLabel);
    fireEvent.change(search, { target: { value: "reel" } });
    expect(tiles().map((t) => t.dataset.media)).toEqual([VIDEO]);
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(rightPanel().textContent).toContain(fill(dict.configurator.media.noMatch, { query: "zzz" }));
  });

  it("drops the on-page mark when the format in view no longer shows the file", () => {
    const without = { ...formats, carosello_1_1: formats.carosello_1_1.map((page) => ({ ...page, blocks: [] })) };
    setup(false, without);
    openMedia();
    expect(tiles()[0].dataset.onPage).toBe("");
    fireEvent.click(button(/Carosello/));
    expect(tiles()[0].dataset.onPage).toBeUndefined();
  });

  it("switches back to Pagine with its thumbnails", () => {
    setup();
    openMedia();
    fireEvent.click(button(dict.configurator.tabs.pages, rightPanel()));
    expect(rightPanel().querySelector("[data-thumb]")?.closest("[hidden]")).toBeNull();
    expect(within(rightPanel()).getByLabelText(dict.configurator.search.label)).toBeTruthy();
  });

  it("says when the case has no images or videos yet", () => {
    setup(false, formats, { media: [] });
    openMedia();
    expect(rightPanel().textContent).toContain(dict.configurator.media.empty);
  });

  it("stars a file at once and saves it as a favourite", async () => {
    setup();
    openMedia();
    fireEvent.click(star("LUM_reel.mp4", false));
    expect(star("LUM_reel.mp4", true).getAttribute("aria-pressed")).toBe("true");
    await flush();
    expect(actions.setAssetFavourite).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: VIDEO, isFavourite: true });
    expect(star("LUM_reel.mp4", true)).toBeTruthy();
  });

  it("puts the star back and says so when the save fails", async () => {
    actions.setAssetFavourite.mockResolvedValue({ ok: false, status: 500, error: { code: "ASSET_WRITE_FAILED", message: "m" } });
    setup();
    openMedia();
    fireEvent.click(star("LUM_cover.jpg", true));
    await flush();
    expect(actions.setAssetFavourite).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: IMAGE, isFavourite: false });
    expect(star("LUM_cover.jpg", true).getAttribute("aria-pressed")).toBe("true");
    expect(status().textContent).toBe(dict.wizard.material.errors.favourite);
  });

  it("uploads dropped images and videos to the case's Media and lists them; another type is refused by name without a call", async () => {
    const added = listed("bbbbbbbb-0000-4000-8000-000000000003", "image", "nuova.png");
    actions.presignAssetUpload.mockResolvedValue({ ok: true, value: { assetId: added.id, url: "https://storage.test/u", method: "PUT", headers: {} } });
    actions.confirmAssetUpload.mockResolvedValue({ ok: true, value: { id: added.id } });
    actions.listAssets.mockResolvedValue({ ok: true, value: [...MEDIA, added, listed("bbbbbbbb-0000-4000-8000-000000000004", "image", "x.pdf", { kind: "document" as never })] });
    setup();
    openMedia();
    drop([new File(["x"], "nuova.png", { type: "image/png" }), new File(["x"], "brief.pdf", { type: "application/pdf" })]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(1);
    expect(actions.presignAssetUpload).toHaveBeenCalledWith({ caseId: CASE_ID, contentType: "image/png", sizeBytes: 1 });
    expect(actions.confirmAssetUpload).toHaveBeenCalledWith({ caseId: CASE_ID, assetId: added.id, contentType: "image/png", fileName: "nuova.png" });
    expect(tiles().map((t) => t.dataset.media)).toEqual([IMAGE, VIDEO, added.id]);
    expect(status().textContent).toContain(fill(dict.wizard.material.announce.done, { name: "nuova.png" }));
    expect(status().textContent).toContain(fill(dict.wizard.material.announce.error, { name: "brief.pdf", message: dict.configurator.media.errors.type }));
  });

  it("names a file the server refuses, without retrying it", async () => {
    actions.presignAssetUpload.mockResolvedValue({ ok: false, status: 409, error: { code: "FILE_LIMIT_REACHED", message: "m" } });
    setup();
    openMedia();
    drop([new File(["x"], "troppi.jpg", { type: "image/jpeg" })]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(1);
    expect(status().textContent).toBe(fill(dict.wizard.material.announce.error, { name: "troppi.jpg", message: fill(dict.wizard.material.errors.limit, { max: 20 }) }));
    expect(tiles()).toHaveLength(2);
  });

  it("retries a failed upload once, then says it did not go", async () => {
    actions.presignAssetUpload.mockResolvedValue({ ok: true, value: { assetId: "bbbbbbbb-0000-4000-8000-000000000009", url: "https://storage.test/u", method: "PUT", headers: {} } });
    uploads.uploadFile.mockRejectedValue(new Error("network"));
    setup();
    openMedia();
    drop([new File(["x"], "lenta.jpg", { type: "image/jpeg" })]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(2);
    expect(status().textContent).toBe(fill(dict.wizard.material.announce.error, { name: "lenta.jpg", message: dict.wizard.material.errors.failed }));
  });

  it("refuses a file over the size limit by name, without a call", async () => {
    setup(false, formats, {});
    openMedia();
    const big = new File(["x"], "enorme.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: MEDIA_RULES.maxFileBytes + 1 });
    drop([big]);
    await flush();
    expect(actions.presignAssetUpload).not.toHaveBeenCalled();
    expect(status().textContent).toBe(fill(dict.wizard.material.announce.error, { name: "enorme.mp4", message: fill(dict.wizard.material.errors.tooLarge, { size: 50 }) }));
  });

  it("turns the drop zone off when storage isn't configured, and says so on a later drop", async () => {
    actions.presignAssetUpload.mockResolvedValue({ ok: false, status: 503, error: { code: "STORAGE_NOT_CONFIGURED", message: "m" } });
    setup();
    openMedia();
    drop([new File(["x"], "a.jpg", { type: "image/jpeg" })]);
    await flush();
    expect(status().textContent).toBe(dict.wizard.material.errors.storage);
    expect(dropZone().getAttribute("aria-disabled")).toBe("true");
    drop([new File(["x"], "b.jpg", { type: "image/jpeg" })]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(1);
  });

  it("counts a file as uploaded when its confirm failed late but it was stored after all", async () => {
    const added = listed("bbbbbbbb-0000-4000-8000-000000000005", "image", "tardi.jpg");
    actions.presignAssetUpload.mockResolvedValue({ ok: true, value: { assetId: added.id, url: "https://storage.test/u", method: "PUT", headers: {} } });
    actions.confirmAssetUpload.mockResolvedValue({ ok: false, status: 500, error: { code: "ASSET_WRITE_FAILED", message: "m" } });
    actions.listAssets.mockResolvedValue({ ok: true, value: [...MEDIA, added] });
    setup();
    openMedia();
    drop([new File(["x"], "tardi.jpg", { type: "image/jpeg" })]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(1);
    expect(status().textContent).toBe(fill(dict.wizard.material.announce.done, { name: "tardi.jpg" }));
    expect(tiles().map((t) => t.dataset.media)).toContain(added.id);
  });

  it("reads the list again while a thumbnail is being made, then shows it", async () => {
    vi.useFakeTimers();
    const pending = listed(VIDEO, "video", "LUM_reel.mp4", { thumbnailUrl: null, thumbnailPending: true });
    actions.listAssets.mockResolvedValue({ ok: true, value: [MEDIA[0], { ...pending, thumbnailUrl: "https://cdn.test/poster.webp", thumbnailPending: false }] });
    setup(false, formats, { media: [MEDIA[0], pending] });
    openMedia();
    expect(tiles()[1].querySelector("img")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(actions.listAssets).toHaveBeenCalledWith({ caseId: CASE_ID });
    expect(tiles()[1].querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/poster.webp");
  });

  it("opens the file picker from the keyboard", () => {
    setup();
    openMedia();
    const picker = rightPanel().querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(picker, "click").mockImplementation(() => {});
    fireEvent.keyDown(dropZone(), { key: "Enter" });
    fireEvent.keyDown(dropZone(), { key: " " });
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("offers no recolour, filter or effect control", () => {
    setup();
    openMedia();
    expect(rightPanel().textContent).not.toMatch(/colora|filtr|effett/i);
  });
});
