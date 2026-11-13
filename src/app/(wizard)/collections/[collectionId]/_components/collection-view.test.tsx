// @vitest-environment happy-dom
// Story 5.10a: one collection in the configurator's file view, arranged from Pagine. Story 5.11a:
// its own text edits, hidden pages and page orders.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentElement, Page } from "@/modules/generation";
import {
  BRAND_INTRO,
  BRAND_INTRO_KEY,
  BRAND_OUTRO,
  BRAND_PART_ID,
  BRAND_TITLE_ELEMENT_ID,
  CASE_TEMPLATE,
  CLIENT_TEMPLATE,
  FORMAT_IDS,
  starterPages,
  TEMPLATE_TEXT_KEYS,
  type BoundValues,
  type FormatId,
} from "@/modules/rendering";
import { fill, it as dict } from "@/shared/i18n/it";
import { collectionSegments, NO_EDITS, type CollectionGroup, type PartPages, type ViewEdits } from "./collection-file";
import type { CollectionActions } from "./collection-view";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { requestCollectionExport, getCollectionExportStatus } = vi.hoisted(() => ({ requestCollectionExport: vi.fn(), getCollectionExportStatus: vi.fn() }));
vi.mock("@/app/(wizard)/collections/[collectionId]/actions", () => ({ requestCollectionExport, getCollectionExportStatus }));

const { CollectionView } = await import("./collection-view");

const VALUES: BoundValues = {
  client: { name: "Lumen Srl", sector: "Moda", description: "Lampade.", logoUrl: null, results: [], testimonial: null },
  case: { year: 2026, services: [], results: [], testimonial: null },
};
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const formats = (template: string, kind: "case_history" | "client_intro", tag: string) =>
  Object.fromEntries(
    FORMAT_IDS.map((id) => [
      id,
      starterPages(template, kind, id, {
        newId,
        texts: Object.fromEntries([...TEMPLATE_TEXT_KEYS, "introHead", "outroHead"].map((k) => [k, `${tag} ${k}`])),
        images: [],
        // The client's closing page needs a result row.
        resultRows: 1,
        hasTestimonial: false,
      }),
    ]),
  ) as Record<FormatId, Page[]>;
const casePart = (tag: string): PartPages => ({ template: CASE_TEMPLATE, formats: formats(CASE_TEMPLATE, "case_history", tag), values: VALUES });
const introPart = (): PartPages => ({ template: CLIENT_TEMPLATE, formats: formats(CLIENT_TEMPLATE, "client_intro", "intro"), values: VALUES });

const GROUPS: CollectionGroup[] = [
  {
    clientId: "client-a",
    clientName: "Alfa",
    intro: introPart(),
    cases: [
      { caseId: "a1", name: "Caso A1", code: "ALF-2026-01", part: casePart("A1") },
      { caseId: "a2", name: "Caso A2", code: "ALF-2026-02", part: casePart("A2") },
    ],
  },
  { clientId: "client-b", clientName: "Beta", intro: null, cases: [{ caseId: "b1", name: "Caso B1", code: "BET-2026-01", part: null }] },
];

const write = (caseIds: string[], version = 8) => ({ ok: true as const, value: { collectionId: "c1", version, caseIds } });
const actions = {
  moveGroup: vi.fn<CollectionActions["moveGroup"]>(),
  moveItem: vi.fn<CollectionActions["moveItem"]>(),
  addItems: vi.fn<CollectionActions["addItems"]>(),
  removeItems: vi.fn<CollectionActions["removeItems"]>(),
  retag: vi.fn<CollectionActions["retag"]>(),
  setText: vi.fn<CollectionActions["setText"]>(),
  restoreText: vi.fn<CollectionActions["restoreText"]>(),
  setPageHidden: vi.fn<CollectionActions["setPageHidden"]>(),
  setPageOrder: vi.fn<CollectionActions["setPageOrder"]>(),
};

function view(groups: CollectionGroup[] = GROUPS, version = 7, exportCounts = { available: 2, unavailable: 1 }, edits: ViewEdits = NO_EDITS) {
  return (
    <CollectionView
      key={version}
      id="c1"
      name="Pitch moda"
      version={version}
      tags={{ businessLines: ["branding"], industries: ["moda"] }}
      groups={groups}
      edits={edits}
      assets={{}}
      candidates={[
        { id: "x1", name: "Caso X1", code: "XX-2026-01", clientName: "Xeno", clientCode: "XEN", businessLines: ["video"], industry: "food" },
        { id: "b2", name: "Caso B2", code: "BET-2026-02", clientName: "Beta", clientCode: "BET", businessLines: ["branding"], industry: "food" },
      ]}
      tagOptions={{ businessLines: ["branding", "video"], sectors: [{ key: "moda", label: "Moda" }, { key: "food", label: "Food" }] }}
      actions={actions}
      exportCounts={exportCounts}
    />
  );
}
const renderView = (groups: CollectionGroup[] = GROUPS) => render(view(groups));
const groupOrder = () => [...pagine().querySelectorAll("[data-group]")].map((el) => el.getAttribute("data-group"));

