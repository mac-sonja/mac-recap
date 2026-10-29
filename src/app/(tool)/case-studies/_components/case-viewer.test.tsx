// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, starterPages, type BoundValues, type FormatId } from "@/modules/rendering";
import { fill, it as dict } from "@/shared/i18n/it";
import { CaseViewer } from "./case-viewer";

const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";

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

const FORMATS = starterFormats();

/** The page's part: the format and the slide, as `CaseView` holds them. */
function Harness({ formats = FORMATS, trial = false, reducedMotion = false }: { formats?: Record<FormatId, Page[]>; trial?: boolean; reducedMotion?: boolean }) {
  const [formatId, setFormatId] = useState<FormatId>(FORMAT_IDS[0]);
  const [slide, setSlide] = useState(0);
  const pages = formats[formatId];
  return (
    <CaseViewer
      formatId={formatId}
      onFormat={(next) => {
        setFormatId(next);
        setSlide(0);
      }}
      template="mac-case@1"
      pages={pages}
      assets={{ [IMAGE]: { url: "https://cdn.test/a.webp", kind: "image" } }}
      values={VALUES}
      trial={trial}
      slide={slide}
      onStep={(delta) => setSlide((s) => Math.max(0, Math.min(pages.length - 1, s + delta)))}
      caption="Rebrand Lumen"
      reducedMotion={reducedMotion}
    />
  );
}

const copy = dict.caseView.viewer;
const preview = dict.configurator.preview;
const stage = () => screen.getByRole("region", { name: dict.configurator.canvas.label, hidden: true });
const button = (name: string | RegExp) => screen.getByRole("button", { name, hidden: true });
const format = (name: string) =>
  within(document.querySelector<HTMLElement>(`[role="group"][aria-label="${dict.configurator.formats.label}"]`)!).getByRole("button", {
    name: new RegExp(`^${name}`),
    hidden: true,
  });
const counter = () => document.querySelector("[data-pager] p[aria-live]")?.textContent;
const slideEl = () => stage().querySelector<HTMLElement>("[data-slide]");
const zoomButton = () => button(/^Zoom /);

/** The stage measures 1000 × 600 px: Adatta is 952 px wide for 16:9 (inside 24 px padding), 552 px for 1:1. */
function stubStageSize() {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
}

/** A browser with the Fullscreen API: entering and leaving fire `fullscreenchange`. */
function stubFullscreen() {
  let current: Element | null = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => current });
  const change = (el: Element | null) => {
    current = el;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  const request = vi.fn(function (this: Element) {
    change(this);
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    change(null);
    return Promise.resolve();
  });
  Object.defineProperty(Element.prototype, "requestFullscreen", { configurable: true, value: request });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  return { request, exit, browserExit: () => act(() => change(null)) };
}

function unstubFullscreen() {
  for (const key of ["fullscreenEnabled", "fullscreenElement", "exitFullscreen"]) delete (document as unknown as Record<string, unknown>)[key];
  delete (Element.prototype as unknown as Record<string, unknown>).requestFullscreen;
}

beforeEach(() => {
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  unstubFullscreen();
});

