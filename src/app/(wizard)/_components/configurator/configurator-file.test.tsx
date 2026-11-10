// @vitest-environment happy-dom
// Story 4.12a: the configurator on a client's whole file (its intro, its approved cases, its
// closing). Case mode and the intro alone (client mode) are covered by configurator.test.tsx
// and configurator-client.test.tsx, unchanged.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { DocumentElement, Page } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { CASE_TEMPLATE, CLIENT_TEMPLATE, FORMAT_IDS, starterPages, TEMPLATE_TEXT_KEYS, type BoundValues, type FormatId } from "@/modules/rendering";
import { fill, it as dict } from "@/shared/i18n/it";
import type { ClientFile, FilePartData } from "./client-file";
import { Configurator, type ConfiguratorProps } from "./configurator";
import type { MediaUploadRules } from "./media-files";
import type { ForkResult, SaveInput } from "./use-document";
import { DEBOUNCE_MS } from "../use-autosave-fields";

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
vi.mock("@/app/(tool)/case-studies/actions", () => ({ listAssets: vi.fn(), presignAssetUpload: vi.fn(), confirmAssetUpload: vi.fn(), setAssetFavourite: vi.fn() }));
vi.mock("@/app/(tool)/clients/actions", () => ({
  requestClientLogoUpload: vi.fn(),
  confirmClientLogoUpload: vi.fn(),
  requestClientMaterialUpload: vi.fn(),
  confirmClientMaterialUpload: vi.fn(),
  listClientMaterial: vi.fn(),
}));

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const INTRO_ID = "44444444-0000-4000-8000-000000000001";
const INTRO_REVISION = "dddddddd-0000-4000-8000-000000000001";
const CASE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CASE_B = "aaaaaaaa-0000-4000-8000-00000000000b";
const CLIENT_IMAGE = "bbbbbbbb-0000-4000-8000-000000000001";
const A_IMAGE = "bbbbbbbb-0000-4000-8000-0000000000a1";
const B_IMAGE = "bbbbbbbb-0000-4000-8000-0000000000b1";
const COPY_A = "eeeeeeee-0000-4000-8000-00000000000a";

const VALUES: BoundValues = {
  client: { name: "Lumen Srl", sector: "Illuminazione", description: "Lampade.", logoUrl: null, results: [{ label: "Vendite", value: "+30%" }], testimonial: null },
  case: { year: null, services: [], results: [], testimonial: null },
};

let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const introFormats = (): Record<FormatId, Page[]> =>
  Object.fromEntries(
    FORMAT_IDS.map((id) => [
      id,
      starterPages(CLIENT_TEMPLATE, "client_intro", id, { newId, texts: { introHead: "Chi è", outroHead: "Insieme" }, images: [], resultRows: 1, hasTestimonial: false }),
    ]),
  ) as Record<FormatId, Page[]>;
const caseFormats = (tag: string): Record<FormatId, Page[]> =>
  Object.fromEntries(
    FORMAT_IDS.map((id) => [
      id,
      starterPages(CASE_TEMPLATE, "case_history", id, {
        newId,
        texts: Object.fromEntries(TEMPLATE_TEXT_KEYS.map((k) => [k, `${tag} ${k}`])),
        images: [],
        resultRows: 1,
        hasTestimonial: false,
      }),
    ]),
  ) as Record<FormatId, Page[]>;

