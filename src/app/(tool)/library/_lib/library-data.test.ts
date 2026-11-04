import { describe, expect, it } from "vitest";
import {
  EMPTY_STATE,
  PAGE_SIZE,
  facetOptions,
  filterCases,
  libraryHref,
  pagerItems,
  paginate,
  parseLibraryState,
  sortByApproval,
  withKnownFacets,
  type LibraryCase,
} from "./library-data";

const libraryCase = (over: Partial<LibraryCase> = {}): LibraryCase => ({
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  code: "LUM-2026-01",
  name: "Rebrand",
  clientName: "Lumen Srl",
  clientCode: "LUM",
  year: 2026,
  businessLines: ["branding"],
  approvedAt: "2026-10-10T10:00:00+00:00",
  updatedAt: "2026-10-10T10:00:00+00:00",
  ...over,
});

const LUMEN_2025 = libraryCase({ id: "1", name: "Sito Lumen", year: 2025 });
const LUMEN_2026 = libraryCase({ id: "2", name: "Rebrand", year: 2026 });
const ACME_2025 = libraryCase({ id: "3", name: "Campagna", clientName: "Acme Spa", clientCode: "ACM", code: "ACM-2025-01", year: 2025 });
const BETA_2025 = libraryCase({ id: "4", name: "Video", clientName: "Beta Srl", clientCode: "BET", code: "BET-2025-01", year: 2025 });
const ALL = [LUMEN_2025, LUMEN_2026, ACME_2025, BETA_2025];

describe("parseLibraryState / libraryHref", () => {
  it("reads ?q=, repeated ?cliente= and ?anno=, and ?pagina=", () => {
    expect(parseLibraryState({ q: "lum", cliente: ["LUM", "ACM"], anno: "2025", pagina: "2" })).toEqual({
      q: "lum",
      clients: ["LUM", "ACM"],
      years: [2025],
      page: 2,
    });
  });

  it("starts empty on page 1 without params", () => {
    expect(parseLibraryState(undefined)).toEqual(EMPTY_STATE);
    expect(parseLibraryState({})).toEqual(EMPTY_STATE);
  });

  it("drops blank, repeated and malformed values", () => {
    expect(parseLibraryState({ cliente: ["", "LUM", "LUM"], anno: ["25", "abcd", "2025", "2025"], pagina: "0" })).toEqual({
      q: "",
      clients: ["LUM"],
      years: [2025],
      page: 1,
    });
    expect(parseLibraryState({ pagina: "-3" }).page).toBe(1);
    expect(parseLibraryState({ pagina: "2.5" }).page).toBe(1);
    expect(parseLibraryState({ q: ["primo", "secondo"] }).q).toBe("primo");
    expect(parseLibraryState({ q: "x".repeat(300) }).q).toHaveLength(200);
  });

  it("writes the state back in a stable order, leaving out empty values and page 1", () => {
    expect(libraryHref(EMPTY_STATE)).toBe("/library");
    expect(libraryHref({ q: "città d", clients: ["LUM", "ACM"], years: [2025], page: 3 })).toBe(
      "/library?q=citt%C3%A0+d&cliente=LUM&cliente=ACM&anno=2025&pagina=3",
    );
    expect(libraryHref({ ...EMPTY_STATE, q: "  ", page: 1 })).toBe("/library");
  });

  it("round-trips", () => {
    const state = { q: "lum", clients: ["LUM", "ACM"], years: [2026, 2025], page: 2 };
    const params = Object.fromEntries(
      [...new URL(libraryHref(state), "http://x").searchParams.keys()].map((key) => [
        key,
        new URL(libraryHref(state), "http://x").searchParams.getAll(key),
      ]),
    );
    expect(parseLibraryState(params)).toEqual(state);
  });
});

