// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/app/_lib/action-result";
import type { Client } from "@/modules/case-study";
import type { ClientRow } from "./filter-sort";

const push = vi.fn();
const refresh = vi.fn();
const createClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();
const renameClient = vi.fn<(input: unknown) => Promise<ActionResult<Client>>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/app/(tool)/clients/actions", () => ({
  createClient: (input: unknown) => createClient(input),
  renameClient: (input: unknown) => renameClient(input),
}));

const { ClientsTable } = await import("./clients-table");
const { SEARCH_DEBOUNCE_MS } = await import("@/app/(tool)/case-studies/_components/case-studies-table");

const LUMEN: ClientRow = { id: "cccccccc-0000-4000-8000-000000000001", code: "LUM", name: "Lumen Srl", caseCount: 2 };
const rows: ClientRow[] = [
  LUMEN,
  { id: "cccccccc-0000-4000-8000-000000000002", code: "CIT", name: "Città di Torino", caseCount: 10 },
  { id: "cccccccc-0000-4000-8000-000000000003", code: "ACM", name: "Acme", caseCount: 0 },
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[1].textContent);
const header = (name: string) => screen.getByRole("columnheader", { name: new RegExp(name) });
const addButton = () => screen.getByRole("button", { name: "Aggiungi cliente" });
const nameField = () => screen.getByLabelText("Nome del cliente") as HTMLInputElement;
const dialog = () => screen.queryByRole("dialog");
const submit = () => screen.getByRole("button", { name: "Aggiungi" });

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  createClient.mockReset();
  renameClient.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ClientsTable", () => {
  it("lists by name A–Z with the code in mono and the count", () => {
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
    expect(header("Nome").getAttribute("aria-sort")).toBe("ascending");
    const cells = within(screen.getAllByRole("row")[3]).getAllByRole("cell");
    expect(cells[0].textContent).toBe("LUM");
    expect(cells[0].className).toContain("font-mono");
    expect(cells[2].textContent).toBe("2");
  });

  it("sorts by a header click and reverses on a second click", () => {
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    fireEvent.click(within(header("Case history")).getByRole("button"));
    expect(names()).toEqual(["Acme", "Lumen Srl", "Città di Torino"]);
    fireEvent.click(within(header("Case history")).getByRole("button"));
    expect(names()).toEqual(["Città di Torino", "Lumen Srl", "Acme"]);
    fireEvent.click(within(header("Codice")).getByRole("button"));
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
  });

  it("searches name and code after the debounce, ignoring case and accents", () => {
    vi.useFakeTimers();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Cerca nome o codice" }), { target: { value: "CITTA" } });
    expect(names()).toHaveLength(3);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(names()).toEqual(["Città di Torino"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "lum" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(names()).toEqual(["Lumen Srl"]);
  });

  it("shows no results in a live status region with a clear-search button", () => {
    vi.useFakeTimers();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.getByRole("status").textContent).toBe("Nessun cliente per 'zzz'.");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancella ricerca" }));
    expect(names()).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("opens the client's page on a row click and links the name", () => {
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    expect(screen.getByRole("link", { name: "Lumen Srl" }).getAttribute("href")).toBe(`/clients/${LUMEN.id}`);
    fireEvent.click(within(screen.getAllByRole("row")[3]).getAllByRole("cell")[0]);
    expect(push).toHaveBeenCalledWith(`/clients/${LUMEN.id}`);
  });

  it("hides Aggiungi cliente below 1024 px and omits it without manage clients; search still works", () => {
    const { unmount } = render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    expect(addButton().className).toContain("hidden lg:inline-flex");
    unmount();
    render(<ClientsTable rows={rows} canManage={false} nameMaxLength={120} />);
    expect(screen.queryByRole("button", { name: "Aggiungi cliente" })).toBeNull();
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("shows the empty state with Aggiungi cliente from 1024 px, and a read-only line below", () => {
    render(<ClientsTable rows={[]} canManage nameMaxLength={120} />);
    expect(screen.getByText("Nessun cliente. Aggiungi il primo.").className).toBe("hidden lg:inline");
    expect(screen.getByText("Nessun cliente.").className).toBe("lg:hidden");
    expect(addButton().className).toContain("hidden lg:inline-flex");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows only the read-only empty line without manage clients", () => {
    render(<ClientsTable rows={[]} canManage={false} nameMaxLength={120} />);
    expect(screen.getByText("Nessun cliente.").tagName).toBe("P");
    expect(screen.queryByText(/Aggiungi il primo/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Aggiungi cliente" })).toBeNull();
  });

  it("focuses search on / outside a text field, and types / inside one", async () => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    within(header("Nome")).getByRole("button").focus();
    await user.keyboard("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    await user.keyboard("/");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("/");
  });
});

describe("Aggiungi cliente dialog", () => {
  it("asks for the name only, adds it, closes, refreshes and returns focus to Aggiungi cliente", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClientsTable rows={[]} canManage nameMaxLength={120} />);
    await user.click(addButton());
    expect(dialog()).not.toBeNull();
    expect(within(dialog() as HTMLElement).getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByLabelText(/codice/i)).toBeNull();
    expect(document.activeElement).toBe(nameField());
    createClient.mockResolvedValue({ ok: true, value: { id: LUMEN.id, name: "Lumen Srl", code: "LUM" } });
    await user.type(nameField(), "Lumen Srl");
    await user.click(submit());
    expect(createClient).toHaveBeenCalledExactlyOnceWith({ name: "Lumen Srl" });
    await waitFor(() => expect(dialog()).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
    // The refreshed list replaces the empty state; focus lands on the toolbar's button.
    rerender(<ClientsTable rows={[LUMEN]} canManage nameMaxLength={120} />);
    expect(document.activeElement).toBe(addButton());
  });

  it.each([["   "], ["x".repeat(121)]])("rejects %j inline without a request, focus in the field", async (value) => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    fireEvent.change(nameField(), { target: { value } });
    await user.click(submit());
    expect(createClient).not.toHaveBeenCalled();
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(nameField().getAttribute("aria-describedby") ?? "")?.textContent).toMatch(
      /Inserisci il nome del cliente\.|Massimo 120 caratteri\./,
    );
    expect(document.activeElement).toBe(nameField());
  });

  it.each([
    ["CLIENT_NAME_TAKEN", 409, "Esiste già un cliente con questo nome."],
    ["CLIENT_CODE_EXHAUSTED", 409, "Non è stato possibile assegnare un codice a questo nome. Usa un nome diverso."],
  ])("keeps the dialog open with the typed name on %s", async (code, status, message) => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    createClient.mockResolvedValue({ ok: false, status, error: { code, message: "m" } });
    await user.type(nameField(), "lumen  srl");
    await user.click(submit());
    expect(dialog()).not.toBeNull();
    expect(nameField().value).toBe("lumen  srl");
    expect(nameField().getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(nameField().getAttribute("aria-describedby") ?? "")?.textContent).toBe(message);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the generic line for any other failure and when the action throws", async () => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    createClient.mockResolvedValueOnce({ ok: false, status: 403, error: { code: "FORBIDDEN", message: "m" } });
    await user.type(nameField(), "Acme");
    await user.click(submit());
    expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile salvare. Riprova.");
    createClient.mockRejectedValueOnce(new Error("network"));
    await user.click(submit());
    expect(screen.getByRole("alert").textContent).toBe("Non è stato possibile salvare. Riprova.");
    expect(nameField().value).toBe("Acme");
  });

  it("sends one request when Aggiungi is pressed twice: busy while pending", async () => {
    let resolve: (value: ActionResult<Client>) => void = () => undefined;
    createClient.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    await user.type(nameField(), "Lumen Arte");
    await user.click(submit());
    expect(submit().getAttribute("aria-busy")).toBe("true");
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    await user.click(submit());
    await user.keyboard("{Enter}");
    expect(createClient).toHaveBeenCalledOnce();
    await act(async () => resolve({ ok: true, value: { id: "cccccccc-0000-4000-8000-000000000009", name: "Lumen Arte", code: "LUMA" } }));
    await waitFor(() => expect(dialog()).toBeNull());
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("ignores Annulla and Esc while the save is in flight", async () => {
    let resolve: (value: ActionResult<Client>) => void = () => undefined;
    createClient.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    await user.type(nameField(), "Lumen Arte");
    await user.click(submit());
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      (dialog() as HTMLDialogElement).dispatchEvent(cancel);
    });
    expect(dialog()).not.toBeNull();
    await act(async () => resolve({ ok: false, status: 409, error: { code: "CLIENT_NAME_TAKEN", message: "m" } }));
    // Once the request ends, Annulla works again.
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(dialog()).toBeNull();
  });

  it("does not take focus back after a cancelled dialog when the rows later change", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    screen.getByRole("searchbox").focus();
    rerender(<ClientsTable rows={[...rows]} canManage nameMaxLength={120} />);
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("forgets the refocus when a refresh brings no new rows", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    createClient.mockResolvedValue({ ok: true, value: { id: "cccccccc-0000-4000-8000-000000000009", name: "Nuovo", code: "NUO" } });
    await user.type(nameField(), "Nuovo");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await user.click(submit());
    await waitFor(() => expect(dialog()).toBeNull());
    act(() => vi.advanceTimersByTime(5000));
    screen.getByRole("searchbox").focus();
    rerender(<ClientsTable rows={[...rows]} canManage nameMaxLength={120} />);
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("closes on Annulla without a request", async () => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage nameMaxLength={120} />);
    await user.click(addButton());
    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(dialog()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(addButton());
  });
});
