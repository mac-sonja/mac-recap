// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, starterPages, type BoundValues, type FormatId } from "@/modules/rendering";
import { fill, it as dict } from "@/shared/i18n/it";
import { CaseView } from "./case-view";

const deleteCaseStudy = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ deleteCaseStudy: (input: unknown) => deleteCaseStudy(input) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const EDIT_HREF = `/case-studies/${CASE_ID}/configurator`;

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

function setup({ trial = false, editHref = EDIT_HREF as string | null, deleteCaseId = CASE_ID as string | null } = {}) {
  return render(
    <CaseView
      header={{ name: "Rebrand Lumen", code: "LUM-2026-01", status: "approved" }}
      back={{ href: "/case-studies", label: dict.caseView.back }}
      template="mac-case@1"
      formats={formats}
      assets={{ [IMAGE]: { url: "https://cdn.test/a.webp", kind: "image" } }}
      values={VALUES}
      trial={trial}
      editHref={editHref}
      deleteCaseId={deleteCaseId}
    />,
  );
}

const preview = dict.configurator.preview;
const canvas = () => screen.getByRole("region", { name: dict.configurator.canvas.label, hidden: true });
// By its label attribute: the Scarica picker's fieldset is a "Formato" group too.
const formatsGroup = () => document.querySelector<HTMLElement>(`[role="group"][aria-label="${dict.configurator.formats.label}"]`)!;
const format = (name: string) => within(formatsGroup()).getByRole("button", { name: new RegExp(`^${name}`), hidden: true });
const button = (name: string | RegExp) => screen.getByRole("button", { name, hidden: true });
/** The page's Elimina, not the one inside its (closed) dialog. */
const deleteTrigger = () =>
  screen.getAllByRole("button", { name: dict.caseStudies.delete.approvedButton, hidden: true }).find((b) => b.closest("dialog") === null)!;
const slideCaption = () => canvas().querySelector("[data-slideshow] p")?.textContent;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  deleteCaseStudy.mockReset();
  vi.restoreAllMocks();
});

