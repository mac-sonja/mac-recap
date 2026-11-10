// @vitest-environment happy-dom
// Story 4.11a: the configurator in client mode (a client's intro and outro). Case mode is
// covered by configurator.test.tsx, unchanged.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_TEMPLATE, FORMAT_IDS, starterPages, type BoundValues, type FormatId } from "@/modules/rendering";
import type { DocumentElement, Page } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { fill, it as dict } from "@/shared/i18n/it";
import { Configurator, type ConfiguratorProps } from "./configurator";
import type { MediaUploadRules } from "./media-files";
import { textElementAt } from "./text-editing";

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

const caseActions = vi.hoisted(() => ({ listAssets: vi.fn(), presignAssetUpload: vi.fn(), confirmAssetUpload: vi.fn(), setAssetFavourite: vi.fn() }));
vi.mock("@/app/(tool)/case-studies/actions", () => caseActions);
const clientActions = vi.hoisted(() => ({
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
  requestClientMaterialUpload: vi.fn(),
  confirmClientMaterialUpload: vi.fn(),
  listClientMaterial: vi.fn(),
}));
vi.mock("@/app/(tool)/clients/actions", () => clientActions);
const uploads = vi.hoisted(() => ({ uploadFile: vi.fn() }));
vi.mock("../../_lib/upload", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../_lib/upload")>()), uploadFile: uploads.uploadFile }));

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const REVISION_ID = "dddddddd-0000-4000-8000-000000000001";
const IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const CASE_IMAGE = "bbbbbbbb-0000-4000-8000-0000000000a1";
const BACK = `/clients/${CLIENT_ID}`;

/** The client template's pages in every format: one result row and a testimonial, so Risultati e testimonial shows. */
function clientFormats(): Record<FormatId, Page[]> {
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const texts = { introHead: "Chi è", introBody: "Il cliente.", outroHead: "Insieme", outroBody: "Il contesto." };
  return Object.fromEntries(
    FORMAT_IDS.map((id) => [id, starterPages(CLIENT_TEMPLATE, "client_intro", id, { newId, texts, images: [IMAGE], resultRows: 1, hasTestimonial: true })]),
  ) as Record<FormatId, Page[]>;
}
const formats = clientFormats();

const VALUES: BoundValues = {
  client: {
    name: "Lumen Srl",
    sector: "Illuminazione",
    description: "Lampade.",
    logoUrl: "https://cdn.test/logo.png",
    results: [{ label: "Vendite", value: "+30%" }],
    testimonial: { quote: "Bravi.", author: "Ada" },
  },
  case: { year: null, services: [], results: [], testimonial: null },
};

const listed = (id: string, name: string): ListedAsset => ({
  id,
  kind: "image",
  originalFileName: name,
  contentType: "image/jpeg",
  sizeBytes: 1000,
  createdAt: "2026-11-06T10:00:00Z",
  isFavourite: false,
  thumbnailUrl: null,
  thumbnailPending: false,
});
const CLIENT_MEDIA = [listed(IMAGE, "LUM_1.jpg")];
const CASE_MEDIA = [listed(CASE_IMAGE, "case.jpg")];
const RULES: MediaUploadRules = { maxFiles: 3, maxFileBytes: 50 * 1024 * 1024, contentTypes: ["image/jpeg", "image/png"], imagePixels: { min: 1600, max: 8000 } };

const FIELDS: NonNullable<ConfiguratorProps["fields"]> = {
  client: { id: CLIENT_ID, name: "Lumen Srl", industry: "illuminazione", description: "Lampade.", logoId: "eeeeeeee-0000-4000-8000-000000000001" },
  record: { results: [{ label: "Vendite", value: "+30%" }], testimonial: { quote: "Bravi.", author: "Ada" } },
};
const OPTIONS: NonNullable<ConfiguratorProps["fieldOptions"]> = {
  sectors: [{ key: "illuminazione", label: "Illuminazione" }],
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
    logoTypes: ["image/png"],
    logoMaxBytes: 5 * 1024 * 1024,
    logoMinShortSide: 400,
  },
  years: { min: 1900, max: 2100 },
  businessLines: ["branding"],
};
const saved = { ok: true as const, value: null };
const fieldActions = () => ({
  updateClient: vi.fn(async () => saved),
  addClientSector: vi.fn(async ({ label }: { label: string }) => ({ ok: true as const, value: { key: label, label } })),
  saveClientResults: vi.fn(async () => saved),
  saveClientTestimonial: vi.fn(async () => saved),
});