const pagine = () => screen.getByRole("complementary", { name: dict.collection.pages.label });
const copy = dict.collection;

beforeEach(() => {
  refresh.mockReset();
  for (const action of Object.values(actions)) action.mockReset();
});
afterEach(cleanup);

describe("a collection's page (Story 5.10a)", () => {
  it("shows its name, tags, the client's intro and closing around 2 cases, and a case with no approved revision", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Pitch moda" })).toBeTruthy();
    const tags = screen.getByRole("list", { name: copy.tags.label });
    expect(within(tags).getByText("Branding")).toBeTruthy();
    expect(within(tags).getByText("Moda")).toBeTruthy();
    const canvas = screen.getByRole("region", { name: dict.configurator.canvas.label });
    const headings = [...canvas.querySelectorAll("[data-canvas-group]")].map((el) => el.getAttribute("data-canvas-group"));
    // MAC's intro opens the file and its outro closes it, once.
    expect(headings).toEqual(["brand_intro", "client_intro:client-a", "case:a1", "case:a2", "client_closing:client-a", "case:b1", "brand_outro"]);
    expect(within(canvas).getByText(copy.canvas.brandIntro)).toBeTruthy();
    expect(within(canvas).getByText(fill(copy.canvas.intro, { client: "Alfa" }))).toBeTruthy();
    // Read-only: no bin, no Aggiungi pagina, nothing typed in.
    expect(canvas.querySelector("[data-delete-page]")).toBeNull();
    expect(canvas.querySelector("[data-add-page]")).toBeNull();
    expect(canvas.querySelector("[contenteditable]")).toBeNull();
    // Pagine: locked intro and closing rows, and the unavailable case greyed.
    const panel = pagine();
    const locked = [...panel.querySelectorAll("[data-locked]")];
    expect(locked.map((el) => el.getAttribute("data-locked"))).toEqual(["brand_intro", "client_intro:client-a", "client_closing:client-a", "brand_outro"]);
    expect(locked.map((el) => el.querySelector(".lucide-lock")?.parentElement?.textContent)).toEqual([
      copy.pages.brandIntro,
      copy.pages.intro,
      copy.pages.closing,
      copy.pages.brandOutro,
    ]);
    const unavailable = panel.querySelector('[data-row="case:b1"]')!;
    expect(unavailable.hasAttribute("data-unavailable")).toBe(true);
    expect(within(unavailable as HTMLElement).getByText(copy.pages.unavailable)).toBeTruthy();
  });

  it("moves a group with its menu and saves it with the version", async () => {
    const user = userEvent.setup();
    actions.moveGroup.mockResolvedValue(write(["b1", "a1", "a2"]));
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Beta" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveUp }));
    expect(actions.moveGroup).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, clientId: "client-b", to: 0 });
    const order = [...pagine().querySelectorAll("[data-group]")].map((el) => el.getAttribute("data-group"));
    expect(order).toEqual(["client-b", "client-a"]);
  });

  it("moves a case within its group, each save naming the version the last one returned", async () => {
    const user = userEvent.setup();
    actions.moveItem.mockResolvedValueOnce(write(["a2", "a1", "b1"], 8)).mockResolvedValueOnce(write(["a1", "a2", "b1"], 9));
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveDown }));
    await waitFor(() => expect(actions.moveItem).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, caseId: "a1", to: 1 }));
    // Sposta su is offered on the first row only as inactive.
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Caso A2" }) }));
    expect(screen.getByRole("menuitem", { name: copy.pages.moveUp }).getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveDown }));
    await waitFor(() => expect(actions.moveItem).toHaveBeenLastCalledWith({ collectionId: "c1", expectedVersion: 8, caseId: "a2", to: 1 }));
  });

  it("puts the order back on a failed save and says so", async () => {
    const user = userEvent.setup();
    actions.moveGroup.mockResolvedValue({ ok: false, status: 500, error: { code: "COLLECTION_WRITE_FAILED", message: "m" } });
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Beta" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveUp }));
    await waitFor(() => expect(screen.getByRole("status", { hidden: false }).textContent).toBe(copy.orderFailed));
    const order = [...pagine().querySelectorAll("[data-group]")].map((el) => el.getAttribute("data-group"));
    expect(order).toEqual(["client-a", "client-b"]);
  });

  it("reads the page again on a stale move, and the retry names the version read", async () => {
    const user = userEvent.setup();
    actions.moveGroup.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "STALE_COLLECTION", message: "m" } }).mockResolvedValueOnce(write(["b1", "a1", "a2"], 10));
    const { rerender } = renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Beta" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveUp }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole("status").textContent).toBe(dict.collections.stale);
    expect(groupOrder()).toEqual(["client-a", "client-b"]);
    // The refresh hands the page the version the server holds now.
    rerender(view(GROUPS, 9));
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Beta" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveUp }));
    await waitFor(() => expect(actions.moveGroup).toHaveBeenLastCalledWith({ collectionId: "c1", expectedVersion: 9, clientId: "client-b", to: 0 }));
  });

  it("drops the moves queued after a failed one, showing the confirmed order", async () => {
    const user = userEvent.setup();
    let fail: (value: Awaited<ReturnType<CollectionActions["moveGroup"]>>) => void = () => {};
    actions.moveGroup.mockImplementationOnce(() => new Promise((resolve) => (fail = resolve)));
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Beta" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveUp }));
    // A second move, queued behind the first.
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveDown }));
    await act(async () => fail({ ok: false, status: 500, error: { code: "COLLECTION_WRITE_FAILED", message: "m" } }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(copy.orderFailed));
    expect(actions.moveItem).not.toHaveBeenCalled();
    expect(groupOrder()).toEqual(["client-a", "client-b"]);
    const cases = [...pagine().querySelectorAll('[data-group="client-a"] [data-row^="case:"]')].map((el) => el.getAttribute("data-row"));
    expect(cases).toEqual(["case:a1", "case:a2"]);
  });

  it("refuses a case dropped on another client's group, and says why", async () => {
    renderView();
    const source = pagine().querySelector<HTMLElement>('[data-row="case:a1"]')!;
    const target = pagine().querySelector<HTMLElement>('[data-row="case:b1"]')!.closest("li")!;
    const data = new DataTransfer();
    await act(async () => {
      source.dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer: data }));
    });
    const over = Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: data });
    await act(async () => {
      target.dispatchEvent(over);
    });
    // Taken, so the drop fires and can say why it's refused.
    expect(over.defaultPrevented).toBe(true);
    await act(async () => {
      target.dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: data }));
    });
    expect(screen.getByRole("status").textContent).toBe(copy.pages.otherGroup);
    expect(actions.moveItem).not.toHaveBeenCalled();
  });

  it("moves with Alt+↓ from the keyboard", async () => {
    actions.moveItem.mockResolvedValue(write(["a2", "a1", "b1"]));
    renderView();
    const row = pagine().querySelector<HTMLElement>('[data-row="case:a1"]')!;
    row.focus();
    await act(async () => {
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }));
    });
    expect(actions.moveItem).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, caseId: "a1", to: 1 });
  });

  it("removes a case after confirming, then reads the page again", async () => {
    const user = userEvent.setup();
    actions.removeItems.mockResolvedValue(write(["a1", "b1"]));
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Caso A2" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.remove }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(fill(copy.remove.title, { name: "Caso A2" }));
    await user.click(within(dialog).getByRole("button", { name: copy.remove.confirm }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.removeItems).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, caseIds: ["a2"] });
  });

  it("keeps the remove dialog open on Annulla while the removal runs", async () => {
    const user = userEvent.setup();
    let done: (value: Awaited<ReturnType<CollectionActions["removeItems"]>>) => void = () => {};
    actions.removeItems.mockImplementation(() => new Promise((resolve) => (done = resolve)));
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Caso A2" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.remove }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: copy.remove.confirm }));
    await waitFor(() => expect(actions.removeItems).toHaveBeenCalled());
    await user.click(within(dialog).getByRole("button", { name: copy.remove.cancel }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => done(write(["a1", "b1"])));
  });

  it("refuses removing the last case", async () => {
    const user = userEvent.setup();
    renderView([{ clientId: "client-a", clientName: "Alfa", intro: null, cases: [{ caseId: "a1", name: "Caso A1", code: "ALF-2026-01", part: casePart("A1") }] }]);
    await user.click(within(pagine()).getByRole("button", { name: fill(copy.pages.menu, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.remove }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(copy.remove.last);
    expect(actions.removeItems).not.toHaveBeenCalled();
  });

  it("adds cases, those matching the tags listed first", async () => {
    const user = userEvent.setup();
    actions.addItems.mockResolvedValue(write(["a1", "a2", "b1", "b2"]));
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: copy.add.button }));
    const dialog = await screen.findByRole("dialog");
    const names = [...dialog.querySelectorAll("[data-candidate]")].map((el) => el.getAttribute("data-candidate"));
    expect(names).toEqual(["b2", "x1"]);
    await user.type(within(dialog).getByRole("searchbox"), "xeno");
    expect([...dialog.querySelectorAll("[data-candidate]")].map((el) => el.getAttribute("data-candidate"))).toEqual(["x1"]);
    await user.clear(within(dialog).getByRole("searchbox"));
    await user.click(within(dialog).getByRole("checkbox", { name: fill(copy.add.pick, { name: "Caso B2" }) }));
    await user.click(within(dialog).getByRole("button", { name: copy.add.confirm }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.addItems).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, caseIds: ["b2"] });
  });

  it("says when a collection is full", async () => {
    const user = userEvent.setup();
    actions.addItems.mockResolvedValue({ ok: false, status: 409, error: { code: "COLLECTION_FULL", message: "m" } });
    renderView();
    await user.click(within(pagine()).getByRole("button", { name: copy.add.button }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: fill(copy.add.pick, { name: "Caso B2" }) }));
    expect(within(dialog).getByText(copy.add.pickedOne)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: copy.add.confirm }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe(copy.add.full));
  });

  it("says the tags weren't saved when a refusal names no field, and reads the page again when stale", async () => {
    const user = userEvent.setup();
    actions.retag.mockResolvedValueOnce({ ok: false, status: 400, error: { code: "INVALID_INPUT", message: "m", fields: ["collectionId"] } });
    renderView();
    await user.click(screen.getByRole("button", { name: copy.tags.edit }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: copy.tags.save }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe(copy.tags.failed));
    actions.retag.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "STALE_COLLECTION", message: "m" } });
    await user.click(within(dialog).getByRole("button", { name: copy.tags.save }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe(dict.collections.stale));
    expect(refresh).toHaveBeenCalled();
  });

  it("edits the tags with the version", async () => {
    const user = userEvent.setup();
    actions.retag.mockResolvedValue({ ok: true, value: { version: 8, tags: { businessLines: ["branding", "video"], industries: ["moda"] } } });
    renderView();
    await user.click(screen.getByRole("button", { name: copy.tags.edit }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Video" }));
    await user.click(within(dialog).getByRole("button", { name: copy.tags.save }));
    await waitFor(() => expect(actions.retag).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, businessLines: ["branding", "video"], industries: ["moda"] }));
    await waitFor(() => expect(within(screen.getByRole("list", { name: copy.tags.label })).getByText("Video")).toBeTruthy());
  });
});

