// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import { fill, it as dict } from "@/shared/i18n/it";

const push = vi.fn();
const createCollection = vi.fn<(input: unknown) => Promise<ActionResult<{ collectionId: string; version: number; caseIds: string[] }>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/app/(tool)/collections/actions", () => ({ createCollection: (input: unknown) => createCollection(input) }));

const { LibrarySelection, CardCheckbox } = await import("./library-selection");
const { ITEMS_MAX, toggled } = await import("@/app/(tool)/collections/_components/collection-fields");

const OPTIONS = { businessLines: ["branding", "video"] as const, sectors: [{ key: "moda", label: "Moda" }, { key: "food", label: "Food" }] };
const CARDS = [
  { id: "a1", name: "Caso A1" },
  { id: "b1", name: "Caso B1" },
  { id: "a2", name: "Caso A2" },
];

function renderLibrary() {
  render(
    <LibrarySelection options={OPTIONS}>
      <ul>
        {CARDS.map((card) => (
          <li key={card.id}>
            <CardCheckbox id={card.id} name={card.name} />
            <a href={`/case-studies/${card.id}`}>{card.name}</a>
          </li>
        ))}
      </ul>
    </LibrarySelection>,
  );
}

const copy = dict.library.select;

beforeEach(() => {
  push.mockReset();
  createCollection.mockReset();
  createCollection.mockResolvedValue({ ok: true, value: { collectionId: "c1", version: 1, caseIds: ["a1", "a2", "b1"] } });
});
afterEach(cleanup);

describe("the library's selection mode (Story 5.10a)", () => {
  it("caps the selection at what a collection holds (COLLECTION_ITEMS_MAX), saying so", async () => {
    const { COLLECTION_ITEMS_MAX } = await import("@/modules/collection");
    expect(ITEMS_MAX).toBe(COLLECTION_ITEMS_MAX);
    const many = Array.from({ length: ITEMS_MAX + 1 }, (_, i) => ({ id: `c${i}`, name: `Caso ${i}` }));
    render(
      <LibrarySelection options={OPTIONS}>
        {many.map((card) => (
          <CardCheckbox key={card.id} id={card.id} name={card.name} />
        ))}
      </LibrarySelection>,
    );
    for (const card of many) fireEvent.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: card.name }) }));
    expect(screen.getByText(fill(copy.count, { n: ITEMS_MAX }))).toBeTruthy();
    expect(screen.getByText(fill(copy.tooMany, { max: ITEMS_MAX }))).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: fill(copy.card, { name: `Caso ${ITEMS_MAX}` }) }) as HTMLInputElement).checked).toBe(false);
  });

  it("reads one selected card in the singular", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }));
    expect(screen.getByText(copy.countOne)).toBeTruthy();
  });

  it("says when the sectors couldn't be read, and maps a too-long selection refusal", async () => {
    const user = userEvent.setup();
    render(
      <LibrarySelection options={{ ...OPTIONS, sectors: [], sectorsFailed: true }}>
        <CardCheckbox id="a1" name="Caso A1" />
      </LibrarySelection>,
    );
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("button", { name: copy.create }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(dict.collections.form.sectorsFailed)).toBeTruthy();
    cleanup();
    renderLibrary();
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("button", { name: copy.create }));
    const again = await screen.findByRole("dialog");
    await user.type(within(again).getByLabelText(dict.collections.form.name), "Pitch");
    await user.click(within(again).getByRole("button", { name: "Branding" }));
    await user.click(within(again).getByRole("button", { name: "Moda" }));
    createCollection.mockResolvedValueOnce({ ok: false, status: 400, error: { code: "INVALID_INPUT", message: "m", fields: ["caseIds"] } });
    await user.click(within(again).getByRole("button", { name: dict.collections.create.save }));
    await waitFor(() => expect(within(again).getByRole("alert").textContent).toBe(fill(copy.tooMany, { max: ITEMS_MAX })));
  });

  it("shows no bar until a card is ticked, then counts them", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(screen.queryByText(dict.library.select.create)).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso B1" }) }));
    expect(screen.getByText(fill(copy.count, { n: 2 }))).toBeTruthy();
    await user.click(screen.getByRole("button", { name: copy.clear }));
    expect(screen.queryByText(copy.create)).toBeNull();
    expect((screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }) as HTMLInputElement).checked).toBe(false);
  });

  it("creates with the name, the tags and the cases in the order they were ticked, then opens the collection", async () => {
    const user = userEvent.setup();
    renderLibrary();
    for (const name of ["Caso A1", "Caso B1", "Caso A2"]) await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name }) }));
    await user.click(screen.getByRole("button", { name: copy.create }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(dict.collections.form.name), "Pitch moda");
    await user.click(within(dialog).getByRole("button", { name: "Video" }));
    await user.click(within(dialog).getByRole("button", { name: "Branding" }));
    await user.click(within(dialog).getByRole("button", { name: "Moda" }));
    await user.click(within(dialog).getByRole("button", { name: dict.collections.create.save }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/collections/c1"));
    expect(createCollection).toHaveBeenCalledWith({ name: "Pitch moda", businessLines: ["branding", "video"], industries: ["moda"], caseIds: ["a1", "b1", "a2"] });
  });

  it("says what's missing and sends nothing: no name, no business line, no industry", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("button", { name: copy.create }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: dict.collections.create.save }));
    expect(within(dialog).getByText(dict.collections.form.errors.name)).toBeTruthy();
    expect(within(dialog).getByText(dict.collections.form.errors.businessLines)).toBeTruthy();
    expect(within(dialog).getByText(dict.collections.form.errors.industries)).toBeTruthy();
    expect(createCollection).not.toHaveBeenCalled();
  });

  it("names a refused field, and says when a case is no longer approved", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("checkbox", { name: fill(copy.card, { name: "Caso A1" }) }));
    await user.click(screen.getByRole("button", { name: copy.create }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(dict.collections.form.name), "Pitch");
    await user.click(within(dialog).getByRole("button", { name: "Branding" }));
    await user.click(within(dialog).getByRole("button", { name: "Moda" }));
    createCollection.mockResolvedValueOnce({ ok: false, status: 409, error: { code: "CASE_NOT_COLLECTABLE", message: "m" } });
    await user.click(within(dialog).getByRole("button", { name: dict.collections.create.save }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toBe(dict.collections.create.notCollectable));
    createCollection.mockResolvedValueOnce({ ok: false, status: 400, error: { code: "INVALID_INPUT", message: "m", fields: ["industries"] } });
    await user.click(within(dialog).getByRole("button", { name: dict.collections.create.save }));
    await waitFor(() => expect(within(dialog).getByText(dict.collections.form.errors.industries)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});

describe("toggling a tag", () => {
  it("keeps a stored key the list no longer has", () => {
    expect(toggled(["gone", "moda"], "food", ["moda", "food"])).toEqual(["moda", "food", "gone"]);
    expect(toggled(["gone", "moda"], "moda", ["moda", "food"])).toEqual(["gone"]);
  });
});