const introPart = (over: Partial<FilePartData> = {}): FilePartData => ({
  key: `client_intro:${INTRO_ID}`,
  subject: { kind: "client_intro", id: INTRO_ID, clientId: CLIENT_ID },
  status: "in_review",
  name: "Lumen Srl",
  code: "LUM",
  template: CLIENT_TEMPLATE,
  formats: introFormats(),
  generatedTexts: {},
  images: [],
  values: VALUES,
  revision: { id: INTRO_REVISION, version: 4, editable: true, kind: "client_intro", fork: false },
  headVersion: 3,
  assets: {},
  ...over,
});
const casePart = (id: string, name: string, code: string, own: string, over: Partial<FilePartData> = {}): FilePartData => ({
  key: `case:${id}`,
  subject: { kind: "case", id },
  status: "approved",
  name,
  code,
  template: CASE_TEMPLATE,
  formats: caseFormats(name),
  generatedTexts: {},
  images: [],
  values: { ...VALUES, case: { year: 2026, services: [], results: [{ label: "visite", value: "+10%" }], testimonial: null } },
  revision: { id: `${id.slice(0, 8)}-1111-4000-8000-000000000001`, version: 2, editable: true, kind: "case_history", fork: true },
  headVersion: 5,
  assets: {},
  ownAssetIds: [own],
  href: `/case-studies/${id}/configurator`,
  ...over,
});

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
const RULES: MediaUploadRules = { maxFiles: 3, maxFileBytes: 50 * 1024 * 1024, contentTypes: ["image/jpeg"], imagePixels: { min: 1600, max: 8000 } };

type Save = (input: SaveInput) => Promise<ActionResult<{ version: number }>>;
const savedOk: Save = async (input) => ({ ok: true, value: { version: input.expectedVersion + 1 } });
const forkedOk = async (input: { expectedHeadVersion: number }): Promise<ActionResult<ForkResult>> => ({
  ok: true,
  value: { revisionId: COPY_A, version: 0, headVersion: input.expectedHeadVersion + 1 },
});

function setup({
  intro = introPart(),
  cases = [casePart(CASE_A, "Rebrand", "LUM-2026-02", A_IMAGE), casePart(CASE_B, "Showroom", "LUM-2026-01", B_IMAGE)],
  onSaveIntro = vi.fn(savedOk),
  onSaveCase = vi.fn(savedOk),
  onForkCase = vi.fn(forkedOk),
  onReload = vi.fn<ClientFile["onReload"]>(async () => ({ ok: true, value: null })),
  onApprove,
}: {
  intro?: FilePartData | null;
  cases?: FilePartData[];
  onSaveIntro?: Save;
  onSaveCase?: Save;
  onForkCase?: ClientFile["onForkCase"];
  onReload?: ClientFile["onReload"];
  onApprove?: ConfiguratorProps["onApprove"];
} = {}) {
  const file: ClientFile = { clientId: CLIENT_ID, intro, cases, onSaveIntro, onSaveCase, onForkCase, onReload };
  render(
    <Configurator
      subject={{ kind: "client_file", id: CLIENT_ID, clientId: CLIENT_ID }}
      revision={null}
      onSave={onSaveIntro}
      header={{ name: "Lumen Srl · Pagine cliente", code: "LUM", ...(intro === null ? {} : { status: intro.status }) }}
      back={{ href: `/clients/${CLIENT_ID}`, label: dict.configurator.clientBack }}
      template={CLIENT_TEMPLATE}
      formats={Object.fromEntries(FORMAT_IDS.map((id) => [id, []])) as unknown as ConfiguratorProps["formats"]}
      assets={{}}
      values={VALUES}
      generatedTexts={{}}
      images={[]}
      trial={false}
      theme="system"
      media={[listed(CLIENT_IMAGE, "client.jpg")]}
      clientMedia={[listed(A_IMAGE, "a.jpg"), listed(B_IMAGE, "b.jpg")]}
      mediaRules={RULES}
      onApprove={onApprove}
      headVersion={3}
      file={file}
    />,
  );
  return { file, onSaveIntro, onSaveCase, onForkCase, onReload };
}

const canvas = () => screen.getByRole("region", { name: dict.configurator.canvas.label, hidden: true });
const rightPanel = () => document.querySelector<HTMLElement>(`aside[aria-label="${dict.configurator.panels.right}"]`)!;
const header = () => document.querySelector<HTMLElement>("header")!;
const status = () => screen.getByRole("status", { hidden: true });
const pageNode = (pageKey: string) => canvas().querySelector<HTMLElement>(`[data-canvas-page="${pageKey}"]`);
const groups = () => [...canvas().querySelectorAll<HTMLElement>("[data-canvas-group]")].map((g) => g.dataset.canvasGroup);
async function flush() {
  for (let i = 0; i < 10; i += 1) await act(async () => {});
}