type SaveFn = ConfiguratorProps["onSave"];
const savedOk: SaveFn = async (input) => ({ ok: true, value: { version: input.expectedVersion + 1 } });

function setup({
  status = "in_review",
  editable = true,
  onSave = vi.fn(savedOk),
  onApprove,
  onRenderAssets,
  actions = fieldActions(),
  fork,
  onFork,
  onUpdateApproved,
  onDiscard,
}: {
  status?: ConfiguratorProps["header"]["status"];
  editable?: boolean;
  onSave?: SaveFn;
  onApprove?: ConfiguratorProps["onApprove"];
  onRenderAssets?: ConfiguratorProps["onRenderAssets"];
  actions?: ReturnType<typeof fieldActions>;
  /** Story 4.11b: the head is the approved revision, forked on the first save. */
  fork?: boolean;
  onFork?: ConfiguratorProps["onFork"];
  onUpdateApproved?: ConfiguratorProps["onUpdateApproved"];
  onDiscard?: ConfiguratorProps["onDiscard"];
} = {}) {
  render(
    <Configurator
      subject={{ kind: "client_intro", id: INTRO_ID, clientId: CLIENT_ID }}
      revision={{ id: REVISION_ID, version: 4, editable, kind: "client_intro", fork }}
      onSave={onSave}
      header={{ name: "Lumen Srl · Pagine cliente", code: "LUM", status }}
      back={{ href: BACK, label: dict.configurator.clientBack }}
      template={CLIENT_TEMPLATE}
      formats={formats}
      assets={{ [IMAGE]: { url: "https://cdn.test/a.webp", kind: "image" } }}
      values={VALUES}
      generatedTexts={{}}
      images={[IMAGE]}
      trial={false}
      theme="system"
      media={CLIENT_MEDIA}
      clientMedia={CASE_MEDIA}
      mediaRules={RULES}
      onApprove={onApprove}
      onRenderAssets={onRenderAssets}
      headVersion={3}
      onFork={onFork}
      onUpdateApproved={onUpdateApproved}
      onDiscard={onDiscard}
      clientFiles={CASE_MEDIA.map((f) => ({ id: f.id, name: f.originalFileName }))}
      fields={FIELDS}
      fieldOptions={OPTIONS}
      fieldActions={actions}
    />,
  );
  return { onSave, actions };
}

const canvas = () => screen.getByRole("region", { name: dict.configurator.canvas.label, hidden: true });
const rightPanel = () => document.querySelector<HTMLElement>(`aside[aria-label="${dict.configurator.panels.right}"]`)!;
const pageNode = (pageKey: string) => canvas().querySelector<HTMLElement>(`[data-canvas-page="${pageKey}"]`)!;
const button = (name: string | RegExp, within_: HTMLElement = document.body) => within(within_).getByRole("button", { name, hidden: true });
const status = () => screen.getByRole("status", { hidden: true });
async function flush() {
  for (let i = 0; i < 10; i += 1) await act(async () => {});
}

/** The first element of Presentazione matching `match`: its page and id. */
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
const bound = (field: string, index?: number) => (el: DocumentElement) =>
  el.type === "text" && el.binding?.record === "client" && el.binding.field === field && (index === undefined || el.binding.index === index);