describe("CaseViewer", () => {
  it("pages one slide at a time: ‹ › inactive at the ends but keeping focus, the dots and the counter follow", () => {
    render(<Harness />);
    const pages = FORMATS.presentazione_16_9;
    const n = pages.length;
    expect(stage().querySelectorAll("[data-canvas-page]")).toHaveLength(1);
    expect(counter()).toBe(fill(preview.slide, { i: 1, n, name: pages[0]!.name }));
    const dots = document.querySelectorAll("[data-pager] i");
    expect(dots).toHaveLength(n);
    expect(dots[0]!.hasAttribute("data-on")).toBe(true);

    const prev = button(preview.previous);
    prev.focus();
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(prev);
    expect(counter()).toContain(`1 di ${n}`);
    expect(document.activeElement).toBe(prev);

    const next = button(preview.next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(counter()).toBe(fill(preview.slide, { i: 3, n, name: pages[2]!.name }));
    expect(slideEl()?.dataset.slide).toBe(pages[2]!.pageKey);
    expect(document.querySelectorAll("[data-pager] i")[2]!.hasAttribute("data-on")).toBe(true);
    for (let i = 0; i < n; i++) fireEvent.click(next);
    expect(counter()).toContain(`${n} di ${n}`);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(prev.getAttribute("aria-disabled")).toBe("false");
  });

  it("opens at Adatta, where the slide fits the panel, and − + step through 50 to 200% of it, inactive at the limits", () => {
    stubStageSize();
    render(<Harness />);
    expect(zoomButton().textContent).toBe("100%");
    expect(zoomButton().getAttribute("aria-label")).toBe(fill(copy.zoomReset, { n: 100 }));
    expect(slideEl()!.style.width).toBe("952px");

    const minus = button(copy.zoomOut);
    const plus = button(copy.zoomIn);
    fireEvent.click(minus);
    expect(zoomButton().textContent).toBe("75%");
    fireEvent.click(minus);
    expect(zoomButton().textContent).toBe("50%");
    expect(slideEl()!.style.width).toBe("476px");
    expect(minus.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(minus);
    expect(zoomButton().textContent).toBe("50%");

    for (let i = 0; i < 8; i++) fireEvent.click(plus);
    expect(zoomButton().textContent).toBe("200%");
    expect(slideEl()!.style.width).toBe("1904px");
    expect(plus.getAttribute("aria-disabled")).toBe("true");
    expect(minus.getAttribute("aria-disabled")).toBe("false");
    // Larger than the panel: the stage scrolls.
    expect(stage().className).toContain("overflow-auto");
  });

  it("returns to Adatta when the % is clicked after + twice", () => {
    stubStageSize();
    render(<Harness />);
    fireEvent.click(button(copy.zoomIn));
    fireEvent.click(button(copy.zoomIn));
    expect(zoomButton().textContent).toBe("150%");
    fireEvent.click(zoomButton());
    expect(zoomButton().textContent).toBe("100%");
    expect(slideEl()!.style.width).toBe("952px");
  });

  it("goes back to slide 1 and Adatta when the format changes, fitting the new aspect", () => {
    stubStageSize();
    render(<Harness />);
    fireEvent.click(button(preview.next));
    fireEvent.click(button(copy.zoomIn));
    fireEvent.click(format("Carosello"));
    expect(counter()).toContain(`1 di ${FORMATS.carosello_1_1.length}`);
    expect(zoomButton().textContent).toBe("100%");
    expect(slideEl()!.style.width).toBe("552px");
  });

  it("draws Instagram's Reel over a Video slide, with the switch in the toolbar only on Video", () => {
    render(<Harness />);
    expect(screen.queryByRole("group", { name: preview.instagram.label, hidden: true })).toBeNull();
    fireEvent.click(format("Video"));
    const group = screen.getByRole("group", { name: preview.instagram.label, hidden: true });
    expect(document.querySelector("[data-viewer-toolbar]")!.contains(group)).toBe(true);
    expect(stage().querySelector("[data-instagram]")).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Reel", hidden: true }));
    const reel = slideEl()!.querySelector<HTMLElement>("[data-instagram]")!;
    expect(reel.dataset.instagram).toBe("reel");
    expect(reel.querySelector(".ig-text")?.textContent).toBe("Rebrand Lumen");
  });

  it("shows the Bozza di prova note", () => {
    render(<Harness trial />);
    expect(document.querySelector("[data-viewer]")!.textContent).toContain(dict.configurator.trial.title);
  });

  it("shows the canvas's empty line for a format with no pages, with the pager and zoom inactive", () => {
    render(<Harness formats={{ ...FORMATS, presentazione_16_9: [] }} />);
    expect(stage().textContent).toContain(dict.configurator.canvas.empty);
    expect(slideEl()).toBeNull();
    for (const name of [preview.previous, preview.next, copy.zoomOut, copy.zoomIn]) expect(button(name).getAttribute("aria-disabled")).toBe("true");
    expect(zoomButton().getAttribute("aria-disabled")).toBe("true");
    expect(document.querySelectorAll("[data-pager] i")).toHaveLength(0);
    expect(counter()).toBe("");
  });

  it.each([true, false])("with reduced motion %s, the slide enters with a fade only without it", (still) => {
    render(<Harness reducedMotion={still} />);
    expect(slideEl()!.className.includes("animate-enter")).toBe(!still);
  });

  it("has no full-screen button without the Fullscreen API", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: copy.fullscreen, hidden: true })).toBeNull();
  });

  it("enters full screen with only the slide on black, back at Adatta; Esc returns to the panel on the same slide", () => {
    const api = stubFullscreen();
    stubStageSize();
    render(<Harness />);
    const root = document.querySelector<HTMLElement>("[data-viewer]")!;
    fireEvent.click(button(copy.zoomIn));
    fireEvent.click(button(copy.fullscreen));
    expect(api.request).toHaveBeenCalledOnce();
    expect(api.request.mock.contexts[0]).toBe(root);
    expect(root.hasAttribute("data-fullscreen")).toBe(true);
    expect(root.className).toContain("bg-scrim");
    expect(document.querySelector("[data-viewer-toolbar]")).toBeNull();
    expect(document.querySelector("[data-pager]")).toBeNull();
    expect(stage().dataset.zoom).toBe("100");
    // No padding in full screen: the slide is as big as the screen allows (1000 × 600 → 1067 wide is too wide, so 1000).
    expect(slideEl()!.style.width).toBe("1000px");

    // Paging in full screen (the page's ← → call `onStep` the same way).
    fireEvent.click(button(preview.next));
    const controls = document.querySelector("[data-viewer-controls]")!;
    expect(controls.querySelector("p[aria-live]")?.textContent).toContain(`2 di ${FORMATS.presentazione_16_9.length}`);

    // Esc, the browser's own exit: back to the panel, same slide, Adatta.
    api.browserExit();
    expect(root.hasAttribute("data-fullscreen")).toBe(false);
    expect(counter()).toContain(`2 di ${FORMATS.presentazione_16_9.length}`);
    expect(zoomButton().textContent).toBe("100%");
  });

  it("leaves full screen with its own button", () => {
    const api = stubFullscreen();
    render(<Harness />);
    fireEvent.click(button(copy.fullscreen));
    fireEvent.click(button(copy.exitFullscreen));
    expect(api.exit).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-viewer-toolbar]")).not.toBeNull();
  });

  it("fades the full-screen controls after a still moment and shows them when the pointer moves", () => {
    stubFullscreen();
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(button(copy.fullscreen));
    const controls = () => document.querySelector<HTMLElement>("[data-viewer-controls]")!;
    expect(controls().hasAttribute("data-hidden")).toBe(false);
    act(() => vi.advanceTimersByTime(2100));
    expect(controls().hasAttribute("data-hidden")).toBe(true);
    expect(controls().className).toContain("opacity-0");
    fireEvent.mouseMove(document.querySelector("[data-viewer]")!);
    expect(controls().hasAttribute("data-hidden")).toBe(false);
  });

  it("keeps the full-screen controls visible with reduced motion", () => {
    stubFullscreen();
    vi.useFakeTimers();
    render(<Harness reducedMotion />);
    fireEvent.click(button(copy.fullscreen));
    act(() => vi.advanceTimersByTime(5000));
    expect(document.querySelector("[data-viewer-controls]")!.hasAttribute("data-hidden")).toBe(false);
  });
});
