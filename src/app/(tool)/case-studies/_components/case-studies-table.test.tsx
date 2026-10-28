// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, it as dict } from "@/shared/i18n/it";
import type { CaseStudyRow } from "./filter-sort";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/app/(tool)/case-studies/actions", () => ({ deleteCaseStudy: vi.fn() }));

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
    businessLines: ["video"],
    updatedAt: "2026-10-02T10:00:00+00:00",
    updatedLabel: "2 ott, 12:00",
  },
  {
    id: DRAFT_ID,
    code: DRAFT_CODE,
    name: "Alfa",
    clientName: "Acme",
    clientCode: "ACM",
    year: 2026,
    status: "draft",
    businessLines: ["social_media"],
    updatedAt: "2026-10-12T10:00:00+00:00",
    updatedLabel: "12 ott, 12:00",
  },
  {
    id: "cccccccc-0000-4000-8000-000000000003",
    code: "CIT-2024-9",
    name: "Émile",
    clientName: "Beta Lumen",
    clientCode: "BET",
    year: 2025,
    status: "in_review",
    businessLines: [],
    updatedAt: "2026-10-05T10:00:00+00:00",
    updatedLabel: "5 ott, 12:00",
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
const COLUMNS = dict.caseStudies.table.columns;
const SEGMENTS = dict.caseStudies.filter;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A status filter segment by its label; its accessible name also carries the count ("Tutte 3"). */
const segment = (label: string) => screen.getByRole("radio", { name: new RegExp(`^${escape(label)} \\d+$`) });

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
      COLUMNS.id,
      COLUMNS.name,
      COLUMNS.client,
      COLUMNS.year,
      COLUMNS.status,
      COLUMNS.businessLine,
      COLUMNS.links,
      COLUMNS.actions, // screen readers only: the Scarica and Elimina column shows no header
      COLUMNS.updated,
    ]);
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    expect(header(COLUMNS.updated).getAttribute("aria-sort")).toBe("descending");

    const first = within(table).getAllByRole("row")[1];
    const cells = first.querySelectorAll("td");
    // The ID column shows the code, never the uuid (which stays in keys and hrefs).
    expect(cells[0].textContent).toBe(DRAFT_CODE);
    expect(cells[0].className).toContain("font-mono");
    expect(table.textContent).not.toContain(DRAFT_ID);
    expect(first.getAttribute("data-case-id")).toBe(DRAFT_ID);
    expect(cells[2].textContent).toBe("Acme");
    expect(cells[3].textContent).toBe("2026");
    expect(cells[4].textContent).toBe(dict.status.draft);
    expect(cells[5].textContent).toBe(dict.businessLines.social_media);
    expect(cells[6].textContent).toBe(""); // Link: no public link yet
    expect(cells[7].textContent).toBe(""); // Scarica: a draft has nothing to download
    expect(cells[8].querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-12T10:00:00+00:00");
    expect(cells[8].textContent).toBe("12 ott, 12:00");
    // A case created before the business line existed leaves the cell empty.
    expect(within(table).getAllByRole("row")[2].querySelectorAll("td")[5].textContent).toBe("");
  });

  it("puts the status filter and the search in one toolbar, Tutte selected, each segment with its count", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    expect(search().getAttribute("placeholder")).toBe(dict.caseStudies.search.placeholder);
    const group = screen.getByRole("radiogroup", { name: SEGMENTS.label });
    expect(within(group).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      [`${SEGMENTS.all} 3`, "true"],
      [`${SEGMENTS.statuses.draft} 1`, "false"],
      [`${SEGMENTS.statuses.generating} 0`, "false"],
      [`${SEGMENTS.statuses.in_review} 1`, "false"],
      [`${SEGMENTS.statuses.approved} 1`, "false"],
    ]);
    expect(group.className).toContain("rounded-full");
    // Same toolbar row: the search sits in its own wrapper next to the segments.
    expect(group.parentElement).toBe(search().parentElement?.parentElement);
  });

  it("counts the segments under the current search", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    setSearch("zeta");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(segment(SEGMENTS.all).textContent).toBe(`${SEGMENTS.all} 1`);
    expect(segment(SEGMENTS.statuses.approved).textContent).toBe(`${SEGMENTS.statuses.approved} 1`);
    expect(segment(SEGMENTS.statuses.draft).textContent).toBe(`${SEGMENTS.statuses.draft} 0`);
  });

  it("filters by one status at a time; Tutte shows every row again", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    await user.click(segment(SEGMENTS.statuses.in_review));
    expect(names()).toEqual(["Émile"]);
    expect(segment(SEGMENTS.statuses.in_review).getAttribute("aria-checked")).toBe("true");
    expect(segment(SEGMENTS.all).getAttribute("aria-checked")).toBe("false");
    await user.click(segment(SEGMENTS.statuses.approved));
    expect(names()).toEqual(["Zeta"]);
    await user.click(segment(SEGMENTS.all));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
  });

  it("moves and selects with the arrow keys, wrapping; only the selected segment is tabbable", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    const radios = () => screen.getAllByRole("radio");
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    radios()[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(radios()[1]);
    expect(names()).toEqual(["Alfa"]);
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement).toBe(radios()[4]);
    expect(radios()[4].getAttribute("aria-checked")).toBe("true");
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, -1, -1, -1, 0]);
    await user.keyboard("{Home}");
    expect(radios()[0].getAttribute("aria-checked")).toBe("true");
  });

  it("combines the status filter with the search (both must match)", async () => {
    const extra: CaseStudyRow = { ...rows[2], id: "dddddddd-0000-4000-8000-000000000004", name: "Lumière", clientName: "Lumen", status: "draft" };
    render(<CaseStudiesTable rows={[...rows, extra]} canCreate />);
    fireEvent.click(segment(SEGMENTS.statuses.in_review));
    setSearch("lum");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(names()).toEqual(["Émile"]);
  });

  it("searches the business line label", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    setSearch("social");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(names()).toEqual(["Alfa"]);
  });

  it("sorts by Area, cases without one first", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    await user.click(within(header(COLUMNS.businessLine)).getByRole("button"));
    expect(names()).toEqual(["Émile", "Alfa", "Zeta"]);
    expect(header(COLUMNS.businessLine).getAttribute("aria-sort")).toBe("ascending");
  });

  it("names both the search and the status when together they leave no rows", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    fireEvent.click(segment(SEGMENTS.statuses.in_review));
    setSearch("zeta");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      fill(dict.caseStudies.noResultsQueryStatus, { query: "zeta", status: dict.status.in_review }),
    );
  });

  it("names the status when a filter alone leaves no rows; clearing resets search and filter", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    fireEvent.click(segment(SEGMENTS.statuses.generating));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(fill(dict.caseStudies.noResultsStatus, { status: dict.status.generating }));
    fireEvent.click(screen.getByRole("button", { name: dict.caseStudies.clearSearch }));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    expect(segment(SEGMENTS.all).getAttribute("aria-checked")).toBe("true");
  });

  it("sorts by Name A→Z, then Z→A, with aria-sort following", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    await user.click(within(header(COLUMNS.name)).getByRole("button"));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    expect(header(COLUMNS.name).getAttribute("aria-sort")).toBe("ascending");
    expect(header(COLUMNS.updated).hasAttribute("aria-sort")).toBe(false);

    await user.click(within(header(COLUMNS.name)).getByRole("button"));
    expect(names()).toEqual(["Zeta", "Émile", "Alfa"]);
    expect(header(COLUMNS.name).getAttribute("aria-sort")).toBe("descending");
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
    await user.click(within(header(COLUMNS.id)).getByRole("button"));
    expect(names()).toEqual(["Alfa", "Émile", "Zeta"]);
    await user.click(within(header(COLUMNS.id)).getByRole("button"));
    expect(names()).toEqual(["Zeta", "Émile", "Alfa"]);
  });

  it("shows the no-results message with the query; clearing restores every row", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    setSearch("nessuno");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(fill(dict.caseStudies.noResults, { query: "nessuno" }));

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
    const create = screen.queryAllByRole("link", { name: dict.caseStudies.emptyAction });
    expect(create).toHaveLength(links);
    if (links) {
      expect(create[0].getAttribute("href")).toBe("/case-studies/new");
      // Just the label: no plus icon.
      expect(create[0].querySelector("svg")).toBeNull();
    }
  });

  it("takes the empty message, the action label and the new-case link from its props", () => {
    const href = "/case-studies/new?clientId=cccccccc-0000-4000-8000-000000000001";
    render(
      <CaseStudiesTable
        rows={[]}
        canCreate
        emptyMessage={dict.clients.detail.noCases}
        emptyAction={dict.clients.detail.newCase}
        newHref={href}
      />,
    );
    expect(screen.getByText(dict.clients.detail.noCases)).toBeTruthy();
    expect(screen.queryByText(dict.caseStudies.empty)).toBeNull();
    expect(screen.queryByRole("link", { name: dict.caseStudies.emptyAction })).toBeNull();
    expect(screen.getByRole("link", { name: dict.clients.detail.newCase }).getAttribute("href")).toBe(href);
  });

  it("focuses search on / outside a text field", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    within(header(COLUMNS.name)).getByRole("button").focus();
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

  it("shows a link icon that opens the public link in a new tab, only for cases that have one", () => {
    const withLink = rows.map((r) => (r.id === DRAFT_ID ? { ...r, publicUrl: "https://example.it/c/alfa" } : r));
    render(<CaseStudiesTable rows={withLink} canCreate />);
    const links = screen.getAllByRole("link", { name: /in un’altra scheda/ });
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://example.it/c/alfa");
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(links[0]?.getAttribute("aria-label")).toBe(fill(dict.caseStudies.table.openLink, { name: "Alfa" }));
    fireEvent.click(links[0]!);
    expect(push).not.toHaveBeenCalled();
  });

  it("offers Scarica on approved rows only; the picker lists Presentazione (chosen), then Carosello 1080×1080, with Video under In arrivo", async () => {
    const user = userEvent.setup();
    render(<CaseStudiesTable rows={rows} canCreate />);
    const buttons = screen.getAllByRole("button", { name: /^Scarica / });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([fill(dict.download.caseLabel, { name: "Zeta" })]);
    await user.click(buttons[0]!);
    const dialog = screen.getByRole("dialog", { hidden: true });
    const radios = within(dialog).getAllByRole("radio", { hidden: true }) as HTMLInputElement[];
    const enabled = radios.filter((r) => !r.disabled);
    expect(enabled.map((r) => r.closest("label")?.querySelector("span > span")?.textContent)).toEqual([
      dict.download.format.presentazione_16_9.name,
      dict.download.format.carosello_1_1.name,
    ]);
    expect(dict.download.format.carosello_1_1.name).toBe("Carosello 1080×1080");
    expect(enabled.map((r) => r.checked)).toEqual([true, false]);
    const upcoming = radios.filter((r) => r.disabled).map((r) => r.parentElement?.textContent ?? "");
    expect(upcoming.some((text) => text.includes(dict.download.upcoming.video) && text.includes(dict.download.soon))).toBe(true);
    expect(dialog.textContent).not.toContain("Post 1080×1080");
  });

  it("offers no Elimina in the list: a draft is deleted from inside it (owner, 2026-10-22)", () => {
    render(<CaseStudiesTable rows={rows} canCreate />);
    const deleteName = new RegExp(`^${escape(fill(dict.caseStudies.delete.button, { name: "" }))}`);
    expect(screen.queryAllByRole("button", { name: deleteName })).toEqual([]);
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

  describe("the Da approvare queue (Story 4.1)", () => {
    const waiting = (id: string, name: string, over: Partial<CaseStudyRow>): CaseStudyRow => ({
      ...rows[2],
      id,
      name,
      code: `QUE-2026-${id}`,
      ...over,
    });
    // A entered Monday, B Tuesday, C has no event (updated Wednesday); B was touched last.
    const queue: CaseStudyRow[] = [
      waiting("1", "Cobalto", { updatedAt: "2026-10-21T09:00:00+00:00" }),
      waiting("2", "Bianco", { reviewSince: "2026-10-20T09:00:00+00:00", updatedAt: "2026-10-23T09:00:00+00:00" }),
      waiting("3", "Ambra", { reviewSince: "2026-10-19T09:00:00+00:00", updatedAt: "2026-10-22T09:00:00+00:00" }),
      rows[0],
      rows[1],
    ];

    it("sorts Da approvare oldest entry first, with no header arrow; other filters keep Updated newest first", async () => {
      const user = userEvent.setup();
      render(<CaseStudiesTable rows={queue} canCreate />);
      expect(names()).toEqual(["Bianco", "Ambra", "Cobalto", "Alfa", "Zeta"]);
      await user.click(segment(SEGMENTS.statuses.in_review));
      expect(names()).toEqual(["Ambra", "Bianco", "Cobalto"]);
      for (const th of screen.getAllByRole("columnheader")) expect(th.hasAttribute("aria-sort")).toBe(false);
      await user.click(segment(SEGMENTS.statuses.draft));
      expect(header(COLUMNS.updated).getAttribute("aria-sort")).toBe("descending");
    });

    it("keeps a clicked header's sort, also on switching filter", async () => {
      const user = userEvent.setup();
      render(<CaseStudiesTable rows={queue} canCreate initialStatus="in_review" />);
      await user.click(within(header(COLUMNS.name)).getByRole("button"));
      expect(names()).toEqual(["Ambra", "Bianco", "Cobalto"]);
      expect(header(COLUMNS.name).getAttribute("aria-sort")).toBe("ascending");
      await user.click(segment(SEGMENTS.all));
      expect(names()).toEqual(["Alfa", "Ambra", "Bianco", "Cobalto", "Zeta"]);
      await user.click(segment(SEGMENTS.statuses.in_review));
      expect(header(COLUMNS.name).getAttribute("aria-sort")).toBe("ascending");
      expect(names()).toEqual(["Ambra", "Bianco", "Cobalto"]);
    });

    it("starts on the filter it is given", () => {
      render(<CaseStudiesTable rows={queue} canCreate initialStatus="in_review" />);
      expect(segment(SEGMENTS.statuses.in_review).getAttribute("aria-checked")).toBe("true");
      expect(names()).toEqual(["Ambra", "Bianco", "Cobalto"]);
    });

    it("says there is nothing to approve when the queue is empty and nothing is searched", () => {
      render(<CaseStudiesTable rows={[rows[0], rows[1]]} canCreate initialStatus="in_review" />);
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByRole("status").textContent).toBe(dict.caseStudies.noneToReview);
      setSearch("zeta");
      act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
      expect(screen.getByRole("status").textContent).toBe(
        fill(dict.caseStudies.noResultsQueryStatus, { query: "zeta", status: dict.status.in_review }),
      );
    });
  });
});
