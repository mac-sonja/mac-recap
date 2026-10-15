// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { it as dict } from "@/shared/i18n/it";
import type { CaseStudyRow } from "./filter-sort";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { CaseStudiesTable, SEARCH_DEBOUNCE_MS } = await import("./case-studies-table");

const DRAFT_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const DRAFT_CODE = "ACM-2026-01";

const rows: CaseStudyRow[] = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    code: "CIT-2024-10",
    name: "Zeta",
    clientName: "Città di Roma",
    clientCode: "CIT",
    year: 2024,
    status: "approved",
    updatedAt: "2026-10-02T10:00:00+00:00",
    updatedLabel: "02/10/2026, 12:00",
  },
  {
    id: DRAFT_ID,
    code: DRAFT_CODE,
    name: "Alfa",
    clientName: "Acme",
    clientCode: "ACM",
    year: 2026,
    status: "draft",
    updatedAt: "2026-10-12T10:00:00+00:00",
    updatedLabel: "12/10/2026, 12:00",
  },
  {
    id: "cccccccc-0000-4000-8000-000000000003",
    code: "CIT-2024-9",
    name: "Émile",
    clientName: "Beta Lumen",
    clientCode: "BET",
    year: 2025,
    status: "in_review",
    updatedAt: "2026-10-05T10:00:00+00:00",
    updatedLabel: "05/10/2026, 12:00",
  },
];

beforeEach(() => push.mockReset());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const names = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((tr) => tr.querySelectorAll("td")[1]?.textContent);

const header = (label: string) => screen.getByRole("columnheader", { name: label });
const search = () => screen.getByRole("searchbox", { name: dict.caseStudies.search.label });

/** Sets the search text under fake timers; the debounce has not elapsed yet. */
function setSearch(text: string) {
  vi.useFakeTimers();
  fireEvent.change(search(), { target: { value: text } });
}