describe("a collection's own edits (Story 5.11a)", () => {
  const F = "presentazione_16_9";
  const edited = (version = 8) => ({ ok: true as const, value: { collectionId: "c1", version } });
  /** Case A1's first page shown (its own intro pages are left out: client A wraps it). */
  const a1Page = () => collectionSegments(GROUPS, F).find((s) => s.key === "case:a1")!.entries[0]!;
  const texts = (page: Page) => {
    const out: DocumentElement[] = [];
    const walk = (els: readonly DocumentElement[]) => {
      for (const el of els) {
        out.push(el);
        if (el.type === "text_group" || el.type === "row") walk(el.items);
      }
    };
    for (const b of page.blocks) walk(b.elements);
    return out;
  };
  const freeText = (page: Page) => texts(page).find((el) => el.type === "text" && el.text !== undefined && el.text !== "")! as Extract<DocumentElement, { type: "text" }>;
  const node = (shownKey: string, elementId: string) => document.querySelector<HTMLElement>(`[data-canvas-page="${shownKey}"] [data-element-id="${elementId}"]`)!;
  const canvas = () => screen.getByRole("region", { name: dict.configurator.canvas.label });
  const edits = dict.collection.edits;
  const openRun = async (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(within(pagine()).getByRole("button", { name: fill(edits.pagesOf, { name }) }));

  it("double-click a free text, type, leave it: saved in the collection, marked, the case's pages untouched", async () => {
    actions.setText.mockResolvedValue(edited());
    renderView();
    const { page, pageKey } = a1Page();
    const el = freeText(page);
    const original = el.text;
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    const typing = node(page.pageKey, el.elementId);
    expect(typing.getAttribute("contenteditable")).toBe("plaintext-only");
    typing.textContent = "Parole della raccolta";
    fireEvent.input(typing);
    fireEvent.focusOut(typing);
    await waitFor(() =>
      expect(actions.setText).toHaveBeenCalledWith({
        collectionId: "c1",
        expectedVersion: 7,
        part: { kind: "case", id: "a1" },
        formatId: F,
        pageKey,
        elementId: el.elementId,
        text: "Parole della raccolta",
      }),
    );
    expect(node(page.pageKey, el.elementId).textContent).toContain("Parole della raccolta");
    expect(canvas().querySelector(`[data-text-mark="${el.elementId}"]`)?.textContent).toContain(edits.edited);
    // The revision's own page is never changed.
    expect(GROUPS[0]!.cases[0]!.part!.formats[F].find((p) => p.pageKey === pageKey)!.blocks).toEqual(page.blocks.map((b) => b));
    expect(freeText(GROUPS[0]!.cases[0]!.part!.formats[F].find((p) => p.pageKey === pageKey)!).text).toBe(original);
  });

  it("Enter on a one-line text saves it", async () => {
    actions.setText.mockResolvedValue(edited());
    renderView();
    const { page } = a1Page();
    const el = freeText(page);
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    const typing = node(page.pageKey, el.elementId);
    typing.textContent = "Una riga";
    fireEvent.input(typing);
    fireEvent.keyDown(typing, { key: "Enter" });
    await waitFor(() => expect(actions.setText).toHaveBeenCalledWith(expect.objectContaining({ text: "Una riga" })));
  });

  it("opens nothing on a client or case field", async () => {
    renderView();
    const segments = collectionSegments(GROUPS, F);
    const bound = segments
      .flatMap((s) => s.pages.map((page) => ({ page, el: texts(page).find((x) => x.type === "text" && (x.binding !== undefined || x.bindings !== undefined)) })))
      .find((x) => x.el !== undefined)!;
    fireEvent.doubleClick(node(bound.page.pageKey, bound.el!.elementId));
    expect(canvas().querySelector("[contenteditable]")).toBeNull();
  });

  it("refuses a text over the document's limit, saving nothing", async () => {
    renderView();
    const { page } = a1Page();
    const el = freeText(page);
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    const typing = node(page.pageKey, el.elementId);
    typing.textContent = "x".repeat(5001);
    fireEvent.input(typing);
    fireEvent.focusOut(typing);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(fill(edits.textTooLong, { max: 5000 })));
    expect(actions.setText).not.toHaveBeenCalled();
  });

  it("puts the text back when the save fails", async () => {
    actions.setText.mockResolvedValue({ ok: false, status: 500, error: { code: "COLLECTION_WRITE_FAILED", message: "m" } });
    renderView();
    const { page } = a1Page();
    const el = freeText(page);
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    const typing = node(page.pageKey, el.elementId);
    typing.textContent = "Persa";
    fireEvent.input(typing);
    fireEvent.focusOut(typing);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(edits.textFailed));
    expect(node(page.pageKey, el.elementId).textContent).not.toContain("Persa");
    expect(canvas().querySelector("[data-text-mark]")).toBeNull();
  });

  it("Ripristina testo originale removes the edit", async () => {
    const user = userEvent.setup();
    actions.restoreText.mockResolvedValue(edited());
    const { page, pageKey } = a1Page();
    const el = freeText(page);
    const saved: ViewEdits = { ...NO_EDITS, texts: [{ partKey: "case:a1", formatId: F, pageKey, elementId: el.elementId, text: "Mia", originalChanged: false }] };
    render(view(GROUPS, 7, undefined, saved));
    expect(node(page.pageKey, el.elementId).textContent).toContain("Mia");
    await user.click(within(canvas()).getByRole("button", { name: edits.restoreText }));
    expect(actions.restoreText).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, part: { kind: "case", id: "a1" }, formatId: F, pageKey, elementId: el.elementId });
    await waitFor(() => expect(canvas().querySelector("[data-text-mark]")).toBeNull());
    expect(node(page.pageKey, el.elementId).textContent).toContain(el.text!.slice(0, 5));
  });

  it("keeps its words when the original changed, shows the original and can use it", async () => {
    const user = userEvent.setup();
    actions.restoreText.mockResolvedValue(edited());
    const { page, pageKey } = a1Page();
    const el = freeText(page);
    const saved: ViewEdits = { ...NO_EDITS, texts: [{ partKey: "case:a1", formatId: F, pageKey, elementId: el.elementId, text: "Mia", originalChanged: true }] };
    render(view(GROUPS, 7, undefined, saved));
    expect(node(page.pageKey, el.elementId).textContent).toContain("Mia");
    const mark = canvas().querySelector<HTMLElement>(`[data-text-mark="${el.elementId}"]`)!;
    expect(mark.textContent).toContain(edits.originalChanged);
    await user.click(within(mark).getByRole("button", { name: edits.showOriginal }));
    expect(within(mark).getByRole("note").textContent).toContain(el.text!);
    await user.click(within(mark).getByRole("button", { name: edits.useOriginal }));
    expect(actions.restoreText).toHaveBeenCalledWith(expect.objectContaining({ part: { kind: "case", id: "a1" }, pageKey, elementId: el.elementId }));
  });

  it("hides a page from Pagine with Nascondi: gone from the canvas (no strip), faded in Pagine with Mostra", async () => {
    const user = userEvent.setup();
    actions.setPageHidden.mockResolvedValueOnce(edited(8)).mockResolvedValueOnce(edited(9));
    renderView();
    const { page, pageKey } = a1Page();
    const canvasText = canvas().textContent;
    await openRun(user, "Caso A1");
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: page.name }) }));
    expect(screen.queryByRole("menuitem", { name: "Elimina dalla raccolta" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: edits.hidePage }));
    expect(edits.hidePage).toBe("Nascondi");
    expect(actions.setPageHidden).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, part: { kind: "case", id: "a1" }, formatId: F, pageKey, hidden: true });
    expect(canvas().querySelector(`[data-canvas-page="${page.pageKey}"]`)).toBeNull();
    // Nothing in its place on the canvas.
    expect(canvas().querySelector("[data-hidden-page]")).toBeNull();
    expect(canvasText).not.toContain(edits.restorePage);
    expect(within(canvas()).queryByRole("button", { name: edits.restorePage })).toBeNull();
    // Still in Pagine, faded, with Mostra.
    const row = pagine().querySelector<HTMLElement>(`[data-page-row="${pageKey}"]`)!;
    expect(row.hasAttribute("data-hidden")).toBe(true);
    expect(row.className).toContain("opacity-50");
    expect(row.textContent).toContain(edits.hiddenRow);
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: page.name }) }));
    await user.click(screen.getByRole("menuitem", { name: edits.restorePage }));
    expect(edits.restorePage).toBe("Mostra");
    await waitFor(() => expect(actions.setPageHidden).toHaveBeenLastCalledWith({ collectionId: "c1", expectedVersion: 8, part: { kind: "case", id: "a1" }, formatId: F, pageKey, hidden: false }));
    expect(canvas().querySelector(`[data-canvas-page="${page.pageKey}"]`)).toBeTruthy();
    expect(pagine().querySelector(`[data-page-row="${pageKey}"]`)!.hasAttribute("data-hidden")).toBe(false);
  });

  it("keeps a run whose pages are all hidden in Pagine, so Mostra can bring them back", async () => {
    const user = userEvent.setup();
    const intro = collectionSegments(GROUPS, F).find((s) => s.key === "client_intro:client-a")!;
    const saved: ViewEdits = { ...NO_EDITS, hidden: intro.entries.map((e) => ({ partKey: "client_intro:client-a", formatId: F, pageKey: e.pageKey })) };
    render(view(GROUPS, 7, undefined, saved));
    expect(canvas().querySelector('[data-canvas-group="client_intro:client-a"]')).toBeNull();
    expect(pagine().querySelector('[data-locked="client_intro:client-a"]')).toBeTruthy();
    await openRun(user, copy.pages.intro);
    expect(pagine().querySelector(`[data-page-row="${intro.entries[0]!.pageKey}"]`)!.hasAttribute("data-hidden")).toBe(true);
  });

  it("hides a client intro page like any other", async () => {
    const user = userEvent.setup();
    actions.setPageHidden.mockResolvedValue(edited());
    renderView();
    const intro = collectionSegments(GROUPS, F).find((s) => s.key === "client_intro:client-a")!.entries[0]!;
    await openRun(user, copy.pages.intro);
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: intro.page.name }) }));
    await user.click(screen.getByRole("menuitem", { name: edits.hidePage }));
    expect(actions.setPageHidden).toHaveBeenCalledWith(expect.objectContaining({ part: { kind: "client_intro", id: "client-a" }, pageKey: intro.pageKey, hidden: true }));
  });

  it("refuses to hide a part's last page", async () => {
    const user = userEvent.setup();
    const run = collectionSegments(GROUPS, F).find((s) => s.key === "case:a1")!;
    const [last, ...others] = run.entries;
    // A1's own intro pages aren't shown here: hide every other page of the part too.
    const allKeys = GROUPS[0]!.cases[0]!.part!.formats[F].map((p) => p.pageKey).filter((k) => k !== last!.pageKey);
    const saved: ViewEdits = { ...NO_EDITS, hidden: allKeys.map((pageKey) => ({ partKey: "case:a1", formatId: F, pageKey })) };
    expect(others.length).toBeGreaterThan(0);
    render(view(GROUPS, 7, undefined, saved));
    await openRun(user, "Caso A1");
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: last!.page.name }) }));
    await user.click(screen.getByRole("menuitem", { name: edits.hidePage }));
    expect(screen.getByRole("status").textContent).toBe(edits.lastPage);
    expect(actions.setPageHidden).not.toHaveBeenCalled();
  });

  it("moves a page down within its part and saves the part's whole order; a failure puts it back", async () => {
    const user = userEvent.setup();
    actions.setPageOrder.mockResolvedValue({ ok: false, status: 500, error: { code: "COLLECTION_WRITE_FAILED", message: "m" } });
    renderView();
    const run = collectionSegments(GROUPS, F).find((s) => s.key === "case:a1")!;
    const [first, second] = run.entries;
    const all = GROUPS[0]!.cases[0]!.part!.formats[F].map((p) => p.pageKey);
    await openRun(user, "Caso A1");
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: first!.page.name }) }));
    await user.click(screen.getByRole("menuitem", { name: copy.pages.moveDown }));
    const expected = all.map((k) => (k === first!.pageKey ? second!.pageKey : k === second!.pageKey ? first!.pageKey : k));
    expect(actions.setPageOrder).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, part: { kind: "case", id: "a1" }, formatId: F, pageKeys: expected });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(copy.orderFailed));
    const shown = [...canvas().querySelectorAll('[data-canvas-page^="case:a1|"]')].map((el) => el.getAttribute("data-canvas-page"));
    expect(shown.slice(0, 2)).toEqual([first!.page.pageKey, second!.page.pageKey]);
  });

  /** Opens A1's first free text, types `words`, and returns it (still open). */
  const typeIn = (words: string) => {
    const { page } = a1Page();
    const el = freeText(page);
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    const typing = node(page.pageKey, el.elementId);
    typing.textContent = words;
    fireEvent.input(typing);
    return { typing, el, page };
  };

  it("reads the pages again when an edit is refused on out-of-date pages", async () => {
    actions.setText.mockResolvedValue({ ok: false, status: 409, error: { code: "TEXT_NOT_EDITABLE", message: "m" } });
    renderView();
    const { typing } = typeIn("Altro");
    fireEvent.focusOut(typing);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(edits.notEditable));
    expect(refresh).toHaveBeenCalled();
    expect(canvas().querySelector("[data-text-mark]")).toBeNull();
  });

  it("saves the open text before switching format or Anteprima, in the format it was typed in", async () => {
    const user = userEvent.setup();
    actions.setText.mockResolvedValue(edited());
    renderView();
    typeIn("Prima del cambio");
    await user.click(screen.getByRole("button", { name: /Carosello/ }));
    await waitFor(() => expect(actions.setText).toHaveBeenCalledTimes(1));
    expect(actions.setText).toHaveBeenCalledWith(expect.objectContaining({ formatId: F, text: "Prima del cambio" }));
    actions.setText.mockClear();
    await user.click(screen.getByRole("button", { name: /Presentazione/ }));
    typeIn("Prima di Anteprima");
    await user.click(screen.getByRole("button", { name: dict.configurator.preview.enter }));
    await waitFor(() => expect(actions.setText).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ formatId: F, text: "Prima di Anteprima" })));
  });

  it("normalises the typed words and never saves blank ones", async () => {
    actions.setText.mockResolvedValue(edited());
    renderView();
    const blank = typeIn(" \u00a0\n ");
    fireEvent.focusOut(blank.typing);
    await act(async () => {});
    expect(actions.setText).not.toHaveBeenCalled();
    expect(node(blank.page.pageKey, blank.el.elementId).textContent).toContain(blank.el.text!.slice(0, 5));
    const words = typeIn("Due\u00a0parole \n");
    fireEvent.focusOut(words.typing);
    await waitFor(() => expect(actions.setText).toHaveBeenCalledWith(expect.objectContaining({ text: "Due parole" })));
  });

  it("saves an edit whose original changed again with the same words, clearing the mark", async () => {
    actions.setText.mockResolvedValue(edited());
    const { page, pageKey } = a1Page();
    const el = freeText(page);
    const saved: ViewEdits = { ...NO_EDITS, texts: [{ partKey: "case:a1", formatId: F, pageKey, elementId: el.elementId, text: "Mia", originalChanged: true }] };
    render(view(GROUPS, 7, undefined, saved));
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    fireEvent.focusOut(node(page.pageKey, el.elementId));
    await waitFor(() => expect(actions.setText).toHaveBeenCalledWith(expect.objectContaining({ elementId: el.elementId, text: "Mia" })));
    expect(canvas().querySelector(`[data-text-mark="${el.elementId}"]`)?.textContent).toContain(edits.edited);
  });

  it("opens MAC's \"Our projects\" title for typing and saves it in the collection as MAC's part; MAC's other texts open nothing", async () => {
    actions.setText.mockResolvedValue(edited());
    renderView();
    const intro = `brand_intro|${BRAND_INTRO_KEY}`;
    const title = node(intro, BRAND_TITLE_ELEMENT_ID);
    expect(title.textContent).toBe("Our projects");
    // A fixed MAC text (the company's name) is not an element: nothing opens.
    fireEvent.doubleClick(canvas().querySelector<HTMLElement>(`[data-canvas-page="${intro}"] .mr-brand-name`)!);
    expect(canvas().querySelector("[contenteditable]")).toBeNull();
    fireEvent.doubleClick(title);
    const typing = node(intro, BRAND_TITLE_ELEMENT_ID);
    expect(typing.getAttribute("contenteditable")).toBe("plaintext-only");
    typing.textContent = "I nostri progetti";
    fireEvent.input(typing);
    fireEvent.focusOut(typing);
    await waitFor(() =>
      expect(actions.setText).toHaveBeenCalledWith({
        collectionId: "c1",
        expectedVersion: 7,
        part: { kind: "brand", id: BRAND_PART_ID },
        formatId: F,
        pageKey: BRAND_INTRO_KEY,
        elementId: BRAND_TITLE_ELEMENT_ID,
        text: "I nostri progetti",
      }),
    );
    expect(node(intro, BRAND_TITLE_ELEMENT_ID).textContent).toBe("I nostri progetti");
    expect(canvas().querySelector(`[data-text-mark="${BRAND_TITLE_ELEMENT_ID}"]`)?.textContent).toContain(edits.edited);
  });

  it("hides MAC's intro like any page, and refuses to hide MAC's last page shown", async () => {
    const user = userEvent.setup();
    actions.setPageHidden.mockResolvedValue(edited());
    renderView();
    await openRun(user, copy.pages.brandIntro);
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: BRAND_INTRO.name }) }));
    await user.click(screen.getByRole("menuitem", { name: edits.hidePage }));
    expect(actions.setPageHidden).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 7, part: { kind: "brand", id: BRAND_PART_ID }, formatId: F, pageKey: BRAND_INTRO_KEY, hidden: true });
    expect(canvas().querySelector('[data-canvas-group="brand_intro"]')).toBeNull();
    expect(canvas().querySelector('[data-canvas-group="brand_outro"]')).toBeTruthy();
    await openRun(user, copy.pages.brandOutro);
    await user.click(within(pagine()).getByRole("button", { name: fill(edits.pageMenu, { name: BRAND_OUTRO.name }) }));
    await user.click(screen.getByRole("menuitem", { name: edits.hidePage }));
    expect(screen.getByRole("status").textContent).toBe(edits.lastPage);
    expect(actions.setPageHidden).toHaveBeenCalledTimes(1);
  });

  it("Anteprima shows no marks and no hidden page, and a double-click opens nothing", async () => {
    const user = userEvent.setup();
    const { page, pageKey } = a1Page();
    const el = freeText(page);
    const saved: ViewEdits = {
      ...NO_EDITS,
      texts: [{ partKey: "case:a1", formatId: F, pageKey, elementId: el.elementId, text: "Mia", originalChanged: false }],
      hidden: [{ partKey: "case:a1", formatId: F, pageKey: collectionSegments(GROUPS, F).find((s) => s.key === "case:a1")!.entries[1]!.pageKey }],
    };
    render(view(GROUPS, 7, undefined, saved));
    const hiddenKey = collectionSegments(GROUPS, F, saved).find((s) => s.key === "case:a1")!.entries.find((e) => e.hidden)!.page.pageKey;
    expect(canvas().querySelector("[data-text-mark]")).toBeTruthy();
    expect(canvas().querySelector(`[data-canvas-page="${hiddenKey}"]`)).toBeNull();
    await user.click(screen.getByRole("button", { name: dict.configurator.preview.enter }));
    expect(canvas().querySelector("[data-text-mark]")).toBeNull();
    expect(canvas().querySelector(`[data-canvas-page="${hiddenKey}"]`)).toBeNull();
    fireEvent.doubleClick(node(page.pageKey, el.elementId));
    expect(node(page.pageKey, el.elementId).getAttribute("contenteditable")).not.toBe("plaintext-only");
    // Its words still show the collection's.
    expect(node(page.pageKey, el.elementId).textContent).toContain("Mia");
  });

  it("applies saved page orders and hidden pages when it opens", () => {
    const run = collectionSegments(GROUPS, F).find((s) => s.key === "case:a1")!;
    const all = GROUPS[0]!.cases[0]!.part!.formats[F].map((p) => p.pageKey);
    const saved: ViewEdits = {
      ...NO_EDITS,
      orders: [{ partKey: "case:a1", formatId: F, pageKeys: [...all].reverse() }],
      hidden: [{ partKey: "case:a1", formatId: F, pageKey: run.entries[0]!.pageKey }],
    };
    render(view(GROUPS, 7, undefined, saved));
    const shown = [...canvas().querySelectorAll('[data-canvas-page^="case:a1|"]')].map((el) => el.getAttribute("data-canvas-page")!.split("|")[1]);
    const expected = [...all].reverse().filter((k) => run.entries.some((e) => e.pageKey === k) && k !== run.entries[0]!.pageKey);
    expect(shown).toEqual(expected);
  });
});

