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

function setup(trial = false) {
  return render(
    <Configurator
      header={{ name: "Rebrand Lumen", code: "LUM-2026-01", status: "in_review" }}
      back={{ href: "/case-studies", label: dict.configurator.back }}
      template="mac-case@1"
      formats={formats}
      assets={{ [IMAGE]: { url: "https://cdn.test/a.webp", kind: "image" } }}
      values={VALUES}
      trial={trial}
      theme="system"
    />,
  );
}

const canvas = () => screen.getByRole("region", { name: dict.configurator.canvas.label, hidden: true });
const leftPanel = () => screen.getByRole("complementary", { name: dict.configurator.panels.left, hidden: true });
const rightPanel = () => screen.getByRole("complementary", { name: dict.configurator.panels.right, hidden: true });
const pageNode = (pageKey: string) => canvas().querySelector<HTMLElement>(`[data-canvas-page="${pageKey}"]`)!;
const button = (name: string | RegExp, within_: HTMLElement = document.body) => within(within_).getByRole("button", { name, hidden: true });
const status = () => screen.getByRole("status", { hidden: true });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
    expect(screen.queryByRole("complementary", { name: dict.configurator.panels.left, hidden: true })).toBeNull();
    const reopen = button(dict.configurator.panels.showLeft);
    expect(document.activeElement).toBe(reopen);
    fireEvent.click(reopen);
    expect(leftPanel()).toBeTruthy();
    expect(document.activeElement).toBe(button(dict.configurator.panels.hideLeft));

    fireEvent.click(button(dict.configurator.panels.hideRight));
    expect(screen.queryByRole("complementary", { name: dict.configurator.panels.right, hidden: true })).toBeNull();
    expect(document.activeElement).toBe(button(dict.configurator.panels.showRight));
    fireEvent.click(button(dict.configurator.panels.showRight));
    expect(document.activeElement).toBe(button(dict.configurator.panels.hideRight));
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
