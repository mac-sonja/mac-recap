// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import { fill, it as dict } from "@/shared/i18n/it";
import type { CollectionRow } from "./collections-table";

const refresh = vi.fn();
const renameCollection = vi.fn<(input: unknown) => Promise<ActionResult<{ collectionId: string; version: number; name: string }>>>();
const deleteCollection = vi.fn<(input: unknown) => Promise<ActionResult<void>>>();

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("../actions", () => ({
  renameCollection: (input: unknown) => renameCollection(input),
  deleteCollection: (input: unknown) => deleteCollection(input),
}));

const { CollectionsTable, filterCollections } = await import("./collections-table");

const row = (id: string, name: string, businessLines: CollectionRow["businessLines"], industries: string[]): CollectionRow => ({
  id,
  name,
  version: 3,
  businessLines,
  industries,
  caseCount: 4,
  createdBy: "Giulia",
  updatedAt: "2026-11-10T10:00:00Z",
  updatedLabel: "10 nov, 11:00",
});
const ROWS = [row("c1", "Pitch moda", ["branding"], ["moda"]), row("c2", "Pitch food", ["video"], ["food"])];
const SECTORS = [
  { key: "moda", label: "Moda" },
  { key: "food", label: "Food" },
];
const copy = dict.collections;

beforeEach(() => {
  refresh.mockReset();
  renameCollection.mockReset();
  deleteCollection.mockReset();
});
afterEach(cleanup);

const names = () => [...document.querySelectorAll("[data-collection-id]")].map((el) => el.getAttribute("data-collection-id"));

describe("the Raccolte list (Story 5.10a)", () => {
  it("shows each collection's name, tags, cases, update and creator, linked to it", () => {
    render(<CollectionsTable rows={ROWS} businessLines={["branding", "video"]} sectors={SECTORS} />);
    const first = document.querySelector('[data-collection-id="c1"]') as HTMLElement;
    expect(within(first).getByRole("link", { name: fill(copy.openLabel, { name: "Pitch moda" }) }).getAttribute("href")).toBe("/collections/c1");
    expect(within(first).getByText("Branding")).toBeTruthy();
    expect(within(first).getByText("Moda")).toBeTruthy();
    expect(within(first).getByText(fill(copy.caseCount, { n: 4 }))).toBeTruthy();
    expect(within(first).getByText("10 nov, 11:00")).toBeTruthy();
    expect(within(first).getByText("Giulia")).toBeTruthy();
  });

  it("filters by industry and by business line", async () => {
    const user = userEvent.setup();
    render(<CollectionsTable rows={ROWS} businessLines={["branding", "video"]} sectors={SECTORS} />);
    const filters = screen.getByRole("group", { name: copy.filters.label });
    await user.click(within(filters).getByRole("button", { name: "Moda" }));
    expect(names()).toEqual(["c1"]);
    await user.click(within(filters).getByRole("button", { name: "Video" }));
    expect(screen.getByRole("status").textContent).toBe(copy.noResults);
    await user.click(screen.getByRole("button", { name: copy.filters.clear }));
    expect(names()).toEqual(["c1", "c2"]);
    expect(filterCollections(ROWS, [], ["food"]).map((r) => r.id)).toEqual(["c2"]);
  });

  it("renames with the version, refusing an empty name", async () => {
    const user = userEvent.setup();
    renameCollection.mockResolvedValue({ ok: true, value: { collectionId: "c1", version: 4, name: "Nuovo" } });
    render(<CollectionsTable rows={ROWS} businessLines={["branding", "video"]} sectors={SECTORS} />);
    await user.click(screen.getByRole("button", { name: fill(copy.rename.label, { name: "Pitch moda" }) }));
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByLabelText(copy.form.name);
    await user.clear(field);
    await user.click(within(dialog).getByRole("button", { name: copy.rename.save }));
    expect(within(dialog).getByText(copy.form.errors.name)).toBeTruthy();
    expect(renameCollection).not.toHaveBeenCalled();
    await user.type(field, "Nuovo");
    await user.click(within(dialog).getByRole("button", { name: copy.rename.save }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(renameCollection).toHaveBeenCalledWith({ collectionId: "c1", expectedVersion: 3, name: "Nuovo" });
  });

  it("deletes after confirming", async () => {
    const user = userEvent.setup();
    deleteCollection.mockResolvedValue({ ok: true, value: undefined });
    render(<CollectionsTable rows={ROWS} businessLines={["branding", "video"]} sectors={SECTORS} />);
    await user.click(screen.getByRole("button", { name: fill(copy.delete.label, { name: "Pitch food" }) }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain(fill(copy.delete.title, { name: "Pitch food" }));
    await user.click(within(dialog).getByRole("button", { name: copy.delete.cancel }));
    expect(deleteCollection).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: fill(copy.delete.label, { name: "Pitch food" }) }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: copy.delete.confirm }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(deleteCollection).toHaveBeenCalledWith({ collectionId: "c2" });
  });
});