const node = (at: { pageKey: string; id: string }) => pageNode(at.pageKey).querySelector<HTMLElement>(`[data-element-id="${at.id}"]`)!;
function typeAndPress(target: HTMLElement, text: string, key: "Enter" | "Escape") {
  target.textContent = text;
  fireEvent.input(target);
  fireEvent.keyDown(target, { key });
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  push.mockReset();
  refresh.mockReset();
  for (const fn of [...Object.values(caseActions), ...Object.values(clientActions)]) fn.mockReset();
  uploads.uploadFile.mockReset().mockResolvedValue(undefined);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Configurator in client mode (Story 4.11a)", () => {
  it("shows the client's title and code, goes back to the client page, and groups the pages as Introduzione and Chiusura", () => {
    setup();
    expect(screen.getByText("Lumen Srl · Pagine cliente")).toBeTruthy();
    expect(screen.getByText("LUM")).toBeTruthy();
    expect(screen.getByRole("link", { name: dict.configurator.clientBack, hidden: true }).getAttribute("href")).toBe(BACK);
    const labels = (root: HTMLElement) => [...new Set([...root.querySelectorAll("p, div")].map((n) => n.textContent ?? ""))];
    const thumbs = [...rightPanel().querySelectorAll("p")].map((p) => p.textContent);
    expect(thumbs).toContain(dict.configurator.clientSections.intro);
    expect(thumbs).toContain(dict.configurator.clientSections.outro);
    expect(thumbs).not.toContain(dict.configurator.sections.risultati);
    expect(labels(canvas())).toContain(dict.configurator.clientSections.outro);
  });

  it("saves an edited text to the intro's revision, named by clientIntroId", async () => {
    const onSave = vi.fn(savedOk);
    setup({ onSave });
    const head = find((el) => el.type === "text" && el.text === "Chi è");
    fireEvent.doubleClick(node(head));
    typeAndPress(node(head), "Chi è davvero", "Escape");
    // Esc ends the typing session, which saves at once.
    await flush();
    expect(onSave).toHaveBeenCalledTimes(1);
    const sent = onSave.mock.calls[0]![0];
    expect(sent).toMatchObject({ clientIntroId: INTRO_ID, revisionId: REVISION_ID, expectedVersion: 4, doc: { kind: "client_intro", template: CLIENT_TEMPLATE } });
    expect("caseId" in sent).toBe(false);
    expect(textElementAt(sent.doc.formats.presentazione_16_9.pages, head.pageKey, head.id)).toMatchObject({ text: "Chi è davvero" });
  });

  it("approves with clientIntroId, then goes back to the client page", async () => {
    const onApprove = vi.fn<NonNullable<ConfiguratorProps["onApprove"]>>(async () => ({ ok: true, value: { waiting: false } }));
    setup({ onApprove });
    await flush();
    const approve = button(dict.configurator.approve, document.querySelector<HTMLElement>("header")!);
    expect(approve.hasAttribute("aria-disabled")).toBe(false);
    fireEvent.click(approve);
    fireEvent.click(button(dict.configurator.approval.confirm, document.querySelector<HTMLElement>("dialog")!));
    await flush();
    expect(onApprove).toHaveBeenCalledWith({
      clientIntroId: INTRO_ID,
      revisionId: REVISION_ID,
      expectedRevisionVersion: 4,
      expectedHeadVersion: 3,
      overflow: Object.fromEntries(FORMAT_IDS.map((id) => [id, false])),
    });
    expect(push).toHaveBeenCalledExactlyOnceWith(BACK);
  });

  it("a refused approval names the intro, not a case", async () => {
    const onApprove = vi.fn<NonNullable<ConfiguratorProps["onApprove"]>>(async () => ({ ok: false, status: 409, error: { code: "STALE_REVISION", message: "m" } }));
    setup({ onApprove });
    await flush();
    fireEvent.click(button(dict.configurator.approve, document.querySelector<HTMLElement>("header")!));
    expect(document.querySelector("dialog")!.textContent).toContain(dict.configurator.clientMode.approvalDescription);
    fireEvent.click(button(dict.configurator.approval.confirm, document.querySelector<HTMLElement>("dialog")!));
    await flush();
    expect(status().textContent).toBe(dict.configurator.clientMode.stale);
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("Pagine di default on the Chiusura page keeps the client's result rows and testimonial (from the client's values)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const onSave = vi.fn(savedOk);
    setup({ onSave });
    fireEvent.click(rightPanel().querySelector<HTMLElement>('[data-thumb="results"]')!);
    const section = within(document.querySelector<HTMLElement>(`aside[aria-label="${dict.configurator.panels.left}"]`)!).getByRole("region", {
      name: dict.configurator.tools.defaultPages,
      hidden: true,
    });
    fireEvent.click(button("Risultati e testimonial", section));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    const results = onSave.mock.calls[0]![0].doc.formats.presentazione_16_9.pages.find((p: Page) => p.pageKey === "results") as Page;
    const bindings = JSON.stringify(results);
    // With the case's (empty) values the template would build no rows and no testimonial.
    expect(bindings).toContain('"field":"resultValue","index":0');
    expect(bindings).toContain('"field":"testimonialQuote"');
  });

  it("an Approvato intro the page marks not editable opens read-only: no Approva, nothing typed", () => {
    const onSave = vi.fn(savedOk);
    setup({ status: "approved", editable: false, onSave });
    const header = document.querySelector<HTMLElement>("header")!;
    expect(within(header).queryByRole("button", { name: dict.configurator.approve, hidden: true })).toBeNull();
    const head = find((el) => el.type === "text" && el.text === "Chi è");
    fireEvent.doubleClick(node(head));
    expect(node(head).hasAttribute("contenteditable")).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  /** Story 4.11b: an Approvato intro, edited on a working copy that goes online only through Aggiorna. */
  describe("an approved intro (Story 4.11b)", () => {
    const u = dict.configurator.approvedEdit;
    const COPY_ID = "dddddddd-0000-4000-8000-000000000002";
    type ForkFn = NonNullable<ConfiguratorProps["onFork"]>;
    type UpdateFn = NonNullable<ConfiguratorProps["onUpdateApproved"]>;
    type DiscardFn = NonNullable<ConfiguratorProps["onDiscard"]>;
    const header = () => document.querySelector<HTMLElement>("header")!;
    const updateButton = () => within(header()).queryByRole("button", { name: u.update, hidden: true });
    const discardButton = () => within(header()).queryByRole("button", { name: u.discard, hidden: true });
    const dialog = () => document.querySelector<HTMLElement>("dialog");
    const tick = async (ms = 1_000) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    const addPage = () => fireEvent.click(button(dict.configurator.pages.add, canvas()));

    function approved(over: { fork?: boolean; onFork?: ForkFn; onUpdateApproved?: UpdateFn; onDiscard?: DiscardFn } = {}) {
      const onSave = vi.fn(savedOk);
      const onFork = vi.fn<ForkFn>(over.onFork ?? (async () => ({ ok: true, value: { revisionId: COPY_ID, version: 0, headVersion: 4 } })));
      const onUpdateApproved = vi.fn<UpdateFn>(over.onUpdateApproved ?? (async () => ({ ok: true, value: undefined })));
      const onDiscard = vi.fn<DiscardFn>(over.onDiscard ?? (async () => ({ ok: true, value: undefined })));
      const onApprove = vi.fn<NonNullable<ConfiguratorProps["onApprove"]>>();
      const actions = fieldActions();
      setup({ status: "approved", fork: over.fork ?? true, onSave, onFork, onUpdateApproved, onDiscard, onApprove, actions });
      return { onSave, onFork, onUpdateApproved, onDiscard, onApprove, actions };
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    });

    it("opens editable under the banner, with no Approva, Aggiorna or Scarta, and never forks by opening", async () => {
      const { onFork, onSave } = approved();
      await tick();
      expect(document.querySelector('[data-editable="true"]')).not.toBeNull();
      expect(screen.getByText(u.banner)).toBeTruthy();
      expect(updateButton()).toBeNull();
      expect(discardButton()).toBeNull();
      expect(within(header()).queryByRole("button", { name: dict.configurator.approve, hidden: true })).toBeNull();
      expect(onFork).not.toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("the first edit forks once by clientIntroId, saves to the copy, and Aggiorna and Scarta appear; later edits reuse the copy", async () => {
      const { onFork, onSave } = approved();
      addPage();
      await tick();
      expect(onFork).toHaveBeenCalledExactlyOnceWith({ clientIntroId: INTRO_ID, expectedHeadVersion: 3 });
      expect(onSave.mock.calls[0]![0]).toMatchObject({ clientIntroId: INTRO_ID, revisionId: COPY_ID, expectedVersion: 0 });
      expect(updateButton()).not.toBeNull();
      expect(discardButton()).not.toBeNull();
      addPage();
      await tick();
      expect(onFork).toHaveBeenCalledTimes(1);
      expect(onSave.mock.calls.map((call) => [call[0].revisionId, call[0].expectedVersion])).toEqual([
        [COPY_ID, 0],
        [COPY_ID, 1],
      ]);
    });

    it("a stale fork reloads and saves nothing", async () => {
      const { onSave } = approved({ onFork: async () => ({ ok: false, status: 409, error: { code: "STALE_HEAD", message: "m" } }) });
      addPage();
      await tick();
      expect(refresh).toHaveBeenCalled();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("reopened with a copy pending: Aggiorna and Scarta show at once, and edits save to the copy without a fork", async () => {
      const { onFork, onSave } = approved({ fork: false });
      await tick();
      expect(updateButton()).not.toBeNull();
      expect(discardButton()).not.toBeNull();
      addPage();
      await tick();
      expect(onFork).not.toHaveBeenCalled();
      expect(onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ clientIntroId: INTRO_ID, revisionId: REVISION_ID, expectedVersion: 4 }));
    });

    it("Aggiorna asks in the intro's words, then updates the copy by clientIntroId and stays on the page", async () => {
      const { onUpdateApproved, onApprove } = approved();
      addPage();
      await tick();
      fireEvent.click(updateButton()!);
      expect(dialog()!.textContent).toContain(u.updateTitle);
      expect(dialog()!.textContent).toContain(dict.configurator.clientMode.updateDescription);
      expect(dialog()!.textContent).not.toContain(u.updateDescription);
      fireEvent.click(button(u.updateConfirm, dialog()!));
      await tick();
      expect(onUpdateApproved).toHaveBeenCalledExactlyOnceWith({
        clientIntroId: INTRO_ID,
        revisionId: COPY_ID,
        expectedRevisionVersion: 1,
        expectedHeadVersion: 4,
        overflow: Object.fromEntries(FORMAT_IDS.map((id) => [id, false])),
      });
      expect(onApprove).not.toHaveBeenCalled();
      expect(updateButton()).toBeNull();
      expect(discardButton()).toBeNull();
      expect(status().textContent).toBe(u.updated);
      expect(push).not.toHaveBeenCalled();
    });

    it("after a successful Aggiorna, with the same page key, the next edit forks the intro again", async () => {
      const onFork = vi
        .fn<ForkFn>()
        .mockResolvedValueOnce({ ok: true, value: { revisionId: COPY_ID, version: 0, headVersion: 4 } })
        .mockResolvedValueOnce({ ok: true, value: { revisionId: "dddddddd-0000-4000-8000-000000000003", version: 0, headVersion: 5 } });
      const { onSave } = approved({ onFork });
      addPage();
      await tick();
      fireEvent.click(updateButton()!);
      fireEvent.click(button(u.updateConfirm, dialog()!));
      await tick();
      expect(updateButton()).toBeNull();
      addPage();
      await tick();
      expect(onFork).toHaveBeenCalledTimes(2);
      expect(onFork).toHaveBeenLastCalledWith({ clientIntroId: INTRO_ID, expectedHeadVersion: 4 });
      expect(onSave.mock.calls.at(-1)![0]).toMatchObject({ clientIntroId: INTRO_ID, revisionId: "dddddddd-0000-4000-8000-000000000003", expectedVersion: 0 });
      expect(updateButton()).not.toBeNull();
    });

    it("a stale update names the intro and reloads, changing nothing", async () => {
      approved({ fork: false, onUpdateApproved: async () => ({ ok: false, status: 409, error: { code: "STALE_HEAD", message: "m" } }) });
      await tick();
      fireEvent.click(updateButton()!);
      fireEvent.click(button(u.updateConfirm, dialog()!));
      await tick();
      expect(status().textContent).toBe(dict.configurator.clientMode.stale);
      expect(refresh).toHaveBeenCalled();
      expect(updateButton()).not.toBeNull();
    });

    it("Scarta asks first, then drops the copy by clientIntroId and reads the intro again", async () => {
      const { onDiscard } = approved();
      addPage();
      await tick();
      fireEvent.click(discardButton()!);
      expect(dialog()!.textContent).toContain(u.discardTitle);
      expect(dialog()!.textContent).toContain(u.discardDescription);
      fireEvent.click(button(u.discardConfirm, dialog()!));
      await tick();
      expect(onDiscard).toHaveBeenCalledExactlyOnceWith({ clientIntroId: INTRO_ID, revisionId: COPY_ID, expectedHeadVersion: 4 });
      expect(refresh).toHaveBeenCalled();
    });

    it("Annulla in the Scarta dialog changes nothing", async () => {
      const { onDiscard } = approved({ fork: false });
      await tick();
      fireEvent.click(discardButton()!);
      fireEvent.click(button(u.cancel, dialog()!));
      await tick();
      expect(onDiscard).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(discardButton()).not.toBeNull();
    });

    it("a stale discard names the intro and reloads", async () => {
      approved({ fork: false, onDiscard: async () => ({ ok: false, status: 409, error: { code: "STALE_HEAD", message: "m" } }) });
      await tick();
      fireEvent.click(discardButton()!);
      fireEvent.click(button(u.discardConfirm, dialog()!));
      await tick();
      expect(status().textContent).toBe(dict.configurator.clientMode.stale);
      expect(refresh).toHaveBeenCalled();
    });

    it("the client's name stays read-only: a double-click gives the existing message and saves nothing", async () => {
      const { onFork, actions } = approved();
      const name = find(bound("name"));
      fireEvent.doubleClick(node(name));
      expect(node(name).hasAttribute("contenteditable")).toBe(false);
      expect(status().textContent).toBe(dict.configurator.editSoon);
      await tick();
      expect(actions.updateClient).not.toHaveBeenCalled();
      expect(onFork).not.toHaveBeenCalled();
    });
  });

  describe("the Media tab", () => {
    const openMedia = () => fireEvent.click(button(dict.configurator.tabs.media, rightPanel()));
    const dropZone = () => button(`${dict.configurator.media.drop.lead}, ${dict.configurator.media.drop.choose}`, rightPanel());
    const drop = (files: File[]) => fireEvent.drop(dropZone(), { dataTransfer: { files, dropEffect: "copy" } });

    it("lists the client's files under Del cliente (no star) and its cases' under Dalle sue case, with the client's drop hint", () => {
      setup();
      openMedia();
      const headings = [...rightPanel().querySelectorAll("h3")].map((h) => h.textContent);
      expect(headings).toEqual([dict.configurator.media.clientGroup, dict.configurator.media.casesGroup]);
      const lists = [...rightPanel().querySelectorAll("ul")];
      expect([...lists[0]!.querySelectorAll("[data-media]")].map((t) => (t as HTMLElement).dataset.media)).toEqual([IMAGE]);
      expect([...lists[1]!.querySelectorAll("[data-media]")].map((t) => (t as HTMLElement).dataset.media)).toEqual([CASE_IMAGE]);
      expect(within(rightPanel()).queryByRole("button", { name: new RegExp(dict.configurator.media.favourite.add), hidden: true })).toBeNull();
      expect(rightPanel().textContent).toContain(dict.configurator.media.drop.clientHint);
    });

    it("uploads a dropped image to the client's material and lists the client's files again", async () => {
      const ADDED = "bbbbbbbb-0000-4000-8000-000000000002";
      clientActions.requestClientMaterialUpload.mockResolvedValue({ ok: true, value: { assetId: ADDED, url: "https://storage.test/u", method: "PUT", headers: {} } });
      clientActions.confirmClientMaterialUpload.mockResolvedValue({ ok: true, value: { id: ADDED } });
      clientActions.listClientMaterial.mockResolvedValue({
        ok: true,
        value: [
          { id: IMAGE, clientId: CLIENT_ID, kind: "image", fileName: "LUM_1.jpg", contentType: "image/jpeg", sizeBytes: 1, createdAt: "x", thumbnailUrl: null },
          { id: ADDED, clientId: CLIENT_ID, kind: "image", fileName: "nuova.png", contentType: "image/png", sizeBytes: 1, createdAt: "x", thumbnailUrl: null },
        ],
      });
      // Every file asked for is drawn, so only a new one is asked for after the upload.
      const onRenderAssets = vi.fn<NonNullable<ConfiguratorProps["onRenderAssets"]>>(async ({ assetIds }) => ({
        ok: true,
        value: Object.fromEntries(assetIds.map((id) => [id, { url: `https://cdn.test/${id}.webp`, kind: "image" as const }])),
      }));
      setup({ onRenderAssets });
      openMedia();
      await flush();
      drop([new File(["x"], "nuova.png", { type: "image/png" })]);
      await flush();
      expect(onRenderAssets).toHaveBeenLastCalledWith({ clientIntroId: INTRO_ID, assetIds: [ADDED] });
      expect(clientActions.requestClientMaterialUpload).toHaveBeenCalledWith({ clientId: CLIENT_ID, contentType: "image/png", sizeBytes: 1 });
      expect(clientActions.confirmClientMaterialUpload).toHaveBeenCalledWith({ clientId: CLIENT_ID, assetId: ADDED, contentType: "image/png", fileName: "nuova.png" });
      expect(clientActions.listClientMaterial).toHaveBeenCalledWith({ clientId: CLIENT_ID });
      expect(caseActions.presignAssetUpload).not.toHaveBeenCalled();
      const first = rightPanel().querySelector("ul")!;
      expect([...first.querySelectorAll("[data-media]")].map((t) => (t as HTMLElement).dataset.media)).toEqual([IMAGE, ADDED]);
    });

    it("an image the server refuses for its size gets the client panel's pixel message", async () => {
      clientActions.requestClientMaterialUpload.mockResolvedValue({ ok: true, value: { assetId: "bbbbbbbb-0000-4000-8000-000000000009", url: "https://storage.test/u", method: "PUT", headers: {} } });
      clientActions.confirmClientMaterialUpload.mockResolvedValue({ ok: false, status: 400, error: { code: "CLIENT_IMAGE_SIZE_INVALID", message: "m" } });
      setup();
      openMedia();
      drop([new File(["x"], "piccola.jpg", { type: "image/jpeg" })]);
      await flush();
      expect(clientActions.confirmClientMaterialUpload).toHaveBeenCalledTimes(1);
      expect(status().textContent).toBe(
        fill(dict.wizard.material.announce.error, { name: "piccola.jpg", message: fill(dict.clientPanel.images.errors.pixels, { min: 1600, max: 8000 }) }),
      );
    });

    it("over the client's file limit, says so with the client limit's message", async () => {
      clientActions.requestClientMaterialUpload.mockResolvedValue({ ok: false, status: 409, error: { code: "CLIENT_MATERIAL_LIMIT", message: "m" } });
      setup();
      openMedia();
      drop([new File(["x"], "troppi.jpg", { type: "image/jpeg" })]);
      await flush();
      expect(status().textContent).toBe(
        fill(dict.wizard.material.announce.error, { name: "troppi.jpg", message: fill(dict.clientPanel.images.errors.limit, { max: 3 }) }),
      );
    });
  });

  describe("field edits", () => {
    it("a result number saves the client's rows through saveClientResults", async () => {
      const { actions } = setup();
      const value = find(bound("resultValue", 0));
      fireEvent.doubleClick(node(value));
      expect(node(value).textContent).toBe("+30%");
      typeAndPress(node(value), "+40%", "Enter");
      await flush();
      expect(actions.saveClientResults).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, results: [{ label: "Vendite", value: "+40%" }] });
      expect(refresh).toHaveBeenCalled();
    });

    it("a testimonial author saves through saveClientTestimonial with the stored quote", async () => {
      const { actions } = setup();
      const author = find(bound("testimonialAuthor"));
      fireEvent.doubleClick(node(author));
      typeAndPress(node(author), "Ada L.", "Enter");
      await flush();
      expect(actions.saveClientTestimonial).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, quote: "Bravi.", author: "Ada L." });
    });

    it("the client's name saves through updateClient with its other fields", async () => {
      const { actions } = setup();
      const name = find(bound("name"));
      fireEvent.doubleClick(node(name));
      typeAndPress(node(name), "Lumen Spa", "Enter");
      await flush();
      expect(actions.updateClient).toHaveBeenCalledExactlyOnceWith({
        clientId: CLIENT_ID,
        name: "Lumen Spa",
        industry: "illuminazione",
        description: "Lampade.",
        logoId: FIELDS.client.logoId,
      });
    });
  });
});