describe("Esporta (Story 5.10b)", () => {
  const label = fill(dict.download.collectionLabel, { name: "Pitch moda" });
  const dialog = () => document.querySelector("dialog")!;

  it("opens the export dialog for the collection, saying how many unavailable cases are left out", async () => {
    requestCollectionExport.mockResolvedValue({ ok: true, value: { status: "pending", jobId: "job-1" } });
    render(view());
    const button = screen.getByRole("button", { name: label, hidden: true });
    expect(button.textContent).toContain(dict.download.collectionAction);
    await userEvent.click(button);
    expect(dialog().textContent).toContain(fill(dict.download.collectionTitle, { name: "Pitch moda" }));
    expect(dialog().textContent).toContain(fill(dict.download.collectionDescription, { n: 2 }));
    expect(dialog().textContent).toContain(fill(dict.download.collectionUnavailable, { n: 1 }));
    const confirm = within(dialog()).getByRole("button", { name: dict.download.collectionAction, hidden: true });
    await userEvent.click(confirm);
    await waitFor(() => expect(requestCollectionExport).toHaveBeenCalledExactlyOnceWith({ collectionId: "c1", formats: ["presentazione_16_9"] }));
  });

  it("has no note when every case is available, and no Esporta when none is", () => {
    const { unmount } = render(view(GROUPS, 7, { available: 3, unavailable: 0 }));
    expect(screen.getByRole("button", { name: label, hidden: true })).toBeTruthy();
    expect(document.body.textContent).not.toContain(fill(dict.download.collectionUnavailable, { n: 0 }));
    unmount();
    render(view(GROUPS, 7, { available: 0, unavailable: 3 }));
    expect(screen.queryByRole("button", { name: label, hidden: true })).toBeNull();
  });

  it("shows a refusal in the dialog", async () => {
    requestCollectionExport.mockResolvedValue({ ok: false, status: 409, error: { code: "NOT_APPROVED", message: "x" } });
    render(view());
    await userEvent.click(screen.getByRole("button", { name: label, hidden: true }));
    await userEvent.click(within(dialog()).getByRole("button", { name: dict.download.collectionAction, hidden: true }));
    await screen.findByText(dict.download.collectionNotApproved);
  });
});