/** The first own text (no binding) of `page`: its id and words. */
function ownText(page: Page): { id: string; text: string } {
  const walk = (elements: readonly DocumentElement[]): { id: string; text: string } | undefined => {
    for (const el of elements) {
      if (el.type === "text" && el.binding === undefined && el.text !== undefined && el.text !== "") return { id: el.elementId, text: el.text };
      if (el.type === "text_group" || el.type === "row") {
        const inner = walk(el.items as readonly DocumentElement[]);
        if (inner !== undefined) return inner;
      }
    }
    return undefined;
  };
  for (const block of page.blocks) {
    const found = walk(block.elements);
    if (found !== undefined) return found;
  }
  throw new Error(`no own text on ${page.pageKey}`);
}
/** Types `text` into element `id` of the file page `pageKey`, then Esc (the session ends and saves). */
async function type(pageKey: string, id: string, text: string) {
  const target = () => pageNode(pageKey)!.querySelector<HTMLElement>(`[data-element-id="${id}"]`)!;
  fireEvent.doubleClick(target());
  target().textContent = text;
  fireEvent.input(target());
  fireEvent.keyDown(target(), { key: "Escape" });
  await flush();
}
const shownText = (pageKey: string, id: string) => pageNode(pageKey)!.querySelector<HTMLElement>(`[data-element-id="${id}"]`)!.textContent;

