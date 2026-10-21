// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientRow } from "./filter-sort";

const { ClientsTable } = await import("./clients-table");
const { SEARCH_DEBOUNCE_MS } = await import("@/app/(tool)/case-studies/_components/case-studies-table");
const { it: dict, fill } = await import("@/shared/i18n/it");

const LUMEN: ClientRow = { id: "cccccccc-0000-4000-8000-000000000001", code: "LUM", name: "Lumen Srl", caseCount: 2, complete: true, logoUrl: null };
const ACME: ClientRow = { id: "cccccccc-0000-4000-8000-000000000003", code: "ACM", name: "Acme", caseCount: 0, complete: false, logoUrl: null };
const rows: ClientRow[] = [
  LUMEN,
  { id: "cccccccc-0000-4000-8000-000000000002", code: "CIT", name: "Città di Torino", caseCount: 10, complete: true, logoUrl: null },
  ACME,
];

const list = () => screen.getByRole("list", { name: dict.clients.table.caption });
const cards = () => within(list()).getAllByRole("listitem");
/** Each card's client name: the first line of its link. */
const names = () => cards().map((card) => within(card).getByText((_, el) => el?.className.includes("font-semibold") ?? false).textContent);
const card = (name: string) => cards().find((c) => within(c).queryByText(name) !== null)!;
const sortSelect = () => screen.getByRole("combobox", { name: dict.clients.sort.label }) as HTMLSelectElement;
const searchbox = () => screen.getByRole("searchbox", { name: dict.clients.search.label }) as HTMLInputElement;
const addLink = () => screen.getByRole("link", { name: dict.clients.add });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ClientsTable", () => {
  it("lists by name A–Z with the code in mono, the case count and the profile state", () => {
    render(<ClientsTable rows={rows} canManage />);
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
    expect(sortSelect().value).toBe("name-asc");
    const lumen = card("Lumen Srl");
    expect(lumen.getAttribute("data-client-id")).toBe(LUMEN.id);
    const code = within(lumen).getByText("LUM");
    expect(code.className).toContain("font-mono");
    expect(within(lumen).getByText(fill(dict.clients.caseCount, { n: 2 }))).toBeTruthy();
    expect(within(lumen).getByText(dict.clients.complete)).toBeTruthy();
    expect(within(card("Acme")).getByText(fill(dict.clients.caseCount, { n: 0 }))).toBeTruthy();
    expect(within(card("Acme")).getByText(dict.clients.incomplete)).toBeTruthy();
    expect(within(card("Città di Torino")).getByText(fill(dict.clients.caseCount, { n: 10 }))).toBeTruthy();
  });

  it("shows the logo, decorative, on the white tile at the monogram's size", () => {
    const url = "https://storage.example/clients/lumen/logo.svg?token=sig";
    render(<ClientsTable rows={[{ ...LUMEN, logoUrl: url }]} canManage />);
    const img = card("Lumen Srl").querySelector("img")!;
    expect(img.getAttribute("src")).toBe(url);
    expect(img.getAttribute("alt")).toBe("");
    const tile = img.parentElement!;
    expect(tile.getAttribute("aria-hidden")).toBe("true");
    expect(tile.className).toContain("size-11");
    expect(tile.className).toContain("bg-logo-tile");
    expect(img.className).toContain("object-contain");
    expect(within(card("Lumen Srl")).queryByText("L")).toBeNull();
    // The link's name stays the client's, not doubled by the mark.
    expect(within(card("Lumen Srl")).getByRole("link").textContent?.startsWith("Lumen Srl")).toBe(true);
  });

  it("shows the monogram when the client has no logo", () => {
    render(<ClientsTable rows={[LUMEN]} canManage />);
    expect(card("Lumen Srl").querySelector("img")).toBeNull();
    const monogram = within(card("Lumen Srl")).getByText("L");
    expect(monogram.getAttribute("aria-hidden")).toBe("true");
    expect(monogram.className).toContain("size-11");
  });

  it("falls back to the monogram when the logo fails to load", () => {
    render(<ClientsTable rows={[{ ...LUMEN, logoUrl: "https://storage.example/expired" }]} canManage />);
    fireEvent.error(card("Lumen Srl").querySelector("img")!);
    expect(card("Lumen Srl").querySelector("img")).toBeNull();
    expect(within(card("Lumen Srl")).getByText("L").getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the singular case count for one case", () => {
    render(<ClientsTable rows={[{ ...LUMEN, caseCount: 1 }]} canManage />);
    expect(within(card("Lumen Srl")).getByText(dict.clients.caseCountOne)).toBeTruthy();
  });

  it("offers the sort options and re-orders the cards", () => {
    render(<ClientsTable rows={rows} canManage />);
    expect([...sortSelect().options].map((o) => [o.value, o.textContent])).toEqual([
      ["name-asc", dict.clients.sort.nameAsc],
      ["name-desc", dict.clients.sort.nameDesc],
      ["cases-desc", dict.clients.sort.mostCases],
      ["code-asc", dict.clients.sort.code],
    ]);
    fireEvent.change(sortSelect(), { target: { value: "name-desc" } });
    expect(names()).toEqual(["Lumen Srl", "Città di Torino", "Acme"]);
    fireEvent.change(sortSelect(), { target: { value: "cases-desc" } });
    expect(names()).toEqual(["Città di Torino", "Lumen Srl", "Acme"]);
    fireEvent.change(sortSelect(), { target: { value: "code-asc" } });
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
    fireEvent.change(sortSelect(), { target: { value: "name-asc" } });
    expect(names()).toEqual(["Acme", "Città di Torino", "Lumen Srl"]);
  });

  it("searches name and code after the debounce, ignoring case and accents", () => {
    vi.useFakeTimers();
    render(<ClientsTable rows={rows} canManage />);
    fireEvent.change(searchbox(), { target: { value: "CITTA" } });
    expect(names()).toHaveLength(3);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(names()).toEqual(["Città di Torino"]);
    fireEvent.change(searchbox(), { target: { value: "lum" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(names()).toEqual(["Lumen Srl"]);
  });

  it("shows no results in a live status region with a clear-search button", () => {
    vi.useFakeTimers();
    render(<ClientsTable rows={rows} canManage />);
    fireEvent.change(searchbox(), { target: { value: "zzz" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.getByRole("status").textContent).toBe(fill(dict.clients.noResults, { query: "zzz" }));
    expect(screen.queryByRole("list", { name: dict.clients.table.caption })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: dict.clients.clearSearch }));
    expect(names()).toHaveLength(3);
    expect(document.activeElement).toBe(searchbox());
  });

  it("makes every card one link to the client's page, finished or not (never the wizard)", () => {
    render(<ClientsTable rows={rows} canManage />);
    for (const row of rows) {
      const links = within(card(row.name)).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe(`/clients/${row.id}`);
    }
    expect(within(card("Acme")).getByRole("link").getAttribute("href")).toBe(`/clients/${ACME.id}`);
  });

  it("links Aggiungi cliente to the client wizard, hides it below 1024 px and omits it without manage clients; search still works", () => {
    const { unmount } = render(<ClientsTable rows={rows} canManage />);
    expect(addLink().getAttribute("href")).toBe("/clients/new");
    expect(addLink().className).toContain("hidden lg:inline-flex");
    unmount();
    render(<ClientsTable rows={rows} canManage={false} />);
    expect(screen.queryByRole("link", { name: dict.clients.add })).toBeNull();
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("shows the empty state with Aggiungi cliente from 1024 px, and a read-only line below", () => {
    render(<ClientsTable rows={[]} canManage />);
    expect(screen.getByText(dict.clients.empty).className).toBe("hidden lg:inline");
    expect(screen.getByText(dict.clients.emptyReadOnly).className).toBe("lg:hidden");
    expect(addLink().className).toContain("hidden lg:inline-flex");
    expect(screen.queryByRole("list", { name: dict.clients.table.caption })).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("shows only the read-only empty line without manage clients", () => {
    render(<ClientsTable rows={[]} canManage={false} />);
    expect(screen.getByText(dict.clients.emptyReadOnly).tagName).toBe("P");
    expect(screen.queryByText(dict.clients.empty)).toBeNull();
    expect(screen.queryByRole("link", { name: dict.clients.add })).toBeNull();
  });

  it("focuses search on / outside a text field, and types / inside one", async () => {
    const user = userEvent.setup();
    render(<ClientsTable rows={rows} canManage />);
    within(card("Acme")).getByRole("link").focus();
    await user.keyboard("/");
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
    expect(searchbox().value).toBe("");
    await user.keyboard("/");
    expect(searchbox().value).toBe("/");
  });
});