describe("CaseStudiesTable", () => {
  it("shows every column and the rows newest Updated first", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    const table = screen.getByRole("table", { name: dict.caseStudies.table.caption });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "ID",
      "Nome",
      "Cliente",
      "Anno",
      "Stato",
      "Aggiornato",
      "Link",
    ]);
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    expect(header("Aggiornato").getAttribute("aria-sort")).toBe("descending");

    const first = within(table).getAllByRole("row")[1];
    const cells = first.querySelectorAll("td");
    // The ID column shows the code, never the uuid (which stays in keys and hrefs).
    expect(cells[0].textContent).toBe(DRAFT_CODE);
    expect(cells[0].className).toContain("font-mono");
    expect(table.textContent).not.toContain(DRAFT_ID);
    expect(first.getAttribute("data-case-id")).toBe(DRAFT_ID);
    expect(cells[2].textContent).toBe("Acme");
    expect(cells[3].textContent).toBe("2026");
    expect(cells[4].textContent).toBe("Bozza");
    expect(cells[5].querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-12T10:00:00+00:00");
    expect(cells[5].textContent).toBe("12/10/2026, 12:00");
    expect(cells[6].textContent).toBe("");
  });

  it("sorts by Name A→Z, then Z→A, with aria-sort following", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    await user.click(within(header("Nome")).getByRole("button"));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    expect(header("Nome").getAttribute("aria-sort")).toBe("ascending");
    expect(header("Aggiornato").hasAttribute("aria-sort")).toBe(false);

    await user.click(within(header("Nome")).getByRole("button"));
    expect(names()).toEqual(["Zeta", "Émile", "Alfa"]);
    expect(header("Nome").getAttribute("aria-sort")).toBe("descending");
  });

  it("filters only after the debounce, case- and accent-insensitively", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    setSearch("citta");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(names()).toHaveLength(3);
    act(() => vi.advanceTimersByTime(1));
    expect(names()).toEqual(["Zeta"]);
  });

  it.each([
    ["a case code fragment", "2026-01", ["Alfa"]],
    ["a client code", "bet", ["Émile"]],
    ["a client name", "lumen", ["Émile"]],
    ["a uuid fragment (not searchable)", "cccccccc-0000", []],
  ])("matches %s", (_label, query, expected) => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    setSearch(query);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    if (expected.length === 0) expect(screen.queryByRole("table")).toBeNull();
    else expect(names()).toEqual(expected);
  });

  it("sorts ID by code naturally: CIT-2024-9 before CIT-2024-10", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    await user.click(within(header("ID")).getByRole("button"));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    await user.click(within(header("ID")).getByRole("button"));
    expect(names()).toEqual(["Zeta", "Émile", "Alfa"]);
  });

  it("shows the no-results message with the query; clearing restores every row", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    setSearch("nessuno");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Nessun risultato per 'nessuno'.");

    fireEvent.click(screen.getByRole("button", { name: dict.caseStudies.clearSearch }));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    expect((search() as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(search());
  });

  it.each([
    [true, 1],
    [false, 0],
  ])("with no cases shows the empty message (create action: %s)", (canCreate, links) => {
    render(<CaseStudiesTable rows={[]} canCreate={canCreate} />);
    expect(screen.getByText(dict.caseStudies.empty)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    const create = screen.queryAllByRole("link", { name: dict.shell.nav.newCaseStudy });
    expect(create).toHaveLength(links);
    if (links) expect(create[0].getAttribute("href")).toBe("/case-studies/new");
  });

  it("takes the empty message and the new-case link from its props", () => {
    const href = "/case-studies/new?clientId=cccccccc-0000-4000-8000-000000000001";
    render(<CaseStudiesTable rows={[]} canCreate emptyMessage={dict.clients.detail.noCases} newHref={href} />);
    expect(screen.getByText(dict.clients.detail.noCases)).toBeTruthy();
    expect(screen.queryByText(dict.caseStudies.empty)).toBeNull();
    expect(screen.getByRole("link", { name: dict.shell.nav.newCaseStudy }).getAttribute("href")).toBe(href);
  });

  it("focuses search on / outside a text field", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    within(header("Nome")).getByRole("button").focus();
    await user.keyboard("/");
    expect(document.activeElement).toBe(search());
    expect((search() as HTMLInputElement).value).toBe("");
  });

  it("types / normally while in a text field", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="altro" type="text" />
        <CaseStudiesTable rows={rows} canCreate />
      </>,
    );
    const other = screen.getByRole("textbox", { name: "altro" }) as HTMLInputElement;
    await user.click(other);
    await user.keyboard("a/b");
    expect(other.value).toBe("a/b");
    expect(document.activeElement).toBe(other);

    await user.click(search());
    await user.keyboard("x/y");
    expect((search() as HTMLInputElement).value).toBe("x/y");
  });

  it("keeps focus on a focused select when / is pressed", async () => {
    const user = userEvent.setup();
    render(
      <>
        <select aria-label="scelta">
          <option>uno</option>
        </select>
        <CaseStudiesTable rows={rows} canCreate />
      </>,
    );
    const select = screen.getByRole("combobox", { name: "scelta" });
    select.focus();
    await user.keyboard("/");
    expect(document.activeElement).toBe(select);
  });

  it("does not open a Bozza row on a modifier click or after selecting text", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    const table = screen.getByRole("table");
    const cell = within(table).getByText("Acme");

    fireEvent.click(cell, { ctrlKey: true });
    fireEvent.click(cell, { metaKey: true });
    fireEvent.click(cell, { shiftKey: true });
    expect(push).not.toHaveBeenCalled();

    // Drag-selecting the code to copy it ends in a click on the row.
    const idCell = within(table).getByText(DRAFT_CODE);
    const range = document.createRange();
    range.selectNodeContents(idCell);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString()).toBe(DRAFT_CODE);
    fireEvent.click(idCell);
    expect(push).not.toHaveBeenCalled();

    window.getSelection()?.removeAllRanges();
    fireEvent.click(cell);
    expect(push).toHaveBeenCalledExactlyOnceWith(`/case-studies/new?caseId=${DRAFT_ID}`);
  });

  it("does not also push when the Bozza name link itself is clicked", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    const link = within(screen.getByRole("table")).getByRole("link", { name: "Alfa" });
    // Keep happy-dom from following the link; the row handler still sees the click.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the status region mounted and empty while there are results", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("opens a Bozza row at /case-studies/new?caseId={id}; other rows are not links", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    const table = screen.getByRole("table");
    const links = within(table).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Alfa", `/case-studies/new?caseId=${DRAFT_ID}`],
    ]);

    await user.click(within(table).getByText("Acme"));
    expect(push).toHaveBeenCalledWith(`/case-studies/new?caseId=${DRAFT_ID}`);

    push.mockReset();
    await user.click(within(table).getByText("Zeta"));
    await user.click(within(table).getByText("Beta Lumen"));
    expect(push).not.toHaveBeenCalled();
  });
});
