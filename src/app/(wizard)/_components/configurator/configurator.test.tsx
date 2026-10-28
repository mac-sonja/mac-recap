// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORMAT_IDS, starterPages, type BoundValues, type FormatId } from "@/modules/rendering";
import type { Page } from "@/modules/generation";
import { it as dict } from "@/shared/i18n/it";
import { Configurator } from "./configurator";
import { STATUS_MESSAGE_MS } from "./status-message";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";

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

function setup(trial = false, pagesByFormat: Record<FormatId, Page[]> = formats) {
  return render(
    <Configurator
      header={{ name: "Rebrand Lumen", code: "LUM-2026-01", status: "in_review" }}
      back={{ href: "/case-studies", label: dict.configurator.back }}
      template="mac-case@1"
      formats={pagesByFormat}
      assets={{ [IMAGE]: { url: "https://cdn.test/a.webp", kind: "image" } }}
      values={VALUES}
      trial={trial}
      theme="system"
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
    for (const name of [dict.configurator.undo, dict.configurator.redo, dict.configurator.approve]) {
      expect(button(name).getAttribute("aria-disabled")).toBe("true");
    }
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
    // The left panel names the selection first: the crumb Blocco, then the block's name.
    expect(leftPanel().textContent).toMatch(new RegExp(`^${dict.configurator.crumbs.block}${block.name}${dict.configurator.crumbs.page}`));

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
    fireEvent.click(button(dict.configurator.tabs.media));
    expect(status().textContent).toBe("Media arriva presto.");
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