describe("CaseView", () => {
  it("shows the header like a client's page: back, name, code, badge, formats, Scarica and Modifica to the configurator", () => {
    setup();
    expect(screen.getByRole("link", { name: dict.caseView.back, hidden: true }).getAttribute("href")).toBe("/case-studies");
    expect(screen.getByRole("heading", { level: 1, name: "Rebrand Lumen", hidden: true })).toBeTruthy();
    expect(screen.getByText("LUM-2026-01")).toBeTruthy();
    expect(document.querySelector('[data-status="approved"]')).not.toBeNull();
    expect(within(formatsGroup()).getAllByRole("button", { hidden: true }).map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Presentazione16:9", "true"],
      ["Carosello1:1", "false"],
      ["Video9:16", "false"],
    ]);
    expect(button(fill(dict.download.caseLabel, { name: "Rebrand Lumen" }))).toBeTruthy();
    expect(screen.getByRole("link", { name: dict.caseView.edit, hidden: true }).getAttribute("href")).toBe(EDIT_HREF);
    // Read-only: no Anteprima eye, no undo, no Approva, no panels.
    expect(screen.queryByRole("button", { name: preview.enter, hidden: true })).toBeNull();
    expect(screen.queryByRole("button", { name: dict.configurator.approve, hidden: true })).toBeNull();
    expect(document.querySelector("aside")).toBeNull();
    expect(screen.getByText(dict.caseView.narrowScreen)).toBeTruthy();
  });

  it("shows Raccolte with its empty line, and Elimina bottom left after it", () => {
    setup();
    const heading = screen.getByRole("heading", { level: 2, name: dict.caseView.collections.heading, hidden: true });
    expect(screen.getByText(dict.caseView.collections.empty)).toBeTruthy();
    const remove = deleteTrigger();
    expect(heading.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(remove.parentElement?.className).toContain("justify-start");
  });

  it("Elimina asks for the typed word and deletes the approved case", async () => {
    deleteCaseStudy.mockResolvedValue({ ok: true, value: undefined });
    setup();
    fireEvent.click(deleteTrigger());
    const dialog = screen.getByRole("dialog", { name: fill(dict.caseStudies.delete.title, { name: "Rebrand Lumen" }), hidden: true });
    expect(dialog.textContent).toContain(dict.caseStudies.delete.approvedDescription);
    fireEvent.change(within(dialog).getByLabelText(dict.caseStudies.delete.confirmLabel), { target: { value: "elimina" } });
    fireEvent.click(within(dialog).getByRole("button", { name: dict.caseStudies.delete.confirm, hidden: true }));
    expect(deleteCaseStudy).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, status: "approved" });
  });

  it("leaves ← → inside the open Elimina dialog alone: the slide stays", () => {
    setup();
    fireEvent.click(format("Carosello"));
    fireEvent.click(deleteTrigger());
    const input = within(screen.getByRole("dialog", { name: fill(dict.caseStudies.delete.title, { name: "Rebrand Lumen" }), hidden: true })).getByLabelText(dict.caseStudies.delete.confirmLabel);
    expect(fireEvent.keyDown(input, { key: "ArrowRight" })).toBe(true);
    expect(slideCaption()).toContain(`1 di ${formats.carosello_1_1.length}`);
  });

  it("shows no Elimina without `delete case` on an approved case", () => {
    setup({ deleteCaseId: null });
    expect(screen.queryAllByRole("button", { name: dict.caseStudies.delete.approvedButton, hidden: true })).toEqual([]);
    expect(screen.getByText(dict.caseView.collections.empty)).toBeTruthy();
  });

  it("shows no Modifica without `edit`", () => {
    setup({ editHref: null });
    expect(screen.queryByRole("link", { name: dict.caseView.edit, hidden: true })).toBeNull();
    expect(button(fill(dict.download.caseLabel, { name: "Rebrand Lumen" }))).toBeTruthy();
  });

  it("stacks Presentazione's pages, and a click selects nothing", () => {
    setup();
    const pages = canvas().querySelectorAll<HTMLElement>("[data-canvas-page]");
    expect(pages).toHaveLength(formats.presentazione_16_9.length);
    expect(canvas().querySelector("[data-slideshow]")).toBeNull();
    fireEvent.click(pages[0]!.querySelector("[data-block-id]") ?? pages[0]!);
    fireEvent.click(pages[1]!);
    expect(canvas().querySelector("[data-selected]")).toBeNull();
    expect(canvas().querySelector("[data-frame]")).toBeNull();
    expect(pages[0]!.className).not.toContain("cursor-pointer");
  });

  it("shows Carosello as a slideshow that ← → step through, leaving modified arrows to the browser", () => {
    setup();
    fireEvent.click(format("Carosello"));
    expect(format("Carosello").getAttribute("aria-pressed")).toBe("true");
    const n = formats.carosello_1_1.length;
    expect(slideCaption()).toBe(fill(preview.slide, { i: 1, n, name: formats.carosello_1_1[0]!.name }));
    expect(fireEvent.keyDown(document, { key: "ArrowRight", metaKey: true })).toBe(true);
    expect(slideCaption()).toContain(`1 di ${n}`);
    expect(fireEvent.keyDown(document, { key: "ArrowRight" })).toBe(false);
    expect(slideCaption()).toContain(`2 di ${n}`);
    for (let i = 0; i < n + 2; i++) fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(slideCaption()).toContain(`${n} di ${n}`);
    fireEvent.click(button(preview.previous));
    expect(slideCaption()).toContain(`${n - 1} di ${n}`);
    // Nothing on the slide is selectable.
    fireEvent.click(canvas().querySelector("[data-slide] [data-canvas-page]")!);
    expect(canvas().querySelector("[data-selected], [data-frame]")).toBeNull();
  });

  it("restarts the slideshow on its first page when the format changes, and Presentazione ignores the arrows", () => {
    setup();
    fireEvent.click(format("Carosello"));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.click(format("Video"));
    expect(slideCaption()).toContain(`1 di ${formats.video_9_16.length}`);
    fireEvent.click(format("Presentazione"));
    expect(fireEvent.keyDown(document, { key: "ArrowRight" })).toBe(true);
  });

  it("leaves ← → inside the open Scarica dialog to its radios: the slide stays", () => {
    setup();
    fireEvent.click(format("Carosello"));
    fireEvent.click(button(fill(dict.download.caseLabel, { name: "Rebrand Lumen" })));
    const dialog = screen.getByRole("dialog", { name: fill(dict.download.caseTitle, { name: "Rebrand Lumen" }), hidden: true });
    const radio = within(dialog).getAllByRole("radio", { hidden: true })[0]!;
    expect(fireEvent.keyDown(radio, { key: "ArrowRight" })).toBe(true);
    expect(slideCaption()).toContain(`1 di ${formats.carosello_1_1.length}`);
  });

  it.each([true, false])("with reduced motion %s, the slide enters with a fade only without it", (reduce) => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(
      (query: string) =>
        ({ matches: reduce && query === "(prefers-reduced-motion: reduce)", addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList,
    );
    try {
      setup();
      fireEvent.click(format("Carosello"));
      expect(canvas().querySelector("[data-slide]")!.className.includes("animate-enter")).toBe(!reduce);
    } finally {
      window.matchMedia = original;
    }
  });

  it("draws Instagram's Reel over a Video page", () => {
    setup();
    fireEvent.click(format("Video"));
    const group = screen.getByRole("group", { name: preview.instagram.label, hidden: true });
    expect(canvas().querySelector("[data-instagram]")).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Reel", hidden: true }));
    const reel = canvas().querySelector<HTMLElement>("[data-instagram]")!;
    expect(reel.dataset.instagram).toBe("reel");
    expect(reel.querySelector(".ig-text")?.textContent).toBe("Rebrand Lumen");
    // No Animazione testi switch: that is the editor's.
    expect(screen.queryByRole("switch", { hidden: true })).toBeNull();
  });

  it("shows the Bozza di prova note with the starter pages", () => {
    setup({ trial: true });
    expect(canvas().textContent).toContain(dict.configurator.trial.title);
  });
});