beforeEach(() => {
  n = 0;
  Element.prototype.scrollIntoView = vi.fn();
  push.mockReset();
  refresh.mockReset();
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

describe("Configurator on a client's whole file (Story 4.12a)", () => {
  it("shows Introduzione, each case (newest first, as given) and Chiusura, a case without its own intro pages", async () => {
    setup();
    await flush();
    expect(groups()).toEqual(["client_intro", `case:${CASE_A}`, `case:${CASE_B}`, "client_closing"]);
    const headings = [...canvas().querySelectorAll<HTMLElement>("[data-canvas-group]")].map((g) => g.textContent);
    expect(headings).toEqual([
      dict.configurator.clientSections.intro,
      fill(dict.configurator.file.caseLabel, { code: "LUM-2026-02", name: "Rebrand" }),
      fill(dict.configurator.file.caseLabel, { code: "LUM-2026-01", name: "Showroom" }),
      dict.configurator.clientSections.outro,
    ]);
    // The case's own intro page is left out; its other pages, Risultati e testimonial included, stay.
    expect(pageNode(`case:${CASE_A}|intro`)).toBeNull();
    expect(pageNode(`case:${CASE_A}|content`)).not.toBeNull();
    expect(pageNode(`case:${CASE_A}|results`)).not.toBeNull();
    expect(pageNode("client_intro|intro")).not.toBeNull();
    expect(pageNode("client_closing|results")).not.toBeNull();
    // Pages are numbered on through the file.
    const labels = [...canvas().querySelectorAll("span.truncate")].map((s) => s.textContent);
    expect(labels[0]).toMatch(/^1 · /);
    expect(labels.at(-1)).toMatch(new RegExp(`^${labels.length} · `));
  });

  it("leaves out a case's Carosello Chiusura (the file ends with the client's)", async () => {
    setup();
    fireEvent.click(within(header()).getByRole("button", { name: new RegExp(dict.configurator.formats.carosello_1_1), hidden: true }));
    await flush();
    expect(pageNode(`case:${CASE_A}|closing`)).toBeNull();
    expect(pageNode(`case:${CASE_A}|results`)).not.toBeNull();
    expect(pageNode("client_closing|closing")).not.toBeNull();
  });

  it("lists Introduzione, a row per case with its page count, then Chiusura in Pagine; a row scrolls the canvas to its case", async () => {
    setup();
    await flush();
    const eyebrows = [...rightPanel().querySelectorAll("p")].map((p) => p.textContent);
    expect(eyebrows).toEqual(expect.arrayContaining([dict.configurator.clientSections.intro, dict.configurator.file.projects, dict.configurator.clientSections.outro]));
    const row = rightPanel().querySelector<HTMLElement>(`[data-project="case:${CASE_B}"]`)!;
    expect(row.textContent).toContain("Showroom");
    expect(row.textContent).toContain(fill(dict.configurator.file.projectPages, { code: "LUM-2026-01", n: 2 }));
    expect(row.getAttribute("draggable")).toBeNull();
    const scroll = vi.fn();
    canvas().querySelector<HTMLElement>(`[data-canvas-group="case:${CASE_B}"]`)!.scrollIntoView = scroll;
    fireEvent.click(row);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("an edit on a case forks its approved revision, saves the case's whole document to the copy, and marks it unpublished", async () => {
    const { onSaveCase, onForkCase, onSaveIntro, file } = setup();
    await flush();
    const page = file.cases[0]!.formats.presentazione_16_9.find((p) => p.pageKey === "content")!;
    const text = ownText(page);
    await type(`case:${CASE_A}|content`, text.id, "Nuove parole");
    expect(onForkCase).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_A, expectedHeadVersion: 5 });
    expect(onSaveCase).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(onSaveCase).mock.calls[0]![0];
    expect(sent).toMatchObject({ caseId: CASE_A, revisionId: COPY_A, expectedVersion: 0, doc: { kind: "case_history", template: CASE_TEMPLATE } });
    // Saved with its own page keys, its hidden pages (its intro) kept where they were.
    const saved = sent.doc.formats.presentazione_16_9.pages;
    expect(saved.map((p) => p.pageKey)).toEqual(file.cases[0]!.formats.presentazione_16_9.map((p) => p.pageKey));
    expect(JSON.stringify(saved)).toContain("Nuove parole");
    expect(onSaveIntro).not.toHaveBeenCalled();
    // Its heading says so, with the link to the case's own configurator.
    const note = canvas().querySelector(`[data-canvas-group="case:${CASE_A}"]`)!.nextElementSibling as HTMLElement;
    expect(note.textContent).toContain(dict.configurator.file.unpublished);
    expect(within(note).getByRole("link", { name: dict.configurator.file.openCase, hidden: true }).getAttribute("href")).toBe(`/case-studies/${CASE_A}/configurator`);
    expect(canvas().querySelector(`[data-canvas-group="case:${CASE_B}"]`)!.nextElementSibling?.textContent ?? "").not.toContain(dict.configurator.file.unpublished);
  });

  it("an edit on the intro saves to the intro, by clientIntroId", async () => {
    const { onSaveIntro, onSaveCase, file } = setup();
    await flush();
    const text = ownText(file.intro!.formats.presentazione_16_9[0]!);
    await type("client_intro|intro", text.id, "Chi è davvero");
    expect(vi.mocked(onSaveIntro).mock.calls[0]![0]).toMatchObject({ clientIntroId: INTRO_ID, revisionId: INTRO_REVISION, expectedVersion: 4, doc: { kind: "client_intro" } });
    expect(onSaveCase).not.toHaveBeenCalled();
  });

  it("⌘Z undoes across the whole file: the intro edit, then the case's", async () => {
    const { file } = setup();
    await flush();
    const caseText = ownText(file.cases[0]!.formats.presentazione_16_9.find((p) => p.pageKey === "content")!);
    const introText = ownText(file.intro!.formats.presentazione_16_9[0]!);
    await type(`case:${CASE_A}|content`, caseText.id, "Case cambiata");
    await type("client_intro|intro", introText.id, "Intro cambiata");
    expect(shownText(`case:${CASE_A}|content`, caseText.id)).toBe("Case cambiata");
    expect(shownText("client_intro|intro", introText.id)).toBe("Intro cambiata");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await flush();
    expect(shownText("client_intro|intro", introText.id)).toBe(introText.text);
    expect(shownText(`case:${CASE_A}|content`, caseText.id)).toBe("Case cambiata");
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    await flush();
    expect(shownText(`case:${CASE_A}|content`, caseText.id)).toBe(caseText.text);
  });

  it("a stale save on one case reloads that case alone; the other parts keep their edits", async () => {
    const fresh = casePart(CASE_B, "Showroom", "LUM-2026-01", B_IMAGE, { revision: { id: "ffffffff-0000-4000-8000-00000000000b", version: 9, editable: true, kind: "case_history", fork: false } });
    const freshText = ownText(fresh.formats.presentazione_16_9.find((p) => p.pageKey === "content")!);
    const onReload = vi.fn<ClientFile["onReload"]>(async () => ({ ok: true, value: fresh }));
    const onSaveCase = vi.fn<Save>(async (input) =>
      "caseId" in input && input.caseId === CASE_B ? { ok: false, status: 409, error: { code: "STALE_REVISION", message: "m" } } : savedOk(input),
    );
    const { file } = setup({ onReload, onSaveCase });
    await flush();
    const aText = ownText(file.cases[0]!.formats.presentazione_16_9.find((p) => p.pageKey === "content")!);
    const introText = ownText(file.intro!.formats.presentazione_16_9[0]!);
    const bText = ownText(file.cases[1]!.formats.presentazione_16_9.find((p) => p.pageKey === "content")!);
    await type(`case:${CASE_A}|content`, aText.id, "A cambiata");
    await type("client_intro|intro", introText.id, "Intro cambiata");
    await type(`case:${CASE_B}|content`, bText.id, "B cambiata");
    expect(onReload).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, part: "case", caseId: CASE_B });
    expect(refresh).not.toHaveBeenCalled();
    expect(shownText(`case:${CASE_B}|content`, freshText.id)).toBe(freshText.text);
    expect(shownText(`case:${CASE_A}|content`, aText.id)).toBe("A cambiata");
    expect(shownText("client_intro|intro", introText.id)).toBe("Intro cambiata");
    expect(status().textContent).toBe(fill(dict.configurator.file.partReloaded, { part: fill(dict.configurator.file.casePart, { code: "LUM-2026-01" }) }));
    // B's next edit saves to its fresh revision, with its version.
    await type(`case:${CASE_B}|content`, freshText.id, "B di nuovo");
    expect(onSaveCase.mock.calls.at(-1)![0]).toMatchObject({ caseId: CASE_B, revisionId: "ffffffff-0000-4000-8000-00000000000b", expectedVersion: 9 });
  });

  it("deleting a case's page asks first, naming the case; Annulla keeps it, Elimina deletes it from the case", async () => {
    const { onSaveCase } = setup();
    await flush();
    const bin = () => canvas().querySelector<HTMLElement>(`[data-delete-page="case:${CASE_A}|content"]`);
    fireEvent.click(bin()!);
    const dialog = document.querySelector<HTMLElement>("dialog[open]")!;
    expect(dialog.textContent).toContain(dict.configurator.file.deleteTitle);
    expect(dialog.textContent).toContain(fill(dict.configurator.file.deleteDescription, { code: "LUM-2026-02", name: "Rebrand" }));
    fireEvent.click(within(dialog).getByRole("button", { name: dict.configurator.file.deleteCancel, hidden: true }));
    await flush();
    expect(pageNode(`case:${CASE_A}|content`)).not.toBeNull();
    expect(onSaveCase).not.toHaveBeenCalled();
    fireEvent.click(bin()!);
    fireEvent.click(within(document.querySelector<HTMLElement>("dialog[open]")!).getByRole("button", { name: dict.configurator.file.deleteConfirm, hidden: true }));
    await flush();
    expect(pageNode(`case:${CASE_A}|content`)).toBeNull();
  });

  it("deleting an intro page asks nothing, as before", async () => {
    setup();
    await flush();
    fireEvent.click(canvas().querySelector<HTMLElement>('[data-delete-page="client_intro|intro"]')!);
    await flush();
    expect(document.querySelector("dialog[open]")).toBeNull();
    expect(pageNode("client_intro|intro")).toBeNull();
    expect(status().textContent).toBe(dict.configurator.pages.deleted);
  });

  it("refuses another case's image on a case's page, and places the client's", async () => {
    const { onSaveCase } = setup();
    await flush();
    const page = pageNode(`case:${CASE_B}|content`)!;
    const block = page.querySelector<HTMLElement>("[data-block-id]")!;
    fireEvent.click(block);
    fireEvent.click(within(rightPanel()).getByRole("button", { name: dict.configurator.tabs.media, hidden: true }));
    const tile = (name: string) => [...rightPanel().querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.includes(name) || b.getAttribute("aria-label")?.includes(name));
    fireEvent.click(tile("a.jpg")!);
    await flush();
    expect(status().textContent).toBe(dict.configurator.file.otherCase);
    expect(onSaveCase).not.toHaveBeenCalled();
    expect(page.querySelector(`[data-asset-id="${A_IMAGE}"], img[src*="${A_IMAGE}"]`)).toBeNull();
    fireEvent.click(tile("client.jpg")!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50));
    });
    await flush();
    expect(onSaveCase).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(onSaveCase).mock.calls[0]![0].doc)).toContain(CLIENT_IMAGE);
  });

  it("refuses a block moved into another part", async () => {
    setup();
    await flush();
    const from = pageNode(`case:${CASE_A}|content`)!.querySelector<HTMLElement>("[data-block-id]")!;
    fireEvent.click(from);
    const grip = canvas().querySelector<HTMLElement>("[data-grip]")!;
    const data = new Map<string, string>();
    const dataTransfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? "", get types() { return [...data.keys()]; }, setDragImage: () => {}, effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(grip, { dataTransfer });
    fireEvent.drop(pageNode("client_intro|intro")!, { dataTransfer });
    await flush();
    expect(status().textContent).toBe(dict.configurator.file.otherPart);
  });

  it("+ Aggiungi pagina adds to the selected page's part, counting that part's pages only", async () => {
    // Enough cases that the whole file has more pages than one document may hold.
    const many = Array.from({ length: 26 }, (_, i) => casePart(`aaaaaaaa-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`, `Case ${i}`, `LUM-${i}`, A_IMAGE));
    const { onSaveCase, file } = setup({ cases: many });
    await flush();
    const key = many[3]!.key;
    fireEvent.click(pageNode(`${key}|content`)!);
    fireEvent.click(within(canvas()).getByRole("button", { name: dict.configurator.pages.add, hidden: true }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50));
    });
    await flush();
    expect(status().textContent).not.toContain(String(50));
    const sent = vi.mocked(onSaveCase).mock.calls.at(-1)![0];
    expect(sent).toMatchObject({ caseId: many[3]!.subject.id });
    const before = file.cases[3]!.formats.presentazione_16_9.map((p) => p.pageKey);
    const after = sent.doc.formats.presentazione_16_9.pages.map((p) => p.pageKey);
    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]).toMatch(/^p-/);
  });

  it("Approva approves the intro alone, measured on its own pages", async () => {
    const onApprove = vi.fn<NonNullable<ConfiguratorProps["onApprove"]>>(async () => ({ ok: true, value: { waiting: false } }));
    setup({ onApprove });
    await flush();
    fireEvent.click(within(header()).getByRole("button", { name: dict.configurator.approve, hidden: true }));
    fireEvent.click(within(document.querySelector<HTMLElement>("dialog[open]")!).getByRole("button", { name: dict.configurator.approval.confirm, hidden: true }));
    await flush();
    expect(onApprove).toHaveBeenCalledExactlyOnceWith({
      clientIntroId: INTRO_ID,
      revisionId: INTRO_REVISION,
      expectedRevisionVersion: 4,
      expectedHeadVersion: 3,
      overflow: Object.fromEntries(FORMAT_IDS.map((id) => [id, false])),
    });
    expect(push).toHaveBeenCalledExactlyOnceWith(`/clients/${CLIENT_ID}`);
  });

  it("with the intro not ready, Introduzione and Chiusura say so, the cases show, and there is no Approva", async () => {
    setup({ intro: null });
    await flush();
    expect(groups()).toEqual(["client_intro", `case:${CASE_A}`, `case:${CASE_B}`, "client_closing"]);
    expect(canvas().textContent!.split(dict.configurator.file.introNotReady).length - 1).toBe(2);
    expect(within(header()).queryByRole("button", { name: dict.configurator.approve, hidden: true })).toBeNull();
    expect(pageNode(`case:${CASE_A}|content`)).not.toBeNull();
  });
});