describe("filterCases", () => {
  it("matches what the table matches: name, client name, client code and case code, ignoring case and accents", () => {
    expect(filterCases(ALL, { ...EMPTY_STATE, q: "lum" }).map((c) => c.id)).toEqual(["1", "2"]);
    expect(filterCases(ALL, { ...EMPTY_STATE, q: "ACME" }).map((c) => c.id)).toEqual(["3"]);
    expect(filterCases(ALL, { ...EMPTY_STATE, q: "bet" }).map((c) => c.id)).toEqual(["4"]);
    expect(filterCases(ALL, { ...EMPTY_STATE, q: "acm-2025" }).map((c) => c.id)).toEqual(["3"]);
    expect(filterCases(ALL, { ...EMPTY_STATE, q: "campagnà" }).map((c) => c.id)).toEqual(["3"]);
    expect(filterCases(ALL, { ...EMPTY_STATE, q: "   " })).toHaveLength(4);
  });

  it("combines values in one facet with OR, facets and search with AND", () => {
    const state = { q: "", clients: ["LUM", "ACM"], years: [2025] };
    expect(filterCases(ALL, state).map((c) => c.id)).toEqual(["1", "3"]);
    expect(filterCases(ALL, { ...state, q: "sito" }).map((c) => c.id)).toEqual(["1"]);
    expect(filterCases(ALL, { ...state, years: [2025, 2026] }).map((c) => c.id)).toEqual(["1", "2", "3"]);
  });

  it("returns nothing when the filters match nothing", () => {
    expect(filterCases(ALL, { q: "zzz", clients: [], years: [] })).toEqual([]);
    expect(filterCases(ALL, { q: "", clients: ["BET"], years: [2026] })).toEqual([]);
  });
});

describe("facetOptions / withKnownFacets", () => {
  it("lists each client once by name, and each year newest first", () => {
    expect(facetOptions(ALL)).toEqual({
      clients: [
        { code: "ACM", name: "Acme Spa" },
        { code: "BET", name: "Beta Srl" },
        { code: "LUM", name: "Lumen Srl" },
      ],
      years: [2026, 2025],
    });
    expect(facetOptions([])).toEqual({ clients: [], years: [] });
  });

  it("drops facet values no approved case has", () => {
    const state = { ...EMPTY_STATE, clients: ["LUM", "ZZZ"], years: [2025, 1999] };
    expect(withKnownFacets(state, facetOptions(ALL))).toEqual({ ...state, clients: ["LUM"], years: [2025] });
  });
});

describe("sortByApproval", () => {
  it("puts the newest approval first, even when another case was updated later", () => {
    const first = libraryCase({ id: "first", approvedAt: "2026-10-01T10:00:00+00:00", updatedAt: "2026-10-30T10:00:00+00:00" });
    const second = libraryCase({ id: "second", approvedAt: "2026-10-05T10:00:00+00:00", updatedAt: "2026-10-05T10:00:00+00:00" });
    expect(sortByApproval([first, second]).map((c) => c.id)).toEqual(["second", "first"]);
  });

  it("puts cases without an approval time last, however recently updated, and keeps ties in order", () => {
    const noEvent = libraryCase({ id: "none", approvedAt: null, updatedAt: "2026-10-30T10:00:00+00:00" });
    const alsoNone = libraryCase({ id: "none-2", approvedAt: null, updatedAt: "2026-10-01T10:00:00+00:00" });
    const a = libraryCase({ id: "a", approvedAt: "2026-10-05T10:00:00+00:00" });
    const b = libraryCase({ id: "b", approvedAt: "2026-10-05T10:00:00+00:00" });
    expect(sortByApproval([noEvent, a, alsoNone, b]).map((c) => c.id)).toEqual(["a", "b", "none", "none-2"]);
  });
});

describe("paginate", () => {
  const thirty = Array.from({ length: 30 }, (_, i) => i);

  it("shows 24 on page 1 and 6 on page 2", () => {
    expect(PAGE_SIZE).toBe(24);
    expect(paginate(thirty, 1)).toMatchObject({ page: 1, pageCount: 2, total: 30 });
    expect(paginate(thirty, 1).items).toHaveLength(24);
    expect(paginate(thirty, 2).items).toEqual([24, 25, 26, 27, 28, 29]);
  });

  it("clamps a page past the last to the last, and below 1 to the first", () => {
    expect(paginate(thirty, 9)).toMatchObject({ page: 2, items: [24, 25, 26, 27, 28, 29] });
    expect(paginate(thirty, 0).page).toBe(1);
  });

  it("has one empty page for an empty list", () => {
    expect(paginate([], 3)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
  });
});

describe("pagerItems", () => {
  it("shows every number up to 7 pages", () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first, the last and the current page's neighbours, with gaps", () => {
    expect(pagerItems(1, 10)).toEqual([1, 2, null, 10]);
    expect(pagerItems(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    // A gap of one page shows that page instead of …
    expect(pagerItems(3, 10)).toEqual([1, 2, 3, 4, null, 10]);
    expect(pagerItems(10, 10)).toEqual([1, null, 9, 10]);
  });
});
