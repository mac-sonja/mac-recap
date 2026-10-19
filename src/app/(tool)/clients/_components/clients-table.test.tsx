// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientRow } from "./filter-sort";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { ClientsTable } = await import("./clients-table");
const { SEARCH_DEBOUNCE_MS } = await import("@/app/(tool)/case-studies/_components/case-studies-table");

const LUMEN: ClientRow = { id: "cccccccc-0000-4000-8000-000000000001", code: "LUM", name: "Lumen Srl", caseCount: 2, complete: true };
const ACME: ClientRow = { id: "cccccccc-0000-4000-8000-000000000003", code: "ACM", name: "Acme", caseCount: 0, complete: false };
const rows: ClientRow[] = [
  LUMEN,
  { id: "cccccccc-0000-4000-8000-000000000002", code: "CIT", name: "Città di Torino", caseCount: 10, complete: true },
  ACME,
];

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[1].textContent);
const header = (name: string) => screen.getByRole("columnheader", { name: new RegExp(name) });
const addLink = () => screen.getByRole("link", { name: "Aggiungi cliente" });

beforeEach(() => {
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ClientsTable", () => {
  it("lists by name A–Z with the code in mono and the count", () => {
    render(<ClientsTable rows={rows} canManage />);
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
    expect(header("Nome").getAttribute("aria-sort")).toBe("ascending");
    const cells = within(screen.getAllByRole("row")[3]).getAllByRole("cell");
    expect(cells[0].textContent).toBe("LUM");
    expect(cells[0].className).toContain("font-mono");
    expect(cells[2].textContent).toBe("2");
  });

  it("sorts by a header click and reverses on a second click", () => {
    render(<ClientsTable rows={rows} canManage />);
    fireEvent.click(within(header("Case history")).getByRole("button"));
    expect(names()).toEqual(["Acme", "Lumen Srl", "Città di Torino"]);
    fireEvent.click(within(header("Case history")).getByRole("button"));
    expect(names()).toEqual(["Città di Torino", "Lumen Srl", "Acme"]);
    fireEvent.click(within(header("Codice")).getByRole("button"));
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
  });

  it("searches name and code after the debounce, ignoring case and accents", () => {
    vi.useFakeTimers();
    render(<ClientsTable rows={rows} canManage />);
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
    render(<ClientsTable rows={rows} canManage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.getByRole("status").textContent).toBe("Nessun cliente per 'zzz'.");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancella ricerca" }));
    expect(names()).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });

  it("opens a finished client's page on a row click and links the name", () => {
    render(<ClientsTable rows={rows} canManage />);
    expect(screen.getByRole("link", { name: "Lumen Srl" }).getAttribute("href")).toBe(`/clients/${LUMEN.id}`);
    fireEvent.click(within(screen.getAllByRole("row")[3]).getAllByRole("cell")[0]);
    expect(push).toHaveBeenCalledWith(`/clients/${LUMEN.id}`);
  });

  it("opens an unfinished client's wizard at step 1 from its row and its name", () => {
    render(<ClientsTable rows={rows} canManage />);
    const wizard = `/clients/new?clientId=${ACME.id}&step=1`;
    expect(screen.getByRole("link", { name: "Acme" }).getAttribute("href")).toBe(wizard);
    fireEvent.click(within(screen.getAllByRole("row")[1]).getAllByRole("cell")[2]);
    expect(push).toHaveBeenCalledWith(wizard);
  });

  it("links Aggiungi cliente to the client wizard, hides it below 1024 px and omits it without manage clients; search still works", () => {
    const { unmount } = render(<ClientsTable rows={rows} canManage />);
    expect(addLink().getAttribute("href")).toBe("/clients/new");
    expect(addLink().className).toContain("hidden lg:inline-flex");
    unmount();
    render(<ClientsTable rows={rows} canManage={false} />);
    expect(screen.queryByRole("link", { name: "Aggiungi cliente" })).toBeNull();
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("shows the empty state with Aggiungi cliente from 1024 px, and a read-only line below", () => {
    render(<ClientsTable rows={[]} canManage />);
    expect(screen.getByText("Nessun cliente. Aggiungi il primo.").className).toBe("hidden lg:inline");
    expect(screen.getByText("Nessun cliente.").className).toBe("lg:hidden");
    expect(addLink().className).toContain("hidden lg:inline-flex");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows only the read-only empty line without manage clients", () => {
    render(<ClientsTable rows={[]} canManage={false} />);
    expect(screen.getByText("Nessun cliente.").tagName).toBe("P");
    expect(screen.queryByText(/Aggiungi il primo/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Aggiungi cliente" })).toBeNull();
  });

  it("focuses search on / outside a text field, and types / inside one", async () => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage />);
    within(header("Nome")).getByRole("button").focus();
    await user.keyboard("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    await user.keyboard("/");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("/");
  });
});
