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
import { MEDIA_DRAG_TYPE, type MediaUploadRules } from "./media-files";
import { generatedTextsOf, type GeneratedTexts } from "./default-pages";
import { ownTextIds } from "./in-place-text";
import { STATUS_MESSAGE_MS } from "./status-message";
import { BACKGROUND_SWATCHES, NEW_BLOCK_COLOUR, restartGrid } from "./page-editing";
import { TEXT_COLOURS, textElementAt } from "./text-editing";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

// The Media tab's server actions (Story 4.5a).
const actions = vi.hoisted(() => ({
  listAssets: vi.fn(),
  presignAssetUpload: vi.fn(),
  confirmAssetUpload: vi.fn(),
  setAssetFavourite: vi.fn(),
}));
vi.mock("@/app/(tool)/case-studies/actions", () => actions);
// The client logo's upload (Story 4.3d's Sostituisci logo).
const clientActions = vi.hoisted(() => ({ requestClientLogoUpload: vi.fn(), confirmClientLogoUpload: vi.fn() }));
vi.mock("@/app/(tool)/clients/actions", () => clientActions);
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
    clientMedia,
    onRenderAssets,
    onApprove,
    clientFiles,
    fields,
    fieldOptions,
    fieldActions,
    status = "in_review",
    fork,
    onFork,
    onUpdateApproved,
    onDiscard,
  }: {
    status?: ConfiguratorProps["header"]["status"];
    /** Story 4.9: the head is the approved revision, forked on the first save. */
    fork?: boolean;
    onFork?: ConfiguratorProps["onFork"];
    onUpdateApproved?: ConfiguratorProps["onUpdateApproved"];
    onDiscard?: ConfiguratorProps["onDiscard"];
    editable?: boolean;
    onSave?: SaveFn;
    generatedTexts?: GeneratedTexts;
    images?: readonly string[];
    values?: BoundValues;
    media?: readonly ListedAsset[];
    clientMedia?: readonly ListedAsset[];
    onRenderAssets?: ConfiguratorProps["onRenderAssets"];
    onApprove?: ConfiguratorProps["onApprove"];
    clientFiles?: ConfiguratorProps["clientFiles"];
    fields?: ConfiguratorProps["fields"];
    fieldOptions?: ConfiguratorProps["fieldOptions"];
    fieldActions?: ConfiguratorProps["fieldActions"];
  } = {},
) {
  return render(
    <Configurator
      caseId={CASE_ID}
      revision={trial ? null : { id: REVISION_ID, version: 4, editable, kind: "case_history", ...(fork === undefined ? {} : { fork }) }}
      onSave={onSave}
      header={{ name: "Rebrand Lumen", code: "LUM-2026-01", status }}
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
      clientMedia={clientMedia}
      mediaRules={MEDIA_RULES}
      onRenderAssets={onRenderAssets}
      onApprove={onApprove}
      headVersion={7}
      onFork={onFork}
      onUpdateApproved={onUpdateApproved}
      onDiscard={onDiscard}
      clientFiles={clientFiles}
      fields={fields}
      fieldOptions={fieldOptions}
      fieldActions={fieldActions}
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

  it("shows the left panel's tools in place, inactive when the case can't be edited; pressing one says it comes soon for 3.5 s and changes nothing", () => {
    vi.useFakeTimers();
    setup(false, formats, { editable: false });
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

  it("an element with no block selected says to select one, Animazione too (Story 4.5c)", () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    fireEvent.click(elementButton(dict.configurator.elements.text));
    expect(status().textContent).toBe(dict.configurator.edit.needBlock);
    const animation = elementButton(dict.configurator.elements.animation);
    expect(animation.getAttribute("aria-disabled")).toBeNull();
    act(() => vi.advanceTimersByTime(STATUS_MESSAGE_MS));
    fireEvent.click(animation);
    expect(status().textContent).toBe(dict.configurator.edit.needBlock);
    expect(document.querySelector("dialog")).toBeNull();
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
    // The image grid shows in the colour field's place (Story 4.5b-2).
    expect(within(section(tools.background)).queryByRole("textbox", { hidden: true })).toBeNull();
    fireEvent.click(button(tools.solid, section(tools.background)));
    expect(swatch(tools.swatches[WHITE]).getAttribute("aria-pressed")).toBe("true");
    await settle();
    expect(lastDoc(onSave).formats.presentazione_16_9.pages[2].background).toEqual({ kind: "colour", value: WHITE });
  });

  it("a typed value that isn't a colour says how to write one and changes nothing", async () => {
    const pages = fixture();
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    fireEvent.change(colourField(), { target: { value: "blu" } });
    fireEvent.blur(colourField());
    expect(status().textContent).toBe(dict.configurator.edit.badColour);
    expect(colourField().value).toBe(WHITE.toUpperCase());
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

describe("Configurator placing media (Story 4.5b)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000001";
  const PHOTO_BLOCK = "eeeeeeee-0000-4000-8000-000000000002";
  const TEXT_BLOCK = "eeeeeeee-0000-4000-8000-000000000003";
  const PHOTO = "eeeeeeee-0000-4000-8000-000000000004";
  const WORDS = "eeeeeeee-0000-4000-8000-000000000005";
  const NEW = "bbbbbbbb-0000-4000-8000-000000000007";

  /** The starter pages, the first Presentazione page made of a photo block and a text block. */
  function fixture(photo: string | null = IMAGE): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const page = pages.presentazione_16_9[0]!;
    page.pageKey = P;
    page.blocks = [
      { blockId: PHOTO_BLOCK, name: "Foto", background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [{ elementId: PHOTO, type: "image", assetId: photo, fit: "crop" }] },
      {
        blockId: TEXT_BLOCK,
        name: "Testo",
        background: { kind: "colour", value: NEW_BLOCK_COLOUR },
        elements: [{ elementId: WORDS, type: "text", style: "text", text: "Ciao", provenance: "human_added" }],
      },
    ];
    restartGrid(page, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedBlocks = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => lastDoc(onSave).formats.presentazione_16_9.pages[0].blocks as Page["blocks"];
  const blockNode = (blockId: string) => pageNode(P).querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!;
  const elementNode = (elementId: string) => pageNode(P).querySelector<HTMLElement>(`[data-element-id="${elementId}"]`)!;
  const tile = (id: string) => rightPanel().querySelector<HTMLElement>(`[data-media="${id}"]`)!;
  // The tile's own button is named by its file name; the star's name starts with its action.
  const pickTile = (name: string) => fireEvent.click(button(new RegExp(`^${name.replace(".", "\\.")}`), rightPanel()));
  const openMedia = () => fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
  const drag = (id: string) => ({ dataTransfer: { types: [MEDIA_DRAG_TYPE], getData: (type: string) => (type === MEDIA_DRAG_TYPE ? id : ""), dropEffect: "none" } });
  const dropOn = (target: HTMLElement, id: string) => {
    fireEvent.dragOver(target, drag(id));
    fireEvent.drop(target, drag(id));
  };
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset();
    actions.listAssets.mockResolvedValue({ ok: true, value: MEDIA });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("a tile dropped on an image replaces its file, takes the file's kind and is one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dropOn(elementNode(PHOTO), VIDEO);
    await settle();
    expect(savedBlocks(onSave)[0]!.elements).toEqual([{ elementId: PHOTO, type: "video", assetId: VIDEO, fit: "crop" }]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    // Selected: the left panel shows the file.
    expect(leftPanel().querySelector("[data-media-name]")?.textContent).toBe("LUM_reel.mp4");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedBlocks(onSave)[0]!.elements[0]).toMatchObject({ type: "image", assetId: IMAGE });
  });

  it("a tile dropped elsewhere in a block comes in as a new element before the one under it; the block is framed while over", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.dragOver(elementNode(WORDS), drag(IMAGE));
    expect(pageNode(P).querySelector('[data-frame="drop"]')).not.toBeNull();
    fireEvent.drop(elementNode(WORDS), drag(IMAGE));
    expect(pageNode(P).querySelector('[data-frame="drop"]')).toBeNull();
    await settle();
    expect(savedBlocks(onSave)[1]!.elements.map((el) => el.type)).toEqual(["image", "text"]);
    expect(savedBlocks(onSave)[1]!.elements[0]).toMatchObject({ assetId: IMAGE, fit: "fill" });
  });

  it("a tile dropped outside every block says to drop it inside one, and changes nothing", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dropOn(pageNode(P), IMAGE);
    expect(status().textContent).toBe(dict.configurator.media.dropOffBlock);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a clicked tile fills the selected image, joins the selected block, or asks for a block", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(null), { onSave });
    openMedia();
    pickTile("LUM_cover.jpg");
    expect(status().textContent).toBe(dict.configurator.edit.needBlock);
    fireEvent.click(elementNode(PHOTO));
    pickTile("LUM_cover.jpg");
    fireEvent.click(blockNode(TEXT_BLOCK));
    pickTile("LUM_reel.mp4");
    await settle();
    expect(savedBlocks(onSave)[0]!.elements).toEqual([{ elementId: PHOTO, type: "image", assetId: IMAGE, fit: "crop" }]);
    expect(savedBlocks(onSave)[1]!.elements.map((el) => el.type)).toEqual(["text", "video"]);
    expect(tile(IMAGE).dataset.onPage).toBe("");
  });

  it("the left panel shows a selected image's file; Scegli dai Media, then Sostituisci dai Media, opens the Media tab", () => {
    setup(false, fixture(null));
    fireEvent.click(elementNode(PHOTO));
    expect(leftPanel().querySelector("[data-media-name]")?.textContent).toBe(dict.configurator.tools.file.none);
    fireEvent.click(button(dict.configurator.tools.file.choose, leftPanel()));
    const mediaTab = button(dict.configurator.tabs.media, rightPanel());
    expect(mediaTab.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(mediaTab);
    pickTile("LUM_cover.jpg");
    expect(leftPanel().querySelector("[data-media-name]")?.textContent).toBe("LUM_cover.jpg");
    expect(button(dict.configurator.tools.file.replace, leftPanel())).toBeTruthy();
  });

  it("the right panel hidden comes back on Sostituisci dai Media", () => {
    setup(false, fixture());
    fireEvent.click(button(dict.configurator.panels.hideRight));
    fireEvent.click(elementNode(PHOTO));
    fireEvent.click(button(dict.configurator.tools.file.replace, leftPanel()));
    expect(rightPanel().hidden).toBe(false);
    expect(button(dict.configurator.tabs.media, rightPanel()).getAttribute("aria-pressed")).toBe("true");
  });

  it("places nothing when the case can't be edited: tiles don't drag or click, the canvas takes no drop", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave, editable: false });
    openMedia();
    expect(tile(IMAGE).getAttribute("draggable")).toBe("false");
    expect(within(tile(IMAGE)).queryAllByRole("button", { hidden: true })).toHaveLength(1);
    dropOn(elementNode(PHOTO), VIDEO);
    fireEvent.click(elementNode(PHOTO));
    fireEvent.click(button(dict.configurator.tools.file.replace, leftPanel()));
    expect(status().textContent).toBe(fill(dict.configurator.soonMessage, { tool: dict.configurator.tools.file.replace }));
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("reads the render asset of a file listed after the page loaded, so it shows once placed", async () => {
    const added = listed(NEW, "image", "nuova.png");
    const onRenderAssets = vi.fn<NonNullable<ConfiguratorProps["onRenderAssets"]>>(async () => ({
      ok: true,
      value: { [NEW]: { url: "https://cdn.test/nuova.webp", kind: "image" } },
    }));
    actions.listAssets.mockResolvedValue({ ok: true, value: [...MEDIA, added] });
    actions.presignAssetUpload.mockResolvedValue({ ok: true, value: { assetId: NEW, url: "https://storage.test/u", method: "PUT", headers: {} } });
    actions.confirmAssetUpload.mockResolvedValue({ ok: true, value: { id: NEW } });
    uploads.uploadFile.mockReset().mockResolvedValue(undefined);
    vi.useRealTimers();
    setup(false, fixture(), { onRenderAssets });
    openMedia();
    const zone = button(`${dict.configurator.media.drop.lead}, ${dict.configurator.media.drop.choose}`, rightPanel());
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "nuova.png", { type: "image/png" })], types: ["Files"] } });
    for (let i = 0; i < 10; i++) await act(async () => {});
    // The video had no rendition when the page loaded either: it is asked for too.
    expect(onRenderAssets).toHaveBeenCalledWith({ caseId: CASE_ID, assetIds: [VIDEO, NEW] });
    dropOn(elementNode(PHOTO), NEW);
    expect(elementNode(PHOTO).querySelector("img")?.getAttribute("src")).toBe("https://cdn.test/nuova.webp");
  });

  it("asks again at the next listing for a render asset it could not read", async () => {
    const onRenderAssets = vi.fn<NonNullable<ConfiguratorProps["onRenderAssets"]>>().mockResolvedValue({ ok: false, status: 500, error: { code: "RENDITION_LOOKUP_FAILED", message: "m" } });
    actions.presignAssetUpload.mockResolvedValue({ ok: true, value: { assetId: NEW, url: "https://storage.test/u", method: "PUT", headers: {} } });
    actions.confirmAssetUpload.mockResolvedValue({ ok: true, value: { id: NEW } });
    actions.listAssets.mockResolvedValue({ ok: true, value: [...MEDIA, listed(NEW, "image", "nuova.png")] });
    uploads.uploadFile.mockReset().mockResolvedValue(undefined);
    vi.useRealTimers();
    setup(false, fixture(), { onRenderAssets });
    openMedia();
    const zone = button(`${dict.configurator.media.drop.lead}, ${dict.configurator.media.drop.choose}`, rightPanel());
    for (const name of ["a.png", "b.png"]) {
      fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], name, { type: "image/png" })], types: ["Files"] } });
      for (let i = 0; i < 10; i++) await act(async () => {});
    }
    expect(onRenderAssets).toHaveBeenCalledTimes(2);
    expect(onRenderAssets.mock.calls[1]![0].assetIds).toContain(NEW);
  });

  it("a tile dropped into a full block says so, and changes nothing", async () => {
    const onSave = vi.fn(savedOk);
    const pages = fixture();
    pages.presentazione_16_9[0]!.blocks[1]!.elements.push(
      ...Array.from({ length: 29 }, (_, i) => ({ elementId: `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, type: "divider" as const })),
    );
    setup(false, pages, { onSave });
    dropOn(elementNode(WORDS), IMAGE);
    expect(status().textContent).toBe(dict.configurator.edit.blockFull);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("the refused-save banner counts several files, and says Un file for one never listed", async () => {
    const GONE = "bbbbbbbb-0000-4000-8000-000000000099";
    const refusedFor = (assetIds: string[]) => ({ ok: false as const, status: 400, error: { code: "ASSET_NOT_ALLOWED", message: "m", assetIds } });
    const onSave = vi.fn<SaveFn>(savedOk).mockResolvedValueOnce(refusedFor([IMAGE, VIDEO])).mockResolvedValueOnce(refusedFor([GONE]));
    setup(false, fixture(), { onSave });
    dropOn(elementNode(WORDS), VIDEO);
    await settle();
    expect(screen.getByRole("alert", { hidden: true }).textContent).toContain(fill(dict.configurator.media.missing.many, { n: 2 }));
    dropOn(elementNode(WORDS), IMAGE);
    await settle();
    expect(screen.getByRole("alert", { hidden: true }).textContent).toContain(fill(dict.configurator.media.missing.one, { name: dict.configurator.media.missing.unknown }));
  });

  it("a save refused for a file no longer in the Media names it; Togli dalla pagina empties it and saves", async () => {
    const onSave = vi.fn<SaveFn>(savedOk).mockResolvedValueOnce({ ok: false, status: 400, error: { code: "ASSET_NOT_ALLOWED", message: "m", assetIds: [VIDEO] } });
    setup(false, fixture(), { onSave });
    dropOn(elementNode(PHOTO), VIDEO);
    await settle();
    const alert = screen.getByRole("alert", { hidden: true });
    expect(alert.textContent).toContain(fill(dict.configurator.media.missing.one, { name: "LUM_reel.mp4" }));
    fireEvent.click(button(dict.configurator.media.missing.remove, alert));
    await settle();
    expect(savedBlocks(onSave)[0]!.elements[0]).toMatchObject({ elementId: PHOTO, assetId: null });
    expect(screen.queryByRole("alert", { hidden: true })).toBeNull();
  });
});

describe("Configurator Adattamento and Ritaglia (Story 4.5b-3)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000011";
  const BLOCK = "eeeeeeee-0000-4000-8000-000000000012";
  const PHOTO = "eeeeeeee-0000-4000-8000-000000000013";
  const f = dict.configurator.tools.fit;

  function fixture(photo: Partial<Extract<DocumentElement, { type: "image" }>> = {}): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const page = pages.presentazione_16_9[0]!;
    page.pageKey = P;
    page.blocks = [
      { blockId: BLOCK, name: "Foto", background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [{ elementId: PHOTO, type: "image", assetId: IMAGE, fit: "fill", ...photo }] },
    ];
    restartGrid(page, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedPhoto = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => lastDoc(onSave).formats.presentazione_16_9.pages[0].blocks[0].elements[0];
  const photoNode = () => pageNode(P).querySelector<HTMLElement>(`[data-element-id="${PHOTO}"]`)!;
  const fitGroup = () => within(leftPanel()).getByRole("group", { name: f.heading, hidden: true });
  const fitButton = (name: string) => button(name, fitGroup());
  const zoom = () => within(leftPanel()).getByLabelText(f.zoom) as HTMLInputElement;
  const cropFrame = () => pageNode(P).querySelector<HTMLElement>('[data-frame="crop"]');
  const undo = () => fireEvent.keyDown(document.body, { key: "z", metaKey: true });
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    // happy-dom lays nothing out: every box is 200 × 100 at the origin.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, left: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  });

  it("Adattamento shows the fit pressed; a press sets it in one undo step, and leaving Ritaglia drops the crop", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop", crop: { x: 0.2, y: 0.3, zoom: 2 } }), { onSave });
    fireEvent.click(photoNode());
    expect(fitButton(f.crop).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(fitButton(f.fit));
    expect(fitButton(f.fit).getAttribute("aria-pressed")).toBe("true");
    expect(zoom).toThrow();
    await settle();
    expect(savedPhoto(onSave)).toEqual({ elementId: PHOTO, type: "image", assetId: IMAGE, fit: "fit" });
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    undo();
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ fit: "crop", crop: { x: 0.2, y: 0.3, zoom: 2 } });
    fireEvent.click(fitButton(f.crop));
    await settle();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("Zoom sets the crop's zoom, centred when there was none; one slide is one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop" }), { onSave });
    fireEvent.click(photoNode());
    expect(zoom().value).toBe("100");
    fireEvent.change(zoom(), { target: { value: "150" } });
    fireEvent.change(zoom(), { target: { value: "250" } });
    fireEvent.pointerUp(zoom());
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ fit: "crop", crop: { x: 0.5, y: 0.5, zoom: 2.5 } });
    expect(zoom().getAttribute("aria-valuetext")).toBe(fill(f.zoomValue, { n: 250 }));
    undo();
    await settle();
    expect(savedPhoto(onSave)).not.toHaveProperty("crop");
  });

  it("dragging the cropped image moves what shows, opposite the pointer and clamped; one drag is one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop", crop: { x: 0.5, y: 0.5, zoom: 2 } }), { onSave });
    fireEvent.click(photoNode());
    const frame = cropFrame()!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 140, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 60, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(frame, { clientX: 60, clientY: 0, pointerId: 1 });
    await settle();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(savedPhoto(onSave)).toMatchObject({ crop: { x: 0.7, y: 1, zoom: 2 } });
    // The element stays selected: a click on the frame does not select the page.
    fireEvent.click(frame);
    expect(cropFrame()).not.toBeNull();
    undo();
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { x: 0.5, y: 0.5, zoom: 2 } });
  });

  const dragBy = (dx: number, dy: number) => {
    const frame = cropFrame()!;
    fireEvent.pointerDown(frame, { button: 0, clientX: 100, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 100 + dx, clientY: 50 + dy, pointerId: 1 });
    fireEvent.pointerUp(frame, { clientX: 100 + dx, clientY: 50 + dy, pointerId: 1 });
  };

  it("two drags are two undo steps", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop", crop: { x: 0.5, y: 0.5, zoom: 1 } }), { onSave });
    fireEvent.click(photoNode());
    dragBy(-20, 0);
    dragBy(-20, 0);
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { x: 0.7 } });
    undo();
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { x: 0.6 } });
  });

  it("two Zoom slides are two undo steps, ended by pointer or by key", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop" }), { onSave });
    fireEvent.click(photoNode());
    fireEvent.change(zoom(), { target: { value: "150" } });
    fireEvent.pointerUp(zoom());
    fireEvent.change(zoom(), { target: { value: "200" } });
    fireEvent.keyUp(zoom(), { key: "ArrowRight" });
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { zoom: 2 } });
    undo();
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { zoom: 1.5 } });
  });

  it("a wobble of a pixel or two is not a drag; arrow keys on the focused frame move what shows, one step each", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop" }), { onSave });
    fireEvent.click(photoNode());
    dragBy(1, 1);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    const frame = within(pageNode(P)).getByRole("slider", { name: f.cropFrame, hidden: true });
    fireEvent.keyDown(frame, { key: "ArrowRight" });
    fireEvent.keyDown(frame, { key: "ArrowUp" });
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { x: 0.55, y: 0.45, zoom: 1 } });
    undo();
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ crop: { x: 0.55, y: 0.5 } });
  });

  it("a Media tile dropped on a selected Ritaglia image replaces its file", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop" }), { onSave });
    fireEvent.click(photoNode());
    const drag = { dataTransfer: { types: [MEDIA_DRAG_TYPE], getData: () => VIDEO, dropEffect: "none" } };
    fireEvent.dragOver(cropFrame()!, drag);
    fireEvent.drop(cropFrame()!, drag);
    await settle();
    expect(savedPhoto(onSave)).toMatchObject({ elementId: PHOTO, type: "video", assetId: VIDEO, fit: "crop" });
  });

  it("works the same on a video: Ritaglia saves and shows the drag frame", async () => {
    const onSave = vi.fn(savedOk);
    const pages = fixture();
    pages.presentazione_16_9[0]!.blocks[0]!.elements[0] = { elementId: PHOTO, type: "video", assetId: VIDEO, fit: "fill" };
    setup(false, pages, { onSave });
    fireEvent.click(photoNode());
    fireEvent.click(fitButton(f.crop));
    expect(cropFrame()).not.toBeNull();
    await settle();
    expect(savedPhoto(onSave)).toEqual({ elementId: PHOTO, type: "video", assetId: VIDEO, fit: "crop" });
  });

  it("a press without moving changes nothing; no drag frame unless the fit is Ritaglia", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop" }), { onSave });
    fireEvent.click(photoNode());
    fireEvent.pointerDown(cropFrame()!, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(cropFrame()!, { clientX: 10, clientY: 10, pointerId: 1 });
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(fitButton(f.fill));
    expect(cropFrame()).toBeNull();
  });

  it("can't be changed when the case isn't editable: the buttons say it arrives soon, and there is no drag", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture({ fit: "crop" }), { onSave, editable: false });
    fireEvent.click(photoNode());
    expect(fitButton(f.fill).getAttribute("aria-disabled")).toBe("true");
    expect(zoom().disabled).toBe(true);
    fireEvent.click(fitButton(f.fill));
    expect(status().textContent).toBe(fill(dict.configurator.soonMessage, { tool: f.heading }));
    expect(cropFrame()).toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Configurator Sfondo · Immagine (Story 4.5b-2)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000021";
  const BLOCK = "eeeeeeee-0000-4000-8000-000000000022";
  const tools = dict.configurator.tools;
  /** The template's page white (a template value). */
  const PAGE_WHITE = BACKGROUND_SWATCHES[0];

  function fixture(): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const page = pages.presentazione_16_9[0]!;
    page.pageKey = P;
    page.background = { kind: "colour", value: PAGE_WHITE };
    page.blocks = [{ blockId: BLOCK, name: "Blocco", background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [] }];
    restartGrid(page, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedPage = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => lastDoc(onSave).formats.presentazione_16_9.pages[0] as Page;
  const sfondo = () => within(leftPanel()).getByRole("region", { name: tools.background, hidden: true });
  const images = () => within(sfondo()).queryByRole("group", { name: tools.backgroundImages, hidden: true });
  const blockNode = () => pageNode(P).querySelector<HTMLElement>(`[data-block-id="${BLOCK}"]`)!;
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("Immagine shows the case's images (no videos); a pick makes it the page's background, in one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(pageNode(P));
    fireEvent.click(button(tools.image, sfondo()));
    expect(within(images()!).getAllByRole("button", { hidden: true }).map((b) => b.getAttribute("aria-label"))).toEqual(["LUM_cover.jpg"]);
    fireEvent.click(button("LUM_cover.jpg", images()!));
    expect(button("LUM_cover.jpg", images()!).getAttribute("aria-pressed")).toBe("true");
    await settle();
    expect(savedPage(onSave).background).toEqual({ kind: "image", assetId: IMAGE });
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedPage(onSave).background).toEqual({ kind: "colour", value: PAGE_WHITE });
  });

  it("a selected block takes the image; Togli immagine puts the block's grey back and shows the colours again", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode());
    fireEvent.click(button(tools.image, sfondo()));
    fireEvent.click(button("LUM_cover.jpg", images()!));
    await settle();
    expect(savedPage(onSave).blocks[0]!.background).toEqual({ kind: "image", assetId: IMAGE });
    expect(savedPage(onSave).background).toEqual({ kind: "colour", value: PAGE_WHITE });
    fireEvent.click(button(tools.removeImage, sfondo()));
    await settle();
    expect(savedPage(onSave).blocks[0]!.background).toEqual({ kind: "colour", value: NEW_BLOCK_COLOUR });
    expect(images()).toBeNull();
    expect(button(tools.solid, sfondo()).getAttribute("aria-pressed")).toBe("true");
  });

  it("the image grid closes when the selection moves to another block or page", () => {
    setup(false, fixture());
    fireEvent.click(pageNode(P));
    fireEvent.click(button(tools.image, sfondo()));
    expect(images()).not.toBeNull();
    fireEvent.click(blockNode());
    expect(images()).toBeNull();
    expect(button(tools.solid, sfondo()).getAttribute("aria-pressed")).toBe("true");
  });

  it("Togli immagine stays when the background's file is no longer among the case's images", async () => {
    const onSave = vi.fn(savedOk);
    const pages = fixture();
    pages.presentazione_16_9[0]!.background = { kind: "image", assetId: "bbbbbbbb-0000-4000-8000-000000000099" };
    setup(false, pages, { onSave, media: [] });
    fireEvent.click(pageNode(P));
    expect(sfondo().textContent).toContain(tools.noBackgroundImages);
    fireEvent.click(button(tools.removeImage, sfondo()));
    await settle();
    expect(savedPage(onSave).background).toEqual({ kind: "colour", value: PAGE_WHITE });
  });

  it("when not editable, an image background shows its grid, locked", () => {
    const pages = fixture();
    pages.presentazione_16_9[0]!.background = { kind: "image", assetId: IMAGE };
    setup(false, pages, { editable: false });
    fireEvent.click(pageNode(P));
    const tile = button("LUM_cover.jpg", images()!);
    expect(tile.getAttribute("aria-pressed")).toBe("true");
    expect(tile.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(tile);
    expect(status().textContent).toBe(`${tools.image} arriva presto.`);
  });

  it("says so when the case has no images", () => {
    setup(false, fixture(), { media: [listed(VIDEO, "video", "LUM_reel.mp4")] });
    fireEvent.click(button(tools.image, sfondo()));
    expect(sfondo().textContent).toContain(tools.noBackgroundImages);
  });

  it("when not editable, Immagine says it arrives soon and changes nothing", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave, editable: false });
    fireEvent.click(button(tools.image, sfondo()));
    expect(status().textContent).toBe(`${tools.image} arriva presto.`);
    expect(images()).toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("Configurator Animazione (Story 4.5c)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000031";
  const BLOCK = "eeeeeeee-0000-4000-8000-000000000032";
  const ANIM = "eeeeeeee-0000-4000-8000-000000000033";
  const d = dict.configurator.animationDialog;
  const t = dict.configurator.tools.animation;

  function fixture(withAnimation = false): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const page = pages.presentazione_16_9[0]!;
    page.pageKey = P;
    page.blocks = [
      {
        blockId: BLOCK,
        name: "Blocco",
        background: { kind: "colour", value: NEW_BLOCK_COLOUR },
        elements: withAnimation ? [{ elementId: ANIM, type: "animation", animation: "carousel_01", assetIds: [IMAGE], fit: "fit" }] : [],
      },
    ];
    restartGrid(page, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedElements = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => (lastDoc(onSave).formats.presentazione_16_9.pages[0] as Page).blocks[0]!.elements;
  const blockNode = () => pageNode(P).querySelector<HTMLElement>(`[data-block-id="${BLOCK}"]`)!;
  const animNode = () => pageNode(P).querySelector<HTMLElement>(`[data-element-id="${ANIM}"]`)!;
  const dialog = () => document.querySelector<HTMLElement>("dialog");
  const option = (id: string) => dialog()!.querySelector<HTMLElement>(`[data-animation-option="${id}"]`)!;
  const pick = (id: string) => fireEvent.click(dialog()!.querySelector<HTMLElement>(`[data-pick="${id}"]`)!);
  const submit = (name: string) => button(name, dialog()!);
  const elementsSection = () => within(leftPanel()).getByRole("region", { name: dict.configurator.tools.elements, hidden: true });
  const panel = () => within(leftPanel()).getByRole("region", { name: t.heading, hidden: true });
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  it("Animazione with a block selected opens the dialog; picks are numbered in order, a second click takes one out; Inserisci adds it, one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode());
    fireEvent.click(button(dict.configurator.elements.animation, elementsSection()));
    expect(dialog()).not.toBeNull();
    expect(submit(d.insert).hasAttribute("disabled")).toBe(true);
    expect(submit(d.insert).getAttribute("title")).toBe(d.needMedia);
    expect(option("carousel_01").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(option("carousel_03"));
    pick(VIDEO);
    pick(IMAGE);
    expect(dialog()!.querySelector(`[data-pick="${IMAGE}"]`)!.getAttribute("aria-label")).toBe(fill(d.picked, { name: "LUM_cover.jpg", n: 2 }));
    pick(VIDEO);
    pick(VIDEO);
    expect(dialog()!.textContent).toContain(fill(d.chosenMany, { n: 2 }));
    fireEvent.click(submit(d.insert));
    expect(dialog()).toBeNull();
    await settle();
    expect(savedElements(onSave)).toEqual([{ elementId: expect.any(String), type: "animation", animation: "carousel_03", assetIds: [IMAGE, VIDEO], fit: "fit" }]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    expect(within(panel()).getByLabelText(t.type)).toHaveProperty("value", "carousel_03");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedElements(onSave)).toEqual([]);
  });

  it("Annulla changes nothing", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode());
    fireEvent.click(button(dict.configurator.elements.animation, elementsSection()));
    pick(IMAGE);
    fireEvent.click(button(d.cancel, dialog()!));
    expect(dialog()).toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a double-click on an animation, or Cambia animazione o media, opens it with Salva; type and media change, fit and size stay", async () => {
    const onSave = vi.fn(savedOk);
    const pages = fixture(true);
    (pages.presentazione_16_9[0]!.blocks[0]!.elements[0] as { size?: number; fit: string }).size = 120;
    setup(false, pages, { onSave });
    fireEvent.doubleClick(animNode());
    expect(option("carousel_01").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(option("wheel_02"));
    pick(VIDEO);
    fireEvent.click(submit(d.save));
    await settle();
    expect(savedElements(onSave)).toEqual([{ elementId: ANIM, type: "animation", animation: "wheel_02", assetIds: [IMAGE, VIDEO], fit: "fit", size: 120 }]);
    fireEvent.click(button(t.change, panel()));
    expect(dialog()!.querySelector(`[data-pick="${VIDEO}"]`)!.getAttribute("aria-pressed")).toBe("true");
  });

  it("the panel shows Tipo, the media count, Adattamento and Dimensione; each change saves, a Dimensione slide is one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(true), { onSave });
    fireEvent.click(animNode());
    expect(panel().querySelector("[data-animation-count]")!.textContent).toBe(fill(t.mediaCount, { n: 1 }));
    fireEvent.change(within(panel()).getByLabelText(t.type), { target: { value: "carousel_04" } });
    fireEvent.click(button(dict.configurator.tools.fit.fill, panel()));
    const size = within(panel()).getByLabelText(t.size) as HTMLInputElement;
    fireEvent.change(size, { target: { value: "80" } });
    fireEvent.change(size, { target: { value: "70" } });
    fireEvent.pointerUp(size);
    await settle();
    expect(savedElements(onSave)[0]).toMatchObject({ animation: "carousel_04", fit: "fill", size: 70 });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedElements(onSave)[0]).toMatchObject({ animation: "carousel_04", fit: "fill" });
    expect(savedElements(onSave)[0]).not.toHaveProperty("size");
  });

  it("the previews draw the picked media; Esc closes without changes, and keys in the dialog never reach the page", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(true), { onSave });
    fireEvent.click(blockNode());
    fireEvent.click(button(dict.configurator.elements.animation, elementsSection()));
    expect(option("carousel_01").querySelector('img[src="https://cdn.test/a.webp"]')).toBeNull();
    pick(IMAGE);
    expect(option("carousel_01").querySelector('img[src="https://cdn.test/a.webp"]')).not.toBeNull();
    fireEvent.keyDown(dialog()!.querySelector(`[data-pick="${IMAGE}"]`)!, { key: "Backspace" });
    fireEvent.keyDown(dialog()!.querySelector(`[data-pick="${IMAGE}"]`)!, { key: "z", metaKey: true });
    expect(animNode()).not.toBeNull();
    fireEvent(dialog()!, new Event("cancel", { cancelable: true }));
    expect(dialog()).toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a full block says so before the dialog opens", () => {
    const pages = fixture();
    pages.presentazione_16_9[0]!.blocks[0]!.elements = Array.from({ length: 30 }, (_, i) => ({
      elementId: `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      type: "divider" as const,
    }));
    setup(false, pages);
    fireEvent.click(blockNode());
    fireEvent.click(button(dict.configurator.elements.animation, elementsSection()));
    expect(dialog()).toBeNull();
    expect(status().textContent).toBe(dict.configurator.edit.blockFull);
  });

  it("Cambia animazione o media and Salva change the animation in one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(true), { onSave });
    fireEvent.click(animNode());
    fireEvent.click(button(t.change, panel()));
    pick(IMAGE);
    pick(VIDEO);
    fireEvent.click(submit(d.save));
    await settle();
    expect(savedElements(onSave)[0]).toMatchObject({ animation: "carousel_01", assetIds: [VIDEO] });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedElements(onSave)[0]).toMatchObject({ assetIds: [IMAGE] });
  });

  it("says so when the case has no images or videos", () => {
    setup(false, fixture(), { media: [] });
    fireEvent.click(blockNode());
    fireEvent.click(button(dict.configurator.elements.animation, elementsSection()));
    expect(dialog()!.textContent).toContain(d.noMedia);
  });

  it("when not editable, the panel's controls are inactive and a double-click opens nothing", () => {
    setup(false, fixture(true), { editable: false });
    fireEvent.doubleClick(animNode());
    expect(dialog()).toBeNull();
    expect(status().textContent).toBe(fill(dict.configurator.soonMessage, { tool: t.change }));
    fireEvent.click(animNode());
    expect((within(panel()).getByLabelText(t.type) as HTMLSelectElement).disabled).toBe(true);
    expect((within(panel()).getByLabelText(t.size) as HTMLInputElement).disabled).toBe(true);
    expect(button(t.change, panel()).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Configurator Animazione upload (Story 4.5c-3)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000041";
  const BLOCK = "eeeeeeee-0000-4000-8000-000000000042";
  const X = "bbbbbbbb-0000-4000-8000-000000000041";
  const Y = "bbbbbbbb-0000-4000-8000-000000000042";
  const d = dict.configurator.animationDialog;
  const m = dict.wizard.material;

  function fixture(): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const page = pages.presentazione_16_9[0]!;
    page.pageKey = P;
    page.blocks = [{ blockId: BLOCK, name: "Blocco", background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [] }];
    restartGrid(page, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedElements = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => (lastDoc(onSave).formats.presentazione_16_9.pages[0] as Page).blocks[0]!.elements;
  const blockNode = () => pageNode(P).querySelector<HTMLElement>(`[data-block-id="${BLOCK}"]`)!;
  const dialog = () => document.querySelector<HTMLElement>("dialog");
  const pick = (id: string) => fireEvent.click(dialog()!.querySelector<HTMLElement>(`[data-pick="${id}"]`)!);
  const picks = () => [...dialog()!.querySelectorAll<HTMLElement>('[data-pick][aria-pressed="true"]')].sort((a, b) => order(a) - order(b)).map((b) => b.dataset.pick);
  const order = (tile: HTMLElement) => Number(tile.querySelector("b")?.textContent ?? 0);
  const elementsSection = () => within(leftPanel()).getByRole("region", { name: dict.configurator.tools.elements, hidden: true });
  const dropZone = () => button(d.drop.label, dialog()!);
  const drop = (files: File[]) => fireEvent.drop(dropZone(), { dataTransfer: { files, types: ["Files"], dropEffect: "copy" } });
  const file = (name: string, type: string) => new File(["x"], name, { type });
  const tiles = () => [...rightPanel().querySelectorAll<HTMLElement>("[data-media]")].map((t) => t.dataset.media);
  const flush = async () => {
    for (let i = 0; i < 10; i++) await act(async () => {});
  };
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }
  function open() {
    fireEvent.click(blockNode());
    fireEvent.click(button(dict.configurator.elements.animation, elementsSection()));
    expect(dialog()).not.toBeNull();
  }
  /** Each presign gives the next of `ids`; the list read again holds `media` then the files that went. */
  function server(ids: readonly string[], media: readonly ListedAsset[] = MEDIA) {
    const stored: ListedAsset[] = [];
    let n = 0;
    actions.presignAssetUpload.mockImplementation(async () => ({ ok: true, value: { assetId: ids[n++]!, url: "https://storage.test/u", method: "PUT", headers: {} } }));
    actions.confirmAssetUpload.mockImplementation(async ({ assetId, fileName, contentType }: { assetId: string; fileName: string; contentType: string }) => {
      stored.push(listed(assetId, contentType.startsWith("video/") ? "video" : "image", fileName));
      return { ok: true, value: { id: assetId } };
    });
    actions.listAssets.mockImplementation(async () => ({ ok: true, value: [...media, ...[...stored].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))] }));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    for (const fn of Object.values(actions)) fn.mockReset();
    uploads.uploadFile.mockReset().mockResolvedValue(undefined);
    actions.listAssets.mockResolvedValue({ ok: true, value: MEDIA });
  });

  it("drops two files: both go to Media, join the picks after the earlier ones in order, and Inserisci keeps that order; the Media tab lists them", async () => {
    const onSave = vi.fn(savedOk);
    server([X, Y]);
    setup(false, fixture(), { onSave });
    open();
    expect(dialog()!.textContent).toContain(d.drop.lead);
    pick(IMAGE);
    drop([file("x.jpg", "image/jpeg"), file("y.mp4", "video/mp4")]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(2);
    expect(picks()).toEqual([IMAGE, X, Y]);
    expect(status().textContent).toBe(fill(dict.configurator.media.uploaded, { n: 2 }));
    // The one status line sits inside the open dialog.
    expect(dialog()!.contains(status())).toBe(true);
    fireEvent.click(button(d.insert, dialog()!));
    await settle();
    expect(savedElements(onSave)).toEqual([{ elementId: expect.any(String), type: "animation", animation: "carousel_01", assetIds: [IMAGE, X, Y], fit: "fit" }]);
    fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
    expect(tiles()).toEqual([IMAGE, VIDEO, X, Y]);
  });

  it("scegli dai file: the files chosen upload and are picked, as a drop; Enter opens the picker", async () => {
    server([X]);
    setup(false, fixture());
    open();
    const input = dialog()!.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.keyDown(dropZone(), { key: "Enter" });
    fireEvent.keyDown(dropZone(), { key: " " });
    fireEvent.click(dropZone());
    expect(click).toHaveBeenCalledTimes(3);
    fireEvent.change(input, { target: { files: [file("x.jpg", "image/jpeg")] } });
    await flush();
    expect(picks()).toEqual([X]);
    expect(status().textContent).toBe(fill(m.announce.done, { name: "x.jpg" }));
  });

  it("shows that it is uploading while the files go", async () => {
    server([X]);
    let release: () => void = () => {};
    uploads.uploadFile.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    setup(false, fixture());
    open();
    drop([file("x.jpg", "image/jpeg")]);
    await flush();
    expect(dropZone().textContent).toContain(fill(dict.configurator.media.drop.uploading, { n: 1 }));
    release();
    await flush();
    expect(dropZone().textContent).not.toContain(fill(dict.configurator.media.drop.uploading, { n: 1 }));
    expect(picks()).toEqual([X]);
  });

  it("a file of another type is refused by name without a call; the others upload and are picked", async () => {
    server([X]);
    setup(false, fixture());
    open();
    drop([file("notes.pdf", "application/pdf"), file("x.jpg", "image/jpeg")]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(1);
    expect(actions.presignAssetUpload).toHaveBeenCalledWith({ caseId: CASE_ID, contentType: "image/jpeg", sizeBytes: 1 });
    expect(picks()).toEqual([X]);
    expect(status().textContent).toContain(fill(m.announce.error, { name: "notes.pdf", message: dict.configurator.media.errors.type }));
  });

  it("a file over the size limit is neither uploaded nor picked", async () => {
    setup(false, fixture());
    open();
    const big = file("enorme.mp4", "video/mp4");
    Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
    drop([big]);
    await flush();
    expect(actions.presignAssetUpload).not.toHaveBeenCalled();
    expect(picks()).toEqual([]);
    expect(status().textContent).toBe(fill(m.announce.error, { name: "enorme.mp4", message: fill(m.errors.tooLarge, { size: 50 }) }));
  });

  it("a full case adds nothing and says the limit", async () => {
    actions.presignAssetUpload.mockResolvedValue({ ok: false, status: 409, error: { code: "FILE_LIMIT_REACHED", message: "m" } });
    setup(false, fixture());
    open();
    drop([file("x.jpg", "image/jpeg")]);
    await flush();
    expect(picks()).toEqual([]);
    expect(status().textContent).toBe(fill(m.announce.error, { name: "x.jpg", message: fill(m.errors.limit, { max: 20 }) }));
  });

  it("one file failing after its retry: the other is picked, and the failure is named", async () => {
    server([X, Y, Y]);
    uploads.uploadFile.mockImplementation(async (_target: unknown, f: File) => {
      if (f.name === "y.jpg") throw new Error("network");
    });
    setup(false, fixture());
    open();
    drop([file("x.jpg", "image/jpeg"), file("y.jpg", "image/jpeg")]);
    await flush();
    expect(actions.presignAssetUpload).toHaveBeenCalledTimes(3);
    expect(picks()).toEqual([X]);
    expect(status().textContent).toBe(`${fill(m.announce.done, { name: "x.jpg" })} ${fill(m.announce.error, { name: "y.jpg", message: m.errors.failed })}`);
  });

  it("with 29 picked, a drop of two picks the first; both stay in Media, with a line for the other", async () => {
    const many = Array.from({ length: 29 }, (_, i) => listed(`cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, "image", `f${i + 1}.jpg`));
    server([X, Y], many);
    setup(false, fixture(), { media: many });
    open();
    for (const f of many) pick(f.id);
    drop([file("x.jpg", "image/jpeg"), file("y.jpg", "image/jpeg")]);
    await flush();
    expect(picks()).toHaveLength(30);
    expect(picks().at(-1)).toBe(X);
    expect(dialog()!.querySelector(`[data-pick="${Y}"]`)!.getAttribute("aria-pressed")).toBe("false");
    expect(status().textContent).toBe(`${fill(dict.configurator.media.uploaded, { n: 2 })} ${fill(d.overOne, { max: 30 })}`);
    fireEvent.click(button(d.cancel, dialog()!));
    fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
    expect(tiles().slice(-2)).toEqual([X, Y]);
  });

  it("with 29 picked, a drop of three picks the first and says two weren't added", async () => {
    const Z = "bbbbbbbb-0000-4000-8000-000000000043";
    const many = Array.from({ length: 29 }, (_, i) => listed(`cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, "image", `f${i + 1}.jpg`));
    server([X, Y, Z], many);
    setup(false, fixture(), { media: many });
    open();
    for (const f of many) pick(f.id);
    drop([file("x.jpg", "image/jpeg"), file("y.jpg", "image/jpeg"), file("z.jpg", "image/jpeg")]);
    await flush();
    expect(picks()).toHaveLength(30);
    expect(picks().at(-1)).toBe(X);
    expect(status().textContent).toBe(`${fill(dict.configurator.media.uploaded, { n: 3 })} ${fill(d.overMany, { n: 2, max: 30 })}`);
  });

  it("Annulla while an upload is still going: the file lands in Media, no over-limit line, the animation unchanged", async () => {
    const onSave = vi.fn(savedOk);
    const many = Array.from({ length: 29 }, (_, i) => listed(`cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, "image", `f${i + 1}.jpg`));
    server([X, Y], many);
    let release: () => void = () => {};
    uploads.uploadFile.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    setup(false, fixture(), { media: many, onSave });
    open();
    for (const f of many) pick(f.id);
    drop([file("x.jpg", "image/jpeg")]);
    await flush();
    fireEvent.click(button(d.cancel, dialog()!));
    expect(dialog()).toBeNull();
    release();
    await flush();
    expect(status().textContent).toBe(fill(m.announce.done, { name: "x.jpg" }));
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
    expect(tiles().at(-1)).toBe(X);
  });

  it("an upload whose list can't be read again is not picked; the success line still names it", async () => {
    server([X, Y]);
    actions.listAssets.mockResolvedValueOnce({ ok: false, status: 500, error: { code: "ASSET_READ_FAILED", message: "m" } });
    setup(false, fixture());
    open();
    drop([file("x.jpg", "image/jpeg")]);
    await flush();
    expect(actions.confirmAssetUpload).toHaveBeenCalledTimes(1);
    expect(dialog()!.querySelector(`[data-pick="${X}"]`)).toBeNull();
    expect(status().textContent).toBe(fill(m.announce.done, { name: "x.jpg" }));
    // The next read shows it, unpicked; the file uploaded then is picked alone.
    drop([file("y.jpg", "image/jpeg")]);
    await flush();
    expect(dialog()!.querySelector(`[data-pick="${X}"]`)!.getAttribute("aria-pressed")).toBe("false");
    expect(picks()).toEqual([Y]);
  });

  it("a file dropped on the picker, off the drop zone, is taken and uploads nothing", async () => {
    setup(false, fixture());
    open();
    const area = dialog()!.querySelector<HTMLElement>(`[data-pick="${IMAGE}"]`)!;
    const data = { dataTransfer: { files: [file("x.jpg", "image/jpeg")], types: ["Files"], dropEffect: "copy" } };
    expect(fireEvent.dragOver(area, data)).toBe(false);
    expect(fireEvent.drop(area, data)).toBe(false);
    await flush();
    expect(actions.presignAssetUpload).not.toHaveBeenCalled();
    expect(picks()).toEqual([]);
  });

  it("on a case with no media yet, a dropped file shows in the picker, picked, and Inserisci is on", async () => {
    server([X], []);
    setup(false, fixture(), { media: [] });
    open();
    expect(dialog()!.textContent).toContain(d.noMedia);
    expect(button(d.insert, dialog()!).hasAttribute("disabled")).toBe(true);
    drop([file("x.jpg", "image/jpeg")]);
    await flush();
    expect(dialog()!.textContent).not.toContain(d.noMedia);
    expect(picks()).toEqual([X]);
    expect(button(d.insert, dialog()!).hasAttribute("disabled")).toBe(false);
  });

  it("Annulla after an upload leaves the files in Media and the animation unchanged", async () => {
    const onSave = vi.fn(savedOk);
    server([X]);
    setup(false, fixture(), { onSave });
    open();
    drop([file("x.jpg", "image/jpeg")]);
    await flush();
    fireEvent.click(button(d.cancel, dialog()!));
    expect(dialog()).toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
    expect(tiles()).toEqual([IMAGE, VIDEO, X]);
  });

  it("an upload from the Media tab shows in the dialog's picker", async () => {
    server([X]);
    setup(false, fixture());
    fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
    fireEvent.drop(button(`${dict.configurator.media.drop.lead}, ${dict.configurator.media.drop.choose}`, rightPanel()), {
      dataTransfer: { files: [file("x.jpg", "image/jpeg")], types: ["Files"], dropEffect: "copy" },
    });
    await flush();
    open();
    expect(dialog()!.querySelector(`[data-pick="${X}"]`)).not.toBeNull();
  });
});

describe("Configurator pages (Story 4.13)", () => {
  const p = dict.configurator.pages;
  const pagesNow = () => [...canvas().querySelectorAll<HTMLElement>("[data-canvas-page]")].map((n) => n.dataset.canvasPage);
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedKeys = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => (lastDoc(onSave).formats.presentazione_16_9.pages as Page[]).map((pg) => pg.pageKey);
  const thumb = (key: string) => rightPanel().querySelector<HTMLElement>(`[data-thumb="${key}"]`)!;
  const pageDrag = (key: string) => ({ dataTransfer: { types: ["application/x-mac-page"], getData: () => key, setData: () => {}, dropEffect: "none", effectAllowed: "all" } });
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("+ Aggiungi pagina adds Nuova pagina after the selected page, selected, in one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, formats, { onSave });
    const keys = formats.presentazione_16_9.map((pg) => pg.pageKey);
    fireEvent.click(pageNode(keys[0]!));
    fireEvent.click(button(p.add, canvas()));
    const now = pagesNow();
    expect(now).toHaveLength(keys.length + 1);
    expect(now[0]).toBe(keys[0]);
    expect(pageNode(now[1]!).hasAttribute("data-selected")).toBe(true);
    expect(canvas().textContent).toContain(fill(dict.configurator.canvas.pageLabel, { n: 2, name: p.newPage }));
    await settle();
    expect(savedKeys(onSave)).toHaveLength(keys.length + 1);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedKeys(onSave)).toEqual(keys);
  });

  it("with nothing selected, a new page goes at the end of Output and scrolls into view; a full format says so", async () => {
    const onSave = vi.fn(savedOk);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    setup(false, formats, { onSave });
    fireEvent.click(button(p.add, canvas()));
    const pages = formats.presentazione_16_9;
    const lastOutput = pages.map((pg) => pg.section).lastIndexOf("output");
    const added = pagesNow()[lastOutput + 1]!;
    expect(canvas().querySelector(`[data-canvas-page="${added}"]`)!.hasAttribute("data-selected")).toBe(true);
    expect(scroll).toHaveBeenCalled();
    cleanup();
    const one = pages[0]!;
    setup(false, { ...formats, presentazione_16_9: Array.from({ length: 50 }, (_, i) => ({ ...one, pageKey: `k${i}` })) });
    fireEvent.click(button(p.add, canvas()));
    expect(status().textContent).toBe(fill(p.formatFull, { n: 50 }));
    expect(pagesNow()).toHaveLength(50);
  });

  it("the bin on a page's label deletes it with a message; ⌘Z brings it back in place", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, formats, { onSave });
    const keys = formats.presentazione_16_9.map((pg) => pg.pageKey);
    fireEvent.click(button(fill(p.deleteLabel, { n: 2 }), canvas()));
    expect(status().textContent).toBe(p.deleted);
    expect(pagesNow()).toEqual(keys.filter((_, i) => i !== 1));
    await settle();
    expect(savedKeys(onSave)).toEqual(keys.filter((_, i) => i !== 1));
    expect(lastDoc(onSave).formats.carosello_1_1.pages).toEqual(formats.carosello_1_1);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedKeys(onSave)).toEqual(keys);
  });

  it("Elimina pagina in the left panel deletes the selected page and clears the selection", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, formats, { onSave });
    const keys = formats.presentazione_16_9.map((pg) => pg.pageKey);
    fireEvent.click(pageNode(keys[2]!));
    fireEvent.click(button(dict.configurator.tools.deletePage, leftPanel()));
    await settle();
    expect(savedKeys(onSave)).toEqual(keys.filter((_, i) => i !== 2));
    expect(canvas().querySelector("[data-selected]")).toBeNull();
    expect(status().textContent).toBe(p.deleted);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await settle();
    expect(savedKeys(onSave)).toEqual(keys);
  });

  it("a thumbnail dragged up lands before the target", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, formats, { onSave });
    const keys = formats.presentazione_16_9.map((pg) => pg.pageKey);
    const [first, last] = [keys[0]!, keys.at(-1)!];
    fireEvent.dragStart(thumb(last), pageDrag(last));
    fireEvent.dragOver(thumb(first), pageDrag(last));
    expect(thumb(first).dataset.drop).toBe("before");
    fireEvent.drop(thumb(first), pageDrag(last));
    await settle();
    expect(savedKeys(onSave)).toEqual([last, ...keys.slice(0, -1)]);
  });

  it("a thumbnail dropped on another moves the page, across sections too, keeping its section", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, formats, { onSave });
    const pages = formats.presentazione_16_9;
    const keys = pages.map((pg) => pg.pageKey);
    const last = keys.length - 1;
    fireEvent.dragStart(thumb(keys[0]!), pageDrag(keys[0]!));
    fireEvent.dragOver(thumb(keys[last]!), pageDrag(keys[0]!));
    expect(thumb(keys[last]!).dataset.drop).toBe("after");
    fireEvent.drop(thumb(keys[last]!), pageDrag(keys[0]!));
    await settle();
    expect(savedKeys(onSave)).toEqual([...keys.slice(1), keys[0]]);
    const moved = (lastDoc(onSave).formats.presentazione_16_9.pages as Page[]).at(-1)!;
    expect(moved.section).toBe(pages[0]!.section);
    // Pagine shows it where it now is, under its own section's label.
    const thumbs = [...rightPanel().querySelectorAll<HTMLElement>("[data-thumb]")].map((t) => t.dataset.thumb);
    expect(thumbs.at(-1)).toBe(keys[0]);
  });

  it("in Anteprima and when not editable there is no bin, no Aggiungi pagina, and thumbnails don't drag", () => {
    setup(false, formats, { editable: false });
    expect(within(canvas()).queryByRole("button", { name: p.add, hidden: true })).toBeNull();
    expect(within(canvas()).queryByRole("button", { name: fill(p.deleteLabel, { n: 1 }), hidden: true })).toBeNull();
    expect(thumb(formats.presentazione_16_9[0]!.pageKey).getAttribute("draggable")).toBe("false");
    cleanup();
    setup();
    fireEvent.click(button(dict.configurator.preview.enter));
    expect(within(canvas()).queryByRole("button", { name: p.add, hidden: true })).toBeNull();
    expect(within(canvas()).queryByRole("button", { name: fill(p.deleteLabel, { n: 1 }), hidden: true })).toBeNull();
  });
});

describe("Configurator Approva (Story 4.8)", () => {
  const a = dict.configurator.approval;
  type ApproveFn = NonNullable<ConfiguratorProps["onApprove"]>;
  const approveButton = () => button(dict.configurator.approve, document.querySelector<HTMLElement>("header")!);
  const dialog = () => document.querySelector<HTMLElement>("dialog");
  const flush = async () => {
    for (let i = 0; i < 10; i++) await act(async () => {});
  };

  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  it("with nothing overflowing and every file there, asks, then approves this version and goes to Case studies", async () => {
    const onApprove = vi.fn<ApproveFn>(async () => ({ ok: true, value: { waiting: false } }));
    setup(false, formats, { onApprove });
    await flush();
    expect(approveButton().hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(approveButton());
    expect(dialog()!.textContent).toContain(fill(a.title, { name: "Rebrand Lumen" }));
    expect(dialog()!.textContent).toContain(a.description);
    fireEvent.click(button(a.confirm, dialog()!));
    await flush();
    expect(onApprove).toHaveBeenCalledWith({
      caseId: CASE_ID,
      revisionId: REVISION_ID,
      expectedRevisionVersion: 4,
      expectedHeadVersion: 7,
      overflow: Object.fromEntries(FORMAT_IDS.map((id) => [id, false])),
    });
    expect(push).toHaveBeenCalledWith("/case-studies?approvata=1");
  });

  it("goes to Da approvare when other cases wait", async () => {
    const onApprove = vi.fn<ApproveFn>(async () => ({ ok: true, value: { waiting: true } }));
    setup(false, formats, { onApprove });
    await flush();
    fireEvent.click(approveButton());
    fireEvent.click(button(a.confirm, dialog()!));
    await flush();
    expect(push).toHaveBeenCalledWith("/case-studies?stato=in_review&approvata=1");
  });

  it("is inactive and names the page when a format overflows; pressing it does nothing", async () => {
    // Only Carosello's pages overflow.
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.closest('[data-measure-format="carosello_1_1"]') === null ? 100 : 200;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    try {
      const onApprove = vi.fn<ApproveFn>();
      setup(false, formats, { onApprove });
      await flush();
      expect(approveButton().getAttribute("aria-disabled")).toBe("true");
      const reason = document.getElementById(approveButton().getAttribute("aria-describedby")!)!;
      expect(reason.textContent).toBe(fill(a.overflow, { format: dict.configurator.formats.carosello_1_1, n: 1 }));
      fireEvent.click(approveButton());
      expect(dialog()!.hasAttribute("open")).toBe(false);
      expect(onApprove).not.toHaveBeenCalled();
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it("is inactive and names a file a page shows that is no longer there", async () => {
    setup(false, formats, { onApprove: vi.fn<ApproveFn>(), media: [] });
    await flush();
    expect(approveButton().getAttribute("aria-disabled")).toBe("true");
    expect(approveButton().getAttribute("title")).toBe(fill(a.missing, { name: a.unknownFile }));
  });

  it("counts the client's files as present", async () => {
    setup(false, formats, { onApprove: vi.fn<ApproveFn>(), media: [], clientFiles: MEDIA.map((f) => ({ id: f.id, name: f.originalFileName })) });
    await flush();
    expect(approveButton().hasAttribute("aria-disabled")).toBe(false);
  });

  it("saves a pending edit first and approves the version that save returned", async () => {
    const order: string[] = [];
    const onSave = vi.fn<SaveFn>(async (input) => {
      order.push("save");
      return savedOk(input);
    });
    const onApprove = vi.fn<ApproveFn>(async () => {
      order.push("approve");
      return { ok: true, value: { waiting: false } };
    });
    setup(false, formats, { onApprove, onSave });
    fireEvent.click(button(dict.configurator.pages.add, canvas()));
    await flush();
    fireEvent.click(approveButton());
    fireEvent.click(button(a.confirm, dialog()!));
    await flush();
    expect(order).toEqual(["save", "approve"]);
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ expectedRevisionVersion: 5 }));
  });

  it("a save that fails stops the approval and says so", async () => {
    const onApprove = vi.fn<ApproveFn>();
    setup(false, formats, { onApprove, onSave: vi.fn<SaveFn>().mockRejectedValue(new Error("offline")) });
    fireEvent.click(button(dict.configurator.pages.add, canvas()));
    await flush();
    fireEvent.click(approveButton());
    fireEvent.click(button(a.confirm, dialog()!));
    await flush();
    expect(onApprove).not.toHaveBeenCalled();
    expect(dialog()!.hasAttribute("open")).toBe(false);
    expect(status().textContent).toBe(a.notSaved);
  });

  it("MATERIAL_MISSING from the server names the file and keeps it disabled; a stale case reloads", async () => {
    const onApprove = vi
      .fn<ApproveFn>()
      .mockResolvedValueOnce({ ok: false, status: 400, error: { code: "MATERIAL_MISSING", message: "m", assetIds: [VIDEO] } });
    setup(false, formats, { onApprove });
    await flush();
    fireEvent.click(approveButton());
    fireEvent.click(button(a.confirm, dialog()!));
    await flush();
    expect(approveButton().getAttribute("title")).toBe(fill(a.missing, { name: "LUM_reel.mp4" }));
    expect(push).not.toHaveBeenCalled();
    cleanup();
    const stale = vi.fn<ApproveFn>(async () => ({ ok: false, status: 409, error: { code: "STALE_HEAD", message: "m" } }));
    setup(false, formats, { onApprove: stale });
    await flush();
    fireEvent.click(approveButton());
    fireEvent.click(button(a.confirm, dialog()!));
    await flush();
    expect(refresh).toHaveBeenCalled();
    expect(status().textContent).toBe(a.stale);
  });

  it("Annulla closes the dialog without approving; on trial pages Approva still says it arrives soon", async () => {
    const onApprove = vi.fn<ApproveFn>();
    setup(false, formats, { onApprove });
    await flush();
    fireEvent.click(approveButton());
    fireEvent.click(button(a.cancel, dialog()!));
    expect(dialog()!.hasAttribute("open")).toBe(false);
    expect(onApprove).not.toHaveBeenCalled();
    cleanup();
    setup(true, formats, { onApprove });
    fireEvent.click(approveButton());
    expect(status().textContent).toBe(`${dict.configurator.approve} arriva presto.`);
  });
});

/** Story 4.9: an Approvato case, edited on a working copy that goes online only through Aggiorna. */
describe("Configurator on an approved case (Story 4.9)", () => {
  const u = dict.configurator.approvedEdit;
  const COPY_ID = "dddddddd-0000-4000-8000-000000000002";
  type ForkFn = NonNullable<ConfiguratorProps["onFork"]>;
  type UpdateFn = NonNullable<ConfiguratorProps["onUpdateApproved"]>;
  type DiscardFn = NonNullable<ConfiguratorProps["onDiscard"]>;
  const header = () => document.querySelector<HTMLElement>("header")!;
  const updateButton = () => within(header()).queryByRole("button", { name: u.update, hidden: true });
  const discardButton = () => within(header()).queryByRole("button", { name: u.discard, hidden: true });
  const dialog = () => document.querySelector<HTMLElement>("dialog");
  const forked = vi.fn<ForkFn>(async () => ({ ok: true, value: { revisionId: COPY_ID, version: 0, headVersion: 8 } }));
  const tick = async (ms = 1_000) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  const addPage = () => fireEvent.click(button(dict.configurator.pages.add, canvas()));

  function approved(over: { fork?: boolean; onFork?: ForkFn; onSave?: SaveFn; onUpdateApproved?: UpdateFn; onDiscard?: DiscardFn; media?: readonly ListedAsset[] } = {}) {
    const onSave = vi.fn<SaveFn>(over.onSave ?? savedOk);
    const onFork = vi.fn<ForkFn>(over.onFork ?? forked);
    const onUpdateApproved = vi.fn<UpdateFn>(over.onUpdateApproved ?? (async () => ({ ok: true, value: undefined })));
    const onDiscard = vi.fn<DiscardFn>(over.onDiscard ?? (async () => ({ ok: true, value: undefined })));
    const onApprove = vi.fn<NonNullable<ConfiguratorProps["onApprove"]>>();
    setup(false, formats, { status: "approved", fork: over.fork ?? true, onFork, onSave, onUpdateApproved, onDiscard, onApprove, media: over.media ?? MEDIA });
    return { onSave, onFork, onUpdateApproved, onDiscard, onApprove };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    push.mockReset();
    refresh.mockReset();
    forked.mockClear();
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  it("opens editable under the banner, with no Approva, Aggiorna or Scarta in the top bar", async () => {
    const { onFork, onSave } = approved();
    await tick();
    expect(document.querySelector('[data-editable="true"]')).not.toBeNull();
    expect(screen.getByText(u.banner)).toBeTruthy();
    expect(updateButton()).toBeNull();
    expect(discardButton()).toBeNull();
    expect(within(header()).queryByRole("button", { name: dict.configurator.approve, hidden: true })).toBeNull();
    // Opening and looking never forks.
    expect(onFork).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("the first edit forks once, saves to the copy, and Aggiorna and Scarta appear; later edits and an undo save to the same copy", async () => {
    const { onFork, onSave } = approved();
    addPage();
    await tick();
    expect(onFork).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, expectedHeadVersion: 7 });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0]).toMatchObject({ caseId: CASE_ID, revisionId: COPY_ID, expectedVersion: 0 });
    expect(updateButton()).not.toBeNull();
    expect(discardButton()).not.toBeNull();

    addPage();
    await tick();
    fireEvent.click(button(dict.configurator.undo, header()));
    await tick();
    expect(onFork).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls.map((call) => [call[0].revisionId, call[0].expectedVersion])).toEqual([
      [COPY_ID, 0],
      [COPY_ID, 1],
      [COPY_ID, 2],
    ]);
  });

  it("a stale fork reloads the case and saves nothing", async () => {
    const { onSave } = approved({ onFork: async () => ({ ok: false, status: 409, error: { code: "STALE_HEAD", message: "m" } }) });
    addPage();
    await tick();
    expect(refresh).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(updateButton()).toBeNull();
  });

  it("a fork that fails on the network is retried like a save, then saves to the copy", async () => {
    const onFork = vi.fn<ForkFn>().mockRejectedValueOnce(new Error("offline")).mockImplementation(forked);
    const { onSave } = approved({ onFork });
    addPage();
    await tick();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(dict.configurator.retrying)).toBeTruthy();
    await tick(3_000);
    expect(onFork).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ revisionId: COPY_ID, expectedVersion: 0 }));
  });

  it("reopened with a copy pending: Aggiorna and Scarta show at once, and edits save to the copy without a fork", async () => {
    const { onFork, onSave } = approved({ fork: false });
    await tick();
    expect(updateButton()).not.toBeNull();
    expect(discardButton()).not.toBeNull();
    addPage();
    await tick();
    expect(onFork).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ revisionId: REVISION_ID, expectedVersion: 4 }));
  });

  it("Aggiorna asks, then updates the copy at the version the last save returned; the buttons go and the next edit forks again", async () => {
    const { onFork, onUpdateApproved } = approved();
    addPage();
    await tick();
    expect(updateButton()!.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(updateButton()!);
    expect(dialog()!.hasAttribute("open")).toBe(true);
    expect(dialog()!.textContent).toContain(u.updateTitle);
    expect(dialog()!.textContent).toContain(u.updateDescription);
    fireEvent.click(button(u.updateConfirm, dialog()!));
    await tick();
    expect(onUpdateApproved).toHaveBeenCalledExactlyOnceWith({
      caseId: CASE_ID,
      revisionId: COPY_ID,
      expectedRevisionVersion: 1,
      expectedHeadVersion: 8,
      overflow: Object.fromEntries(FORMAT_IDS.map((id) => [id, false])),
    });
    expect(updateButton()).toBeNull();
    expect(discardButton()).toBeNull();
    expect(status().textContent).toBe(u.updated);
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // Approvato stays: no Approva, and the next edit forks a new copy.
    expect(within(header()).queryByRole("button", { name: dict.configurator.approve, hidden: true })).toBeNull();
    addPage();
    await tick();
    expect(onFork).toHaveBeenCalledTimes(2);
    expect(onFork).toHaveBeenLastCalledWith({ caseId: CASE_ID, expectedHeadVersion: 8 });
  });

  it("a pending save lands first, and the update carries the version it returned", async () => {
    const order: string[] = [];
    const onSave = vi.fn<SaveFn>(async (input) => {
      order.push("save");
      return savedOk(input);
    });
    const onUpdateApproved = vi.fn<UpdateFn>(async () => {
      order.push("update");
      return { ok: true, value: undefined };
    });
    approved({ fork: false, onSave, onUpdateApproved });
    await tick();
    addPage();
    fireEvent.click(updateButton()!);
    fireEvent.click(button(u.updateConfirm, dialog()!));
    await tick();
    expect(order).toEqual(["save", "update"]);
    expect(onUpdateApproved).toHaveBeenCalledWith(expect.objectContaining({ revisionId: REVISION_ID, expectedRevisionVersion: 5, expectedHeadVersion: 7 }));
  });

  it("a save that fails at Aggiorna stops the update and says so", async () => {
    const { onUpdateApproved } = approved({ fork: false, onSave: vi.fn<SaveFn>().mockRejectedValue(new Error("offline")) });
    await tick();
    addPage();
    fireEvent.click(updateButton()!);
    fireEvent.click(button(u.updateConfirm, dialog()!));
    await tick();
    expect(onUpdateApproved).not.toHaveBeenCalled();
    expect(dialog()!.hasAttribute("open")).toBe(false);
    expect(status().textContent).toBe(u.notSaved);
  });

  it("REVISION_WRITE_FAILED at Aggiorna is a failure, not a change made meanwhile", async () => {
    approved({ fork: false, onUpdateApproved: async () => ({ ok: false, status: 500, error: { code: "REVISION_WRITE_FAILED", message: "m" } }) });
    await tick();
    fireEvent.click(updateButton()!);
    fireEvent.click(button(u.updateConfirm, dialog()!));
    await tick();
    expect(status().textContent).toBe(u.updateFailed);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("after a discard, an edit made before the page reloads is never saved to the dropped copy", async () => {
    const { onSave, onDiscard } = approved({ fork: false });
    await tick();
    fireEvent.click(discardButton()!);
    fireEvent.click(button(u.discardConfirm, dialog()!));
    await tick();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    addPage();
    await tick();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("the top bar keeps its columns on an approved case before and after the first fork", async () => {
    approved();
    const columns = () => [...header().classList].find((c) => c.startsWith("grid-cols-"));
    const before = columns();
    addPage();
    await tick();
    expect(updateButton()).not.toBeNull();
    expect(columns()).toBe(before);
  });

  it("Aggiorna is inactive and names the page while a format overflows", async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.closest('[data-measure-format="carosello_1_1"]') === null ? 100 : 200;
    });
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    try {
      const { onUpdateApproved } = approved({ fork: false });
      await tick();
      expect(updateButton()!.getAttribute("aria-disabled")).toBe("true");
      const reason = document.getElementById(updateButton()!.getAttribute("aria-describedby")!)!;
      expect(reason.textContent).toBe(fill(dict.configurator.approval.overflow, { format: dict.configurator.formats.carosello_1_1, n: 1 }));
      fireEvent.click(updateButton()!);
      expect(dialog()?.hasAttribute("open") ?? false).toBe(false);
      expect(onUpdateApproved).not.toHaveBeenCalled();
    } finally {
      scroll.mockRestore();
      client.mockRestore();
    }
  });

  it("Aggiorna is inactive and names a file a page shows that is no longer there", async () => {
    approved({ fork: false, media: [] });
    await tick();
    expect(updateButton()!.getAttribute("aria-disabled")).toBe("true");
    expect(updateButton()!.getAttribute("title")).toBe(fill(dict.configurator.approval.missing, { name: dict.configurator.approval.unknownFile }));
  });

  it("a refused update changes nothing: MATERIAL_MISSING names the file, a stale case reloads", async () => {
    const onUpdateApproved = vi
      .fn<UpdateFn>()
      .mockResolvedValueOnce({ ok: false, status: 400, error: { code: "MATERIAL_MISSING", message: "m", assetIds: [VIDEO] } })
      .mockResolvedValueOnce({ ok: false, status: 409, error: { code: "STALE_HEAD", message: "m" } });
    approved({ fork: false, onUpdateApproved });
    await tick();
    fireEvent.click(updateButton()!);
    fireEvent.click(button(u.updateConfirm, dialog()!));
    await tick();
    expect(updateButton()!.getAttribute("title")).toBe(fill(dict.configurator.approval.missing, { name: "LUM_reel.mp4" }));
    expect(refresh).not.toHaveBeenCalled();
    cleanup();
    approved({ fork: false, onUpdateApproved });
    await tick();
    fireEvent.click(updateButton()!);
    fireEvent.click(button(u.updateConfirm, dialog()!));
    await tick();
    expect(refresh).toHaveBeenCalled();
    expect(status().textContent).toBe(dict.configurator.approval.stale);
    // Still a pending copy until the page reads the case again.
    expect(updateButton()).not.toBeNull();
  });

  it("Scarta asks first, then drops the copy and reads the case again", async () => {
    const { onDiscard, onUpdateApproved } = approved();
    addPage();
    await tick();
    fireEvent.click(discardButton()!);
    expect(dialog()!.hasAttribute("open")).toBe(true);
    expect(dialog()!.textContent).toContain(u.discardTitle);
    expect(dialog()!.textContent).toContain(u.discardDescription);
    fireEvent.click(button(u.discardConfirm, dialog()!));
    await tick();
    expect(onDiscard).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, revisionId: COPY_ID, expectedHeadVersion: 8 });
    expect(refresh).toHaveBeenCalled();
    expect(onUpdateApproved).not.toHaveBeenCalled();
  });

  it("Annulla in the Scarta dialog changes nothing", async () => {
    const { onDiscard } = approved({ fork: false });
    await tick();
    fireEvent.click(discardButton()!);
    fireEvent.click(button(u.cancel, dialog()!));
    expect(dialog()!.hasAttribute("open")).toBe(false);
    await tick();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(discardButton()).not.toBeNull();
  });

  it("a failed discard says so and keeps the copy", async () => {
    approved({ fork: false, onDiscard: async () => ({ ok: false, status: 500, error: { code: "REVISION_LOOKUP_FAILED", message: "m" } }) });
    await tick();
    fireEvent.click(discardButton()!);
    fireEvent.click(button(u.discardConfirm, dialog()!));
    await tick();
    expect(status().textContent).toBe(u.discardFailed);
    expect(discardButton()!.hasAttribute("disabled")).toBe(false);
  });

  it("a Da approvare case is unchanged: Approva, no banner, no Aggiorna or Scarta, and its saves never fork", async () => {
    const onFork = vi.fn<ForkFn>();
    const onSave = vi.fn<SaveFn>(savedOk);
    setup(false, formats, { onFork, onSave, onApprove: vi.fn(), onUpdateApproved: vi.fn(), onDiscard: vi.fn() });
    addPage();
    await tick();
    expect(within(header()).getByRole("button", { name: dict.configurator.approve, hidden: true })).toBeTruthy();
    expect(screen.queryByText(u.banner)).toBeNull();
    expect(updateButton()).toBeNull();
    expect(discardButton()).toBeNull();
    expect(onFork).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ revisionId: REVISION_ID, expectedVersion: 4 }));
  });
});

/** Story 4.3d: the client's and the case's fields, typed on the page or set in the left panel. */
describe("Configurator client and case fields", () => {
  const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
  const LOGO = "eeeeeeee-0000-4000-8000-000000000001";
  const NEW_LOGO = "eeeeeeee-0000-4000-8000-000000000002";
  const t = dict.configurator.fields;
  const FIELDS: NonNullable<ConfiguratorProps["fields"]> = {
    client: { id: CLIENT_ID, name: "Lumen Srl", industry: "illuminazione", description: "Lampade.", logoId: LOGO },
    case: {
      year: 2026,
      businessLines: ["branding"],
      results: [
        { label: "Vendite", value: "+30%" },
        { label: "Visite", value: "2x" },
      ],
      testimonial: { quote: "Bravi.", author: "Ada" },
    },
  };
  const FIELD_VALUES: BoundValues = {
    client: { name: "Lumen Srl", sector: "Illuminazione", description: "Lampade.", logoUrl: "https://cdn.test/logo.png", results: [], testimonial: null },
    case: { year: 2026, services: ["Branding"], results: FIELDS.case.results, testimonial: { quote: "Bravi.", author: "Ada" } },
  };
  const OPTIONS: NonNullable<ConfiguratorProps["fieldOptions"]> = {
    sectors: [
      { key: "illuminazione", label: "Illuminazione" },
      { key: "moda", label: "Moda" },
    ],
    limits: {
      nameMax: 120,
      descriptionMax: 400,
      briefMax: 5000,
      resultLabelMax: 80,
      resultValueMax: 20,
      testimonialQuoteMax: 600,
      testimonialAuthorMax: 120,
      sectorLabelMin: 2,
      sectorLabelMax: 40,
      logoTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
      logoMaxBytes: 5 * 1024 * 1024,
      logoMinShortSide: 400,
    },
    years: { min: 1900, max: 2100 },
    businessLines: ["branding", "social_media", "video", "web_design", "advertising", "eventi", "sviluppo"],
  };
  const saved = { ok: true as const, value: null };

  function fieldActions() {
    return {
      updateClient: vi.fn(async () => saved),
      addClientSector: vi.fn(async ({ label }: { label: string }) => ({ ok: true as const, value: { key: label.toLowerCase(), label } })),
      updateCaseFields: vi.fn(async () => saved),
      saveCaseResults: vi.fn(async () => saved),
      saveCaseTestimonial: vi.fn(async () => saved),
    } satisfies NonNullable<ConfiguratorProps["fieldActions"]>;
  }

  function open(over: { editable?: boolean; approved?: boolean; fields?: typeof FIELDS; actions?: ReturnType<typeof fieldActions>; onSave?: SaveFn } = {}) {
    const actions = over.actions ?? fieldActions();
    const onSave = vi.fn(over.onSave ?? savedOk);
    setup(false, formats, {
      ...(over.approved === true
        ? { status: "approved" as const, fork: true, onFork: vi.fn(async () => ({ ok: true as const, value: { revisionId: REVISION_ID, version: 0, headVersion: 8 } })) }
        : {}),
      editable: over.editable ?? true,
      onSave,
      values: FIELD_VALUES,
      fields: over.fields ?? FIELDS,
      fieldOptions: OPTIONS,
      fieldActions: actions,
    });
    return { actions, onSave };
  }

  /** The first element of Presentazione (else any format shown) matching `match`: its page and id. */
  function find(match: (el: DocumentElement) => boolean, formatId: FormatId = "presentazione_16_9") {
    for (const page of formats[formatId]) {
      const walk = (elements: readonly DocumentElement[]): string | undefined => {
        for (const el of elements) {
          if (match(el)) return el.elementId;
          if (el.type === "text_group" || el.type === "row") {
            const inner = walk(el.items as readonly DocumentElement[]);
            if (inner !== undefined) return inner;
          }
        }
        return undefined;
      };
      for (const block of page.blocks) {
        const id = walk(block.elements);
        if (id !== undefined) return { pageKey: page.pageKey, id };
      }
    }
    throw new Error("not in the fixture");
  }
  const bound = (record: string, field: string, index?: number) => (el: DocumentElement) =>
    el.type === "text" && el.binding?.record === record && el.binding.field === field && (index === undefined || el.binding.index === index);
  const node = (at: { pageKey: string; id: string }) => pageNode(at.pageKey).querySelector<HTMLElement>(`[data-element-id="${at.id}"]`)!;
  const nameNodes = () =>
    [...canvas().querySelectorAll<HTMLElement>(".mr-txt[data-element-id]")].filter((n) => {
      const at = { pageKey: n.closest<HTMLElement>("[data-canvas-page]")!.dataset.canvasPage!, id: n.dataset.elementId! };
      const page = formats.presentazione_16_9.find((p) => p.pageKey === at.pageKey);
      return page !== undefined && textElementAt([page], at.pageKey, at.id)?.binding?.field === "name";
    });
  async function flush() {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }
  function typeAndPress(target: HTMLElement, text: string, key: "Enter" | "Escape") {
    target.textContent = text;
    fireEvent.input(target);
    fireEvent.keyDown(target, { key });
  }

  beforeEach(() => {
    refresh.mockClear();
  });

  it("typing a new client name saves it through updateClient with the client's other fields, shows it on every page, and leaves the document alone", async () => {
    const { actions, onSave } = open();
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    expect(node(name).getAttribute("contenteditable")).toBe("plaintext-only");
    // It opens on the stored name.
    expect(node(name).textContent).toBe("Lumen Srl");
    typeAndPress(node(name), "Lumen Group", "Enter");
    await flush();
    expect(actions.updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Group", industry: "illuminazione", description: "Lampade.", logoId: LOGO });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(node(name).hasAttribute("contenteditable")).toBe(false);
    expect(nameNodes().length).toBeGreaterThan(0);
    for (const each of nameNodes()) expect(each.textContent).toBe("Lumen Group");
    // Not a document edit: nothing saved, nothing to undo.
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("a refused save puts the old name back and says why", async () => {
    const actions = fieldActions();
    actions.updateClient.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "m" } } as never);
    open({ actions });
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    typeAndPress(node(name), "Acme", "Enter");
    await flush();
    expect(actions.updateClient).toHaveBeenCalledTimes(1);
    expect(node(name).textContent).toBe("Lumen Srl");
    expect(status().textContent).toBe(t.errors.CLIENT_NAME_TAKEN);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Esc cancels the typing and saves nothing", async () => {
    const { actions } = open();
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    typeAndPress(node(name), "Altro", "Escape");
    await flush();
    expect(actions.updateClient).not.toHaveBeenCalled();
    expect(node(name).textContent).toBe("Lumen Srl");
  });

  it("a client without a logo can't be renamed here: Aggiungi prima il logo del cliente.", () => {
    const { actions } = open({ fields: { ...FIELDS, client: { ...FIELDS.client, logoId: null } } });
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    expect(node(name).hasAttribute("contenteditable")).toBe(false);
    expect(status().textContent).toBe(t.needLogo);
    expect(actions.updateClient).not.toHaveBeenCalled();
  });

  it("an approved case: a double-click on a bound text edits nothing and says so, and no field section shows", () => {
    open({ editable: false });
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    expect(node(name).hasAttribute("contenteditable")).toBe(false);
    expect(status().textContent).toBe(dict.configurator.editSoon);
    const services = find((el) => el.type === "services", "carosello_1_1");
    fireEvent.click(button(/Carosello/));
    fireEvent.click(node(services));
    expect(pageNode(services.pageKey).querySelector('[data-frame="element"]')).not.toBeNull();
    expect(within(leftPanel()).queryByText(t.caseHeading)).toBeNull();
  });

  it("an editable approved case (Story 4.9): client and case fields stay read-only, with the existing message", () => {
    const { actions } = open({ approved: true });
    expect(document.querySelector('[data-editable="true"]')).not.toBeNull();
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    expect(node(name).hasAttribute("contenteditable")).toBe(false);
    expect(status().textContent).toBe(dict.configurator.editSoon);
    const services = find((el) => el.type === "services", "carosello_1_1");
    fireEvent.click(button(/Carosello/));
    fireEvent.click(node(services));
    expect(within(leftPanel()).queryByText(t.caseHeading)).toBeNull();
    expect(actions.updateClient).not.toHaveBeenCalled();
  });

  it("a result number typed in row 2 saves the stored rows with only row 2 changed", async () => {
    const { actions } = open();
    const value = find(bound("case", "resultValue", 1));
    fireEvent.doubleClick(node(value));
    expect(node(value).textContent).toBe("2x");
    typeAndPress(node(value), "3x", "Enter");
    await flush();
    expect(actions.saveCaseResults).toHaveBeenCalledExactlyOnceWith({
      caseId: CASE_ID,
      results: [
        { label: "Vendite", value: "+30%" },
        { label: "Visite", value: "3x" },
      ],
    });
  });

  it("a number over 20 characters is refused before any save, and the old one stays", async () => {
    const { actions } = open();
    const value = find(bound("case", "resultValue", 0));
    fireEvent.doubleClick(node(value));
    typeAndPress(node(value), "1".repeat(21), "Enter");
    await flush();
    expect(actions.saveCaseResults).not.toHaveBeenCalled();
    expect(status().textContent).toBe(fill(t.tooLong, { max: 20 }));
    expect(node(value).textContent).toBe("+30%");
  });

  it("a new author saves with the stored quote; the quote opens without the template's « »", async () => {
    const { actions } = open();
    const quote = find(bound("case", "testimonialQuote"));
    fireEvent.doubleClick(node(quote));
    expect(node(quote).textContent).toBe("Bravi.");
    fireEvent.keyDown(node(quote), { key: "Escape" });
    const author = find(bound("case", "testimonialAuthor"));
    fireEvent.doubleClick(node(author));
    typeAndPress(node(author), "Ada L.", "Enter");
    await flush();
    expect(actions.saveCaseTestimonial).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, quote: "Bravi.", author: "Ada L." });
  });

  it("a double-click on the meta line selects it and focuses the year; a new year saves through updateCaseFields and the code stays", async () => {
    const { actions } = open();
    const meta = find((el) => el.type === "text" && el.bindings !== undefined);
    fireEvent.doubleClick(node(meta));
    const year = within(leftPanel()).getByLabelText(t.year) as HTMLInputElement;
    expect(document.activeElement).toBe(year);
    expect(year.value).toBe("2026");
    fireEvent.change(year, { target: { value: "2025" } });
    fireEvent.keyDown(year, { key: "Enter" });
    fireEvent.blur(year);
    await flush();
    expect(actions.updateCaseFields).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, year: 2025, businessLines: ["branding"] });
    expect(node(meta).textContent).toBe("Illuminazione · 2025");
    expect(screen.getByText("LUM-2026-01")).toBeDefined();
  });

  it("a sector picked in the panel saves through updateClient with the client's other fields", async () => {
    const { actions } = open();
    const meta = find((el) => el.type === "text" && el.bindings !== undefined);
    fireEvent.click(node(meta));
    fireEvent.click(within(leftPanel()).getByRole("radio", { name: "Moda", hidden: true }));
    await flush();
    expect(actions.updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Srl", industry: "moda", description: "Lampade.", logoId: LOGO });
    expect(node(meta).textContent).toBe("Moda · 2026");
  });

  it("the services' pills save the new list; turning off the last one is refused: Serve almeno un servizio.", async () => {
    const { actions } = open();
    const services = find((el) => el.type === "services", "carosello_1_1");
    fireEvent.click(button(/Carosello/));
    fireEvent.click(node(services));
    const group = within(leftPanel()).getByRole("group", { name: t.services, hidden: true });
    fireEvent.click(within(group).getByRole("button", { name: /Branding/, hidden: true }));
    await flush();
    expect(actions.updateCaseFields).not.toHaveBeenCalled();
    expect(status().textContent).toBe(t.needService);
    fireEvent.click(within(group).getByRole("button", { name: dict.businessLines.video, hidden: true }));
    await flush();
    expect(actions.updateCaseFields).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, year: 2026, businessLines: ["branding", "video"] });
  });

  it("Sostituisci logo uploads the file, confirms it, then links it through updateClient", async () => {
    const { actions } = open();
    clientActions.requestClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO, url: "https://upload.test", method: "PUT", headers: {} } });
    clientActions.confirmClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO } });
    uploads.uploadFile.mockResolvedValue(undefined);
    const logos = find((el) => el.type === "logos", "carosello_1_1");
    fireEvent.click(button(/Carosello/));
    fireEvent.click(node(logos));
    expect(button(t.replaceLogo, leftPanel())).toBeDefined();
    const input = leftPanel().querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array(10)], "logo.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await flush();
    expect(clientActions.requestClientLogoUpload).toHaveBeenCalledWith({ clientId: CLIENT_ID, contentType: "image/png", sizeBytes: 10 });
    expect(actions.updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Srl", industry: "illuminazione", description: "Lampade.", logoId: NEW_LOGO });
  });

  /** Picks `logo.png` with Sostituisci logo on Carosello's logos. */
  async function replaceLogo() {
    const logos = find((el) => el.type === "logos", "carosello_1_1");
    fireEvent.click(button(/Carosello/));
    fireEvent.click(node(logos));
    const input = leftPanel().querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array(10)], "logo.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await flush();
  }
  const canvasLogos = () => [...canvas().querySelectorAll<HTMLImageElement>("img.mr-clogo")].map((img) => img.getAttribute("src"));

  it("an upload that fails says so at the top of the canvas and leaves the old logo; nothing is linked", async () => {
    const { actions } = open();
    clientActions.requestClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO, url: "https://upload.test", method: "PUT", headers: {} } });
    clientActions.confirmClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO } });
    uploads.uploadFile.mockRejectedValueOnce(new Error("offline"));
    await replaceLogo();
    expect(status().textContent).toBe(t.errors.failed);
    expect(actions.updateClient).not.toHaveBeenCalled();
    expect(canvasLogos().length).toBeGreaterThan(0);
    for (const src of canvasLogos()) expect(src).toBe("https://cdn.test/logo.png");
  });

  it("CLIENT_LOGO_INVALID from updateClient says so at the top of the canvas and puts the old logo back", async () => {
    const actions = fieldActions();
    actions.updateClient.mockResolvedValueOnce({ ok: false, status: 400, error: { code: "CLIENT_LOGO_INVALID", message: "m" } } as never);
    open({ actions });
    clientActions.requestClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO, url: "https://upload.test", method: "PUT", headers: {} } });
    clientActions.confirmClientLogoUpload.mockResolvedValue({ ok: true, value: { logoId: NEW_LOGO } });
    uploads.uploadFile.mockResolvedValue(undefined);
    await replaceLogo();
    expect(actions.updateClient).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, name: "Lumen Srl", industry: "illuminazione", description: "Lampade.", logoId: NEW_LOGO });
    expect(status().textContent).toBe(t.errors.CLIENT_LOGO_INVALID);
    expect(refresh).not.toHaveBeenCalled();
    expect(canvasLogos().length).toBeGreaterThan(0);
    for (const src of canvasLogos()) expect(src).toBe("https://cdn.test/logo.png");
  });

  it("in Anteprima of an editable case a click on a bound text says Modificalo dall’editor., takes no typing and no field section shows; nothing saves", async () => {
    const { actions, onSave } = open();
    fireEvent.click(button(dict.configurator.preview.enter));
    // The meta line first, while nothing has been said yet.
    const meta = find((el) => el.type === "text" && el.bindings !== undefined);
    fireEvent.click(node(meta));
    expect(node(meta).hasAttribute("contenteditable")).toBe(false);
    expect(status().textContent).toBe(t.fromEditor);
    const name = find(bound("client", "name"));
    fireEvent.click(node(name));
    expect(status().textContent).toBe(t.fromEditor);
    fireEvent.doubleClick(node(name));
    expect(node(name).hasAttribute("contenteditable")).toBe(false);
    expect(node(name).textContent).toBe("Lumen Srl");
    expect(status().textContent).toBe(t.fromEditor);
    for (const at of [find(bound("case", "resultValue", 0)), find(bound("case", "testimonialAuthor"))]) {
      fireEvent.click(node(at));
      expect(node(at).hasAttribute("contenteditable")).toBe(false);
      expect(status().textContent).toBe(t.fromEditor);
    }
    fireEvent.doubleClick(node(meta));
    expect(node(meta).hasAttribute("contenteditable")).toBe(false);
    expect(within(leftPanel()).queryByText(t.clientHeading)).toBeNull();
    expect(within(leftPanel()).queryByText(t.caseHeading)).toBeNull();
    expect(within(leftPanel()).queryByLabelText(t.year)).toBeNull();
    await flush();
    for (const save of Object.values(actions)) expect(save).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("in Anteprima an own text still types on a click and says nothing; an approved case says nothing new", () => {
    open();
    fireEvent.click(button(dict.configurator.preview.enter));
    const own = find((el) => el.type === "text" && el.text !== undefined);
    expect(node(own).getAttribute("contenteditable")).toBe("plaintext-only");
    fireEvent.click(node(own));
    expect(status().textContent).not.toBe(t.fromEditor);
    cleanup();
    open({ editable: false });
    fireEvent.click(button(dict.configurator.preview.enter));
    fireEvent.click(node(find(bound("client", "name"))));
    expect(status().textContent).not.toBe(t.fromEditor);
  });

  it("in Anteprima of Carosello a click on a bound text says Modificalo dall’editor. too; nothing is editable or saved", async () => {
    const { actions } = open();
    fireEvent.click(button(/Carosello/));
    fireEvent.click(button(dict.configurator.preview.enter));
    const name = find(bound("client", "name"), "carosello_1_1");
    expect(node(name)).not.toBeNull();
    fireEvent.click(node(name));
    expect(node(name).hasAttribute("contenteditable")).toBe(false);
    expect(status().textContent).toBe(t.fromEditor);
    await flush();
    for (const save of Object.values(actions)) expect(save).not.toHaveBeenCalled();
  });

  it("a client missing its sector or description can't be renamed here: refused at the double-click, before any typing", () => {
    for (const client of [{ industry: null }, { description: " " }]) {
      const { actions } = open({ fields: { ...FIELDS, client: { ...FIELDS.client, ...client } } });
      const name = find(bound("client", "name"));
      fireEvent.doubleClick(node(name));
      expect(node(name).hasAttribute("contenteditable")).toBe(false);
      expect(status().textContent).toBe(t.needClientInfo);
      expect(actions.updateClient).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it.each(["STALE_STATUS", "NOT_FOUND"])("a field save refused with %s says so and reloads the page once", async (code) => {
    const actions = fieldActions();
    actions.updateClient.mockResolvedValueOnce({ ok: false, status: code === "NOT_FOUND" ? 404 : 409, error: { code, message: "m" } } as never);
    open({ actions });
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    typeAndPress(node(name), "Acme", "Enter");
    await flush();
    expect(status().textContent).toBe(t.errors[code as "STALE_STATUS" | "NOT_FOUND"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(node(name).textContent).toBe("Lumen Srl");
  });

  it("a save that throws says the generic failure and puts the old value back", async () => {
    const actions = fieldActions();
    actions.updateClient.mockRejectedValueOnce(new Error("offline"));
    open({ actions });
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    typeAndPress(node(name), "Acme", "Enter");
    await flush();
    expect(status().textContent).toBe(t.errors.failed);
    expect(node(name).textContent).toBe("Lumen Srl");
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("two service pills pressed before the first save returns", () => {
    function pressTwo() {
      const actions = fieldActions();
      let release: (result: unknown) => void = () => undefined;
      actions.updateCaseFields.mockImplementationOnce(() => new Promise((resolve) => (release = resolve as typeof release)) as never);
      open({ actions });
      const services = find((el) => el.type === "services", "carosello_1_1");
      fireEvent.click(button(/Carosello/));
      fireEvent.click(node(services));
      const group = within(leftPanel()).getByRole("group", { name: t.services, hidden: true });
      fireEvent.click(within(group).getByRole("button", { name: dict.businessLines.video, hidden: true }));
      fireEvent.click(within(group).getByRole("button", { name: dict.businessLines.eventi, hidden: true }));
      return { actions, release: (result: unknown) => release(result) };
    }

    it("the second save holds both changes", async () => {
      const { actions, release } = pressTwo();
      await flush();
      expect(actions.updateCaseFields).toHaveBeenCalledTimes(1);
      expect(actions.updateCaseFields).toHaveBeenLastCalledWith({ caseId: CASE_ID, year: 2026, businessLines: ["branding", "video"] });
      release(saved);
      await flush();
      expect(actions.updateCaseFields).toHaveBeenCalledTimes(2);
      expect(actions.updateCaseFields).toHaveBeenLastCalledWith({ caseId: CASE_ID, year: 2026, businessLines: ["branding", "video", "eventi"] });
    });

    it("when the first fails, the second isn't built on it", async () => {
      const { actions, release } = pressTwo();
      await flush();
      release({ ok: false, status: 400, error: { code: "INVALID_INPUT", message: "m" } });
      await flush();
      expect(actions.updateCaseFields).toHaveBeenCalledTimes(2);
      expect(actions.updateCaseFields).toHaveBeenLastCalledWith({ caseId: CASE_ID, year: 2026, businessLines: ["branding", "eventi"] });
    });
  });

  it("a year of 1899 typed in the panel and Enter: the year message, no save, and the stored year again", async () => {
    const { actions } = open();
    const meta = find((el) => el.type === "text" && el.bindings !== undefined);
    fireEvent.click(node(meta));
    const year = within(leftPanel()).getByLabelText(t.year) as HTMLInputElement;
    year.focus();
    fireEvent.change(year, { target: { value: "1899" } });
    fireEvent.keyDown(year, { key: "Enter" });
    await flush();
    expect(document.activeElement).not.toBe(year);
    expect(status().textContent).toBe(fill(t.yearRange, { min: 1900, max: 2100 }));
    expect(actions.updateCaseFields).not.toHaveBeenCalled();
    expect(year.value).toBe("2026");
  });

  it("Aggiungi settore adds a new name and links its key; a name already listed is picked without adding", async () => {
    const { actions } = open();
    const meta = find((el) => el.type === "text" && el.bindings !== undefined);
    fireEvent.click(node(meta));
    const copy = dict.clientPanel.details.sector;
    const field = () => within(leftPanel()).getByLabelText(copy.newName) as HTMLInputElement;
    fireEvent.change(field(), { target: { value: "Nautica" } });
    fireEvent.click(button(copy.addName, leftPanel()));
    await flush();
    expect(actions.addClientSector).toHaveBeenCalledExactlyOnceWith({ label: "Nautica" });
    expect(actions.updateClient).toHaveBeenLastCalledWith({ clientId: CLIENT_ID, name: "Lumen Srl", industry: "nautica", description: "Lampade.", logoId: LOGO });
    // The page shows the new sector at once, though the loaded list lacks it.
    expect(node(meta).textContent).toBe("Nautica · 2026");
    fireEvent.change(field(), { target: { value: " moda " } });
    fireEvent.keyDown(field(), { key: "Enter" });
    await flush();
    expect(actions.addClientSector).toHaveBeenCalledTimes(1);
    expect(actions.updateClient).toHaveBeenLastCalledWith({ clientId: CLIENT_ID, name: "Lumen Srl", industry: "moda", description: "Lampade.", logoId: LOGO });
    expect(node(meta).textContent).toBe("Moda · 2026");
  });

  it("Sostituisci logo for a client missing its sector uploads nothing and says why", async () => {
    const { actions } = open({ fields: { ...FIELDS, client: { ...FIELDS.client, industry: null } } });
    clientActions.requestClientLogoUpload.mockClear();
    const logos = find((el) => el.type === "logos", "carosello_1_1");
    fireEvent.click(button(/Carosello/));
    fireEvent.click(node(logos));
    fireEvent.click(button(t.replaceLogo, leftPanel()));
    expect(status().textContent).toBe(t.needClientInfo);
    // Even a file that reaches the field is never uploaded.
    await replaceLogo();
    expect(clientActions.requestClientLogoUpload).not.toHaveBeenCalled();
    expect(actions.updateClient).not.toHaveBeenCalled();
  });

  it("without field saves (a client's file, later) a bound text still says it can't be edited yet", () => {
    setup(false, formats, { values: FIELD_VALUES });
    const name = find(bound("client", "name"));
    fireEvent.doubleClick(node(name));
    expect(status().textContent).toBe(dict.configurator.editSoon);
  });
});

describe("Configurator drag-and-drop on the canvas (Story 4.3e)", () => {
  const P1 = formats.presentazione_16_9[0]!.pageKey;
  const P2 = formats.presentazione_16_9[1]!.pageKey;
  const B1 = "cccccccc-0000-4000-8000-000000000001";
  const B2 = "cccccccc-0000-4000-8000-000000000002";
  const B3 = "cccccccc-0000-4000-8000-000000000003";
  const T1 = "cccccccc-0000-4000-8000-000000000011";
  const T2 = "cccccccc-0000-4000-8000-000000000012";
  const T3 = "cccccccc-0000-4000-8000-000000000013";
  const GROUP = "cccccccc-0000-4000-8000-000000000021";
  const G1 = "cccccccc-0000-4000-8000-000000000022";
  const G2 = "cccccccc-0000-4000-8000-000000000023";
  const ONLY = "cccccccc-0000-4000-8000-000000000031";
  const text = (id: string, words = "Ciao"): TextElement => ({ elementId: id, type: "text", style: "text", text: words, provenance: "human_added" });
  const grey = { kind: "colour", value: NEW_BLOCK_COLOUR } as const;

  /** Presentazione's first page: a block of two texts and a block with a split group and a text. Its second: one block of one text. */
  function fixture(): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const [one, two] = pages.presentazione_16_9;
    one!.blocks = [
      { blockId: B1, name: "Uno", background: grey, elements: [text(T1, "Primo"), text(T2, "Secondo")] },
      {
        blockId: B2,
        name: "Due",
        background: { kind: "colour", value: BACKGROUND_SWATCHES[0] },
        elements: [{ elementId: GROUP, type: "text_group", align: "split", splitAt: 2, items: [text(G1), text(G2)] }, text(T3)],
      },
    ];
    two!.blocks = [{ blockId: B3, name: "Tre", background: grey, elements: [text(ONLY, "Solo")] }];
    restartGrid(one!, "presentazione_16_9", "mac-case@1");
    restartGrid(two!, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedPages = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => lastDoc(onSave).formats.presentazione_16_9.pages as Page[];
  const elementIds = (pages: Page[], p: number, b: number) => pages[p]!.blocks[b]!.elements.map((e) => e.elementId);
  const blockNode = (blockId: string) => canvas().querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!;
  const elementNode = (elementId: string) => canvas().querySelector<HTMLElement>(`[data-element-id="${elementId}"]`)!;
  const elementsSection = () => within(leftPanel()).getByRole("region", { name: dict.configurator.tools.elements, hidden: true });
  const elementButton = (name: string) => button(name, elementsSection());
  const grip = () => canvas().querySelector<HTMLElement>('[data-frame="block"] [draggable="true"]');

  /** A drag's data, shared by its start, moves and drop like the browser's. */
  function transfer() {
    const store = new Map<string, string>();
    return {
      get types() {
        return [...store.keys()];
      },
      setData: (type: string, value: string) => void store.set(type, value),
      getData: (type: string) => store.get(type) ?? "",
      setDragImage: () => {},
      dropEffect: "none",
      effectAllowed: "all",
    };
  }
  /** Drags `from` and drops it on `to`. */
  function dragTo(from: HTMLElement, to: HTMLElement) {
    const data = transfer();
    fireEvent.dragStart(from, { dataTransfer: data });
    fireEvent.dragOver(to, { dataTransfer: data });
    fireEvent.drop(to, { dataTransfer: data });
    fireEvent.dragEnd(from, { dataTransfer: data });
  }
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }
  const undo = () => fireEvent.keyDown(document.body, { key: "z", metaKey: true });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });

  it("Testo dragged over a block's 2nd element goes before it, selected, one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    const data = transfer();
    fireEvent.dragStart(elementButton(dict.configurator.elements.text), { dataTransfer: data });
    fireEvent.dragOver(elementNode(T2), { dataTransfer: data });
    expect(pageNode(P1).querySelector('[data-frame="drop"]')).not.toBeNull();
    expect(pageNode(P1).querySelector('[data-frame="drop-line"]')).not.toBeNull();
    fireEvent.drop(elementNode(T2), { dataTransfer: data });
    expect(pageNode(P1).querySelector('[data-frame="drop"]')).toBeNull();
    await settle();
    const pages = savedPages(onSave);
    const added = pages[0]!.blocks[0]!.elements[1]!;
    expect(added).toMatchObject({ type: "text", text: dict.configurator.newTexts.text });
    expect(elementIds(pages, 0, 0)).toEqual([T1, added.elementId, T2]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    expect(pageNode(P1).querySelector('[data-frame="element"]')).not.toBeNull();
    undo();
    await settle();
    expect(elementIds(savedPages(onSave), 0, 0)).toEqual([T1, T2]);
  });

  it("Elementi dropped outside every block changes nothing and says to drop it in a block", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dragTo(elementButton(dict.configurator.elements.title), pageNode(P1));
    expect(status().textContent).toBe(dict.configurator.edit.dropOffBlock);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("Elementi into a full block is refused with the full message and no undo step", async () => {
    const pages = fixture();
    pages.presentazione_16_9[0]!.blocks[0]!.elements = Array.from({ length: 30 }, (_, i) => text(`cccccccc-0000-4000-8000-1${String(i).padStart(11, "0")}`));
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    dragTo(elementButton(dict.configurator.elements.text), blockNode(B1));
    expect(status().textContent).toBe(dict.configurator.edit.blockFull);
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("Blocco dropped on a page adds a block at its end; on a full page it says so", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dragTo(elementButton(dict.configurator.elements.block), pageNode(P2));
    await settle();
    expect(savedPages(onSave)[1]!.blocks.map((b) => b.blockId).slice(0, 1)).toEqual([B3]);
    expect(savedPages(onSave)[1]!.blocks).toHaveLength(2);
    cleanup();
    const full = fixture();
    full.presentazione_16_9[1]!.blocks = Array.from({ length: 6 }, (_, i) => ({ blockId: `cccccccc-0000-4000-8000-2${String(i).padStart(11, "0")}`, name: "B", background: grey, elements: [] }));
    restartGrid(full.presentazione_16_9[1]!, "presentazione_16_9", "mac-case@1");
    setup(false, full);
    dragTo(elementButton(dict.configurator.elements.block), pageNode(P2));
    expect(status().textContent).toBe(dict.configurator.edit.pageFull);
  });

  it("an element dragged to another page's block moves there, selected; ⌘Z puts both pages back and that document saves", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dragTo(elementNode(T1), blockNode(B3));
    await settle();
    let pages = savedPages(onSave);
    expect(elementIds(pages, 0, 0)).toEqual([T2]);
    expect(elementIds(pages, 1, 0)).toEqual([ONLY, T1]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    const saves = onSave.mock.calls.length;
    undo();
    await settle();
    expect(onSave.mock.calls.length).toBe(saves + 1);
    pages = savedPages(onSave);
    expect(elementIds(pages, 0, 0)).toEqual([T1, T2]);
    expect(elementIds(pages, 1, 0)).toEqual([ONLY]);
    expect(pages).toEqual(fixture().presentazione_16_9);
  });

  it("a text dragged out of a Testi group leaves it, the group's splitAt kept within its texts", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dragTo(elementNode(G2), elementNode(T1));
    await settle();
    const pages = savedPages(onSave);
    expect(elementIds(pages, 0, 0)).toEqual([G2, T1, T2]);
    expect(pages[0]!.blocks[1]!.elements[0]).toMatchObject({ elementId: GROUP, splitAt: 1, items: [{ elementId: G1 }] });
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
  });

  it("an element dropped where it already is changes nothing and leaves no undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    dragTo(elementNode(T1), elementNode(T2));
    dragTo(elementNode(T1), elementNode(T1));
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("⠿ Sposta dragged onto another block swaps them; a block's only element drags its block too", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode(B1));
    expect(grip()).not.toBeNull();
    dragTo(grip()!, elementNode(T3));
    await settle();
    let pages = savedPages(onSave);
    expect(pages[0]!.blocks.map((b) => b.blockId)).toEqual([B2, B1]);
    expect(pages[0]!.blocks[0]!.background).toEqual({ kind: "colour", value: BACKGROUND_SWATCHES[0] });
    expect(pages[0]!.grid).toEqual(fixture().presentazione_16_9[0]!.grid);
    // The only element of B3 drags B3: across pages, the two swap.
    dragTo(elementNode(ONLY), blockNode(B2));
    await settle();
    pages = savedPages(onSave);
    expect(pages[0]!.blocks.map((b) => b.blockId)).toEqual([B3, B1]);
    expect(pages[1]!.blocks.map((b) => b.blockId)).toEqual([B2]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    undo();
    undo();
    await settle();
    expect(savedPages(onSave)).toEqual(fixture().presentazione_16_9);
  });

  it("⠿ Sposta dropped on another page outside its blocks moves the block to its end and restarts both grids; on a full page it's refused", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode(B1));
    dragTo(grip()!, pageNode(P2));
    await settle();
    const pages = savedPages(onSave);
    expect(pages[0]!.blocks.map((b) => b.blockId)).toEqual([B2]);
    expect(pages[1]!.blocks.map((b) => b.blockId)).toEqual([B3, B1]);
    for (const page of pages) {
      const restarted = structuredClone(page);
      restartGrid(restarted, "presentazione_16_9", "mac-case@1");
      expect(page.grid).toEqual(restarted.grid);
    }
    cleanup();
    const full = fixture();
    full.presentazione_16_9[1]!.blocks = Array.from({ length: 6 }, (_, i) => ({ blockId: `cccccccc-0000-4000-8000-3${String(i).padStart(11, "0")}`, name: "B", background: grey, elements: [] }));
    restartGrid(full.presentazione_16_9[1]!, "presentazione_16_9", "mac-case@1");
    const refusedSave = vi.fn(savedOk);
    setup(false, full, { onSave: refusedSave });
    fireEvent.click(blockNode(B1));
    dragTo(grip()!, pageNode(P2));
    expect(status().textContent).toBe(dict.configurator.edit.pageFull);
    await settle();
    expect(refusedSave).not.toHaveBeenCalled();
  });

  it("the text being typed in doesn't drag; the others do", () => {
    setup(false, fixture());
    expect(elementNode(T1).getAttribute("draggable")).toBe("true");
    expect(elementNode(GROUP).getAttribute("draggable")).toBe("true");
    fireEvent.doubleClick(elementNode(G1));
    expect(elementNode(G1).getAttribute("draggable")).toBe("false");
    expect(elementNode(GROUP).getAttribute("draggable")).toBe("false");
    expect(elementNode(T1).getAttribute("draggable")).toBe("true");
  });

  it("nothing drags and no drop target shows on an approved case or in Anteprima", async () => {
    for (const mode of ["approved", "preview"] as const) {
      const onSave = vi.fn(savedOk);
      setup(false, fixture(), { onSave, editable: mode !== "approved" });
      if (mode === "preview") fireEvent.click(button(dict.configurator.preview.enter));
      expect(canvas().querySelector('[data-element-id][draggable="true"]')).toBeNull();
      if (mode === "approved") {
        expect(elementButton(dict.configurator.elements.text).getAttribute("draggable")).not.toBe("true");
        fireEvent.click(blockNode(B1));
        expect(grip()).toBeNull();
      }
      const data = transfer();
      data.setData("application/x-mac-element", JSON.stringify({ formatId: "presentazione_16_9", pageKey: P1, elementId: T1 }));
      fireEvent.dragOver(blockNode(B3), { dataTransfer: data });
      expect(canvas().querySelector('[data-frame="drop"], [data-frame="drop-line"], [data-drop-over]')).toBeNull();
      fireEvent.drop(blockNode(B3), { dataTransfer: data });
      await settle();
      expect(onSave).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("Animazione dropped on another block opens its dialog there; Inserisci puts it at the dropped place, one undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode(B1));
    dragTo(elementButton(dict.configurator.elements.animation), elementNode(T3));
    const dialog = () => document.querySelector<HTMLElement>("dialog");
    expect(dialog()).not.toBeNull();
    fireEvent.click(dialog()!.querySelector<HTMLElement>(`[data-pick="${IMAGE}"]`)!);
    fireEvent.click(button(dict.configurator.animationDialog.insert, dialog()!));
    await settle();
    const pages = savedPages(onSave);
    expect(pages[0]!.blocks[1]!.elements.map((e) => e.type)).toEqual(["text_group", "animation", "text"]);
    expect(elementIds(pages, 0, 0)).toEqual([T1, T2]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    undo();
    await settle();
    expect(savedPages(onSave)).toEqual(fixture().presentazione_16_9);
  });

  it("Animazione dropped on a block selects that block, though another was selected", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    fireEvent.click(blockNode(B1));
    dragTo(elementButton(dict.configurator.elements.animation), elementNode(T3));
    fireEvent.click(button(dict.configurator.animationDialog.cancel, document.querySelector<HTMLElement>("dialog")!));
    // The selected block is the one dropped on: Backspace removes it.
    fireEvent.keyDown(document.body, { key: "Backspace" });
    await settle();
    expect(savedPages(onSave)[0]!.blocks.map((b) => b.blockId)).toEqual([B1]);
  });

  it("Animazione off a block or into a full block says why, opens no dialog and leaves no undo step", async () => {
    const pages = fixture();
    pages.presentazione_16_9[1]!.blocks[0]!.elements = Array.from({ length: 30 }, (_, i) => text(`cccccccc-0000-4000-8000-4${String(i).padStart(11, "0")}`));
    const onSave = vi.fn(savedOk);
    setup(false, pages, { onSave });
    dragTo(elementButton(dict.configurator.elements.animation), pageNode(P1));
    expect(status().textContent).toBe(dict.configurator.edit.dropOffBlock);
    dragTo(elementButton(dict.configurator.elements.animation), blockNode(B3));
    expect(status().textContent).toBe(dict.configurator.edit.blockFull);
    expect(document.querySelector("dialog")).toBeNull();
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("elements still drag after the page redraws for new bound values", () => {
    const props = (values: BoundValues, assets: ConfiguratorProps["assets"]): ConfiguratorProps => ({
      caseId: CASE_ID,
      revision: { id: REVISION_ID, version: 4, editable: true, kind: "case_history" },
      onSave: vi.fn(savedOk),
      header: { name: "Rebrand Lumen", code: "LUM-2026-01", status: "in_review" },
      back: { href: "/case-studies", label: dict.configurator.back },
      template: "mac-case@1",
      formats: fixture(),
      assets,
      values,
      generatedTexts: {},
      images: [],
      trial: false,
      theme: "system",
      media: MEDIA,
      mediaRules: MEDIA_RULES,
    });
    const first = props(VALUES, {});
    const { rerender } = render(<Configurator {...first} />);
    expect(elementNode(T1).getAttribute("draggable")).toBe("true");
    // As if the renderer had drawn the node afresh, without the attribute.
    // New bound values (a field saved, the page reloaded). The render assets are the configurator's own
    // state (a rendition read after upload), and reach the same effect through the same props.
    elementNode(T1).removeAttribute("draggable");
    rerender(<Configurator {...first} values={{ ...VALUES, case: { ...VALUES.case, year: 2025 } }} />);
    expect(elementNode(T1).getAttribute("draggable")).toBe("true");
  });

  it("a Pagine thumbnail's drag over the canvas changes nothing", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    const data = transfer();
    data.setData("application/x-mac-page", P2);
    fireEvent.dragOver(elementNode(T2), { dataTransfer: data });
    expect(canvas().querySelector('[data-frame="drop"], [data-frame="drop-line"], [data-drop-over]')).toBeNull();
    fireEvent.drop(elementNode(T2), { dataTransfer: data });
    await settle();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a drag from another format changes nothing and leaves no undo step", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    for (const [type, value] of [
      ["application/x-mac-element", { formatId: "carosello_1_1", pageKey: P1, elementId: T1 }],
      ["application/x-mac-block", { formatId: "carosello_1_1", pageKey: P1, blockId: B1 }],
    ] as const) {
      const data = transfer();
      data.setData(type, JSON.stringify(value));
      fireEvent.dragOver(blockNode(B3), { dataTransfer: data });
      fireEvent.drop(blockNode(B3), { dataTransfer: data });
    }
    await settle();
    expect(onSave).not.toHaveBeenCalled();
    expect(button(dict.configurator.undo).hasAttribute("disabled")).toBe(true);
  });

  it("selects the result: an element moved to another page, a text out of a Testi group, a dropped Blocco", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    const removeSelected = () => fireEvent.keyDown(document.body, { key: "Backspace" });
    dragTo(elementNode(T1), blockNode(B3));
    expect(pageNode(P2).querySelector('[data-frame="element"]')).not.toBeNull();
    expect(pageNode(P1).querySelector('[data-frame="element"]')).toBeNull();
    removeSelected();
    await settle();
    expect(elementIds(savedPages(onSave), 1, 0)).toEqual([ONLY]);
    dragTo(elementNode(G1), elementNode(T2));
    removeSelected();
    await settle();
    expect(elementIds(savedPages(onSave), 0, 0)).toEqual([T2]);
    expect(savedPages(onSave)[0]!.blocks[1]!.elements[0]).toMatchObject({ items: [{ elementId: G2 }] });
    dragTo(elementButton(dict.configurator.elements.block), pageNode(P2));
    await settle();
    expect(savedPages(onSave)[1]!.blocks).toHaveLength(2);
    removeSelected();
    await settle();
    expect(savedPages(onSave)[1]!.blocks.map((b) => b.blockId)).toEqual([B3]);
  });

  it("a Media tile still drops as before, ignoring the canvas drag types", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave });
    const data = transfer();
    data.setData(MEDIA_DRAG_TYPE, IMAGE);
    fireEvent.dragOver(elementNode(T2), { dataTransfer: data });
    fireEvent.drop(elementNode(T2), { dataTransfer: data });
    await settle();
    expect(savedPages(onSave)[0]!.blocks[0]!.elements.map((e) => e.type)).toEqual(["text", "image", "text"]);
  });
});

describe("Configurator client media (Story 4.5c-2)", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000041";
  const BLOCK = "eeeeeeee-0000-4000-8000-000000000042";
  const CLIENT_IMAGE = "cccccccc-0000-4000-8000-000000000041";
  const CLIENT_VIDEO = "cccccccc-0000-4000-8000-000000000042";
  const CLIENT_MEDIA: readonly ListedAsset[] = [listed(CLIENT_IMAGE, "image", "Vetrina.jpg"), listed(CLIENT_VIDEO, "video", "Spot.mp4")];
  const tools = dict.configurator.tools;
  const d = dict.configurator.animationDialog;

  function fixture(): Record<FormatId, Page[]> {
    const pages = structuredClone(starterFormats());
    const page = pages.presentazione_16_9[0]!;
    page.pageKey = P;
    page.blocks = [{ blockId: BLOCK, name: "Blocco", background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [] }];
    restartGrid(page, "presentazione_16_9", "mac-case@1");
    return pages;
  }
  const lastDoc = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => onSave.mock.calls.at(-1)![0].doc;
  const savedPage = (onSave: ReturnType<typeof vi.fn<SaveFn>>) => lastDoc(onSave).formats.presentazione_16_9.pages[0] as Page;
  const blockNode = () => pageNode(P).querySelector<HTMLElement>(`[data-block-id="${BLOCK}"]`)!;
  const openMedia = () => fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
  const clientGroup = () => within(rightPanel()).queryByRole("list", { name: dict.configurator.media.clientGroup, hidden: true });
  const caseGroup = () => within(rightPanel()).queryByRole("list", { name: dict.configurator.media.label, hidden: true });
  const drag = (id: string) => ({ dataTransfer: { types: [MEDIA_DRAG_TYPE], getData: (type: string) => (type === MEDIA_DRAG_TYPE ? id : ""), dropEffect: "none" } });
  const dialog = () => document.querySelector<HTMLElement>("dialog");
  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  }

  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset();
    actions.listAssets.mockResolvedValue({ ok: true, value: MEDIA });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  it("lists the client's images and videos under Del cliente, below the case's, with no star and no remove; search filters both", () => {
    setup(false, fixture(), { clientMedia: CLIENT_MEDIA });
    openMedia();
    expect(within(caseGroup()!).getAllByRole("listitem", { hidden: true }).map((li) => li.dataset.media)).toEqual([IMAGE, VIDEO]);
    const group = clientGroup()!;
    expect(within(group).getAllByRole("listitem", { hidden: true }).map((li) => li.dataset.media)).toEqual([CLIENT_IMAGE, CLIENT_VIDEO]);
    expect(within(rightPanel()).getByRole("heading", { name: dict.configurator.media.clientGroup, hidden: true })).not.toBeNull();
    // Each client tile is one button (place it), with no favourite star and no remove.
    for (const li of within(group).getAllByRole("listitem", { hidden: true })) {
      expect(within(li).getAllByRole("button", { hidden: true })).toHaveLength(1);
      expect(li.querySelector("[aria-pressed]")).toBeNull();
    }
    // Case tiles keep their star.
    expect(within(caseGroup()!).getAllByRole("button", { name: new RegExp(`^${dict.configurator.media.favourite.add}|^${dict.configurator.media.favourite.remove}`), hidden: true })).toHaveLength(2);
    fireEvent.change(within(rightPanel()).getByRole("searchbox", { hidden: true }), { target: { value: "vetrina" } });
    expect(caseGroup()).toBeNull();
    expect(within(clientGroup()!).getAllByRole("listitem", { hidden: true }).map((li) => li.dataset.media)).toEqual([CLIENT_IMAGE]);
    expect(rightPanel().textContent).not.toContain(fill(dict.configurator.media.noMatch, { query: "vetrina" }));
  });

  it("hides the group when the client has no images or videos", () => {
    setup(false, fixture(), { clientMedia: [] });
    openMedia();
    expect(clientGroup()).toBeNull();
    expect(within(rightPanel()).queryByRole("heading", { name: dict.configurator.media.clientGroup, hidden: true })).toBeNull();
    expect(caseGroup()).not.toBeNull();
  });

  it("a client tile clicked into the selected block, or dropped on it, goes on the page and saves", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave, clientMedia: CLIENT_MEDIA });
    openMedia();
    fireEvent.click(blockNode());
    fireEvent.click(within(clientGroup()!).getByRole("button", { name: /^Vetrina\.jpg/, hidden: true }));
    fireEvent.dragOver(blockNode(), drag(CLIENT_VIDEO));
    fireEvent.drop(blockNode(), drag(CLIENT_VIDEO));
    await settle();
    expect(savedPage(onSave).blocks[0]!.elements.map((el) => [el.type, "assetId" in el ? el.assetId : null])).toEqual([
      ["image", CLIENT_IMAGE],
      ["video", CLIENT_VIDEO],
    ]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
    // Marked as on the page, like a case file.
    expect(clientGroup()!.querySelector<HTMLElement>(`[data-media="${CLIENT_IMAGE}"]`)!.dataset.onPage).toBe("");
  });

  it("Sfondo · Immagine offers the client's images (no videos) and takes one as the page's background", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave, clientMedia: CLIENT_MEDIA });
    fireEvent.click(pageNode(P));
    const sfondo = within(leftPanel()).getByRole("region", { name: tools.background, hidden: true });
    fireEvent.click(button(tools.image, sfondo));
    const images = within(sfondo).getByRole("group", { name: tools.backgroundImages, hidden: true });
    expect(within(images).getAllByRole("button", { hidden: true }).map((b) => b.getAttribute("aria-label"))).toEqual(["LUM_cover.jpg", "Vetrina.jpg"]);
    fireEvent.click(button("Vetrina.jpg", images));
    await settle();
    expect(savedPage(onSave).background).toEqual({ kind: "image", assetId: CLIENT_IMAGE });
  });

  it("a save refused for a client file names it with the client file's name", async () => {
    const GONE = "cccccccc-0000-4000-8000-000000000049";
    const onSave = vi.fn<SaveFn>(savedOk).mockResolvedValueOnce({ ok: false, status: 400, error: { code: "ASSET_NOT_ALLOWED", message: "m", assetIds: [GONE] } });
    setup(false, fixture(), { onSave, clientMedia: CLIENT_MEDIA, clientFiles: [{ id: GONE, name: "Catalogo.jpg" }] });
    openMedia();
    fireEvent.click(blockNode());
    fireEvent.click(within(clientGroup()!).getByRole("button", { name: /^Vetrina\.jpg/, hidden: true }));
    await settle();
    expect(screen.getByRole("alert", { hidden: true }).textContent).toContain(fill(dict.configurator.media.missing.one, { name: "Catalogo.jpg" }));
  });

  it("asks once on opening for client files not drawn yet, then again when the Media tab lists files", async () => {
    const onRenderAssets = vi.fn<NonNullable<ConfiguratorProps["onRenderAssets"]>>(async () => ({
      ok: true as const,
      value: { [CLIENT_VIDEO]: { url: "https://cdn.test/spot.mp4", kind: "video" as const } },
    }));
    // The page draws only IMAGE: both client files are missing at first.
    setup(false, fixture(), { clientMedia: CLIENT_MEDIA, onRenderAssets });
    await settle();
    expect(onRenderAssets).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, assetIds: [CLIENT_IMAGE, CLIENT_VIDEO] });
    // The image still without a rendition is asked for again when the Media tab lists files (after an upload).
    const NEW = "bbbbbbbb-0000-4000-8000-000000000047";
    actions.listAssets.mockResolvedValue({ ok: true, value: [...MEDIA, listed(NEW, "image", "nuova.png")] });
    actions.presignAssetUpload.mockResolvedValue({ ok: true, value: { assetId: NEW, url: "https://storage.test/u", method: "PUT", headers: {} } });
    actions.confirmAssetUpload.mockResolvedValue({ ok: true, value: { id: NEW } });
    uploads.uploadFile.mockReset().mockResolvedValue(undefined);
    onRenderAssets.mockClear();
    vi.useRealTimers();
    openMedia();
    const zone = button(`${dict.configurator.media.drop.lead}, ${dict.configurator.media.drop.choose}`, rightPanel());
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "nuova.png", { type: "image/png" })], types: ["Files"] } });
    for (let i = 0; i < 10; i++) await act(async () => {});
    const asked = onRenderAssets.mock.calls.flatMap(([input]) => input.assetIds);
    expect(asked).toEqual(expect.arrayContaining([NEW, CLIENT_IMAGE]));
    expect(asked).not.toContain(CLIENT_VIDEO);
  });

  it("the Animazione dialog offers the client's files after the case's and inserts them", async () => {
    const onSave = vi.fn(savedOk);
    setup(false, fixture(), { onSave, clientMedia: CLIENT_MEDIA });
    fireEvent.click(blockNode());
    const elements = within(leftPanel()).getByRole("region", { name: tools.elements, hidden: true });
    fireEvent.click(button(dict.configurator.elements.animation, elements));
    expect([...dialog()!.querySelectorAll<HTMLElement>("[data-pick]")].map((b) => b.dataset.pick)).toEqual([IMAGE, VIDEO, CLIENT_IMAGE, CLIENT_VIDEO]);
    fireEvent.click(dialog()!.querySelector<HTMLElement>(`[data-pick="${CLIENT_VIDEO}"]`)!);
    fireEvent.click(dialog()!.querySelector<HTMLElement>(`[data-pick="${IMAGE}"]`)!);
    fireEvent.click(button(d.insert, dialog()!));
    await settle();
    expect(savedPage(onSave).blocks[0]!.elements).toEqual([expect.objectContaining({ type: "animation", assetIds: [CLIENT_VIDEO, IMAGE] })]);
    expect(validateNewDocument(lastDoc(onSave))).toMatchObject({ ok: true });
  });
});
