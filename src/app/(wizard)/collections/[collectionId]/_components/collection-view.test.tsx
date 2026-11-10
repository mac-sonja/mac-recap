// @vitest-environment happy-dom
// Story 5.10a: one collection in the configurator's file view, read-only, arranged from Pagine.
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@/modules/generation";
import { CASE_TEMPLATE, CLIENT_TEMPLATE, FORMAT_IDS, starterPages, TEMPLATE_TEXT_KEYS, type BoundValues, type FormatId } from "@/modules/rendering";
import { fill, it as dict } from "@/shared/i18n/it";
import type { CollectionGroup, PartPages } from "./collection-file";
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
};

function view(groups: CollectionGroup[] = GROUPS, version = 7) {
  return (
    <CollectionView
      key={version}
      id="c1"
      name="Pitch moda"
      version={version}
      tags={{ businessLines: ["branding"], industries: ["moda"] }}
      groups={groups}
      assets={{}}
      candidates={[
        { id: "x1", name: "Caso X1", code: "XX-2026-01", clientName: "Xeno", clientCode: "XEN", businessLines: ["video"], industry: "food" },
        { id: "b2", name: "Caso B2", code: "BET-2026-02", clientName: "Beta", clientCode: "BET", businessLines: ["branding"], industry: "food" },
      ]}
      tagOptions={{ businessLines: ["branding", "video"], sectors: [{ key: "moda", label: "Moda" }, { key: "food", label: "Food" }] }}
      actions={actions}
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
    expect(headings).toEqual(["client_intro:client-a", "case:a1", "case:a2", "client_closing:client-a", "case:b1"]);
    expect(within(canvas).getByText(fill(copy.canvas.intro, { client: "Alfa" }))).toBeTruthy();
    // Read-only: no bin, no Aggiungi pagina, nothing typed in.
    expect(canvas.querySelector("[data-delete-page]")).toBeNull();
    expect(canvas.querySelector("[data-add-page]")).toBeNull();
    expect(canvas.querySelector("[contenteditable]")).toBeNull();
    // Pagine: locked intro and closing rows, and the unavailable case greyed.
    const panel = pagine();
    const locked = [...panel.querySelectorAll("[data-locked]")];
    expect(locked.map((el) => el.getAttribute("data-locked"))).toEqual(["client_intro:client-a", "client_closing:client-a"]);
    expect(locked.map((el) => el.querySelector(".lucide-lock")?.parentElement?.textContent)).toEqual([copy.pages.intro, copy.pages.closing]);
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
