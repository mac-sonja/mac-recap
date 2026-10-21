import { describe, expect, it } from "vitest";
import {
  businessLineLabel,
  DEFAULT_SORT,
  filterRows,
  nextSort,
  normalizeForSearch,
  sortRows,
  type CaseStudyRow,
} from "./filter-sort";

const row = (over: Partial<CaseStudyRow> & Pick<CaseStudyRow, "id">): CaseStudyRow => ({
  code: "ACM-2026-01",
  name: "Rebrand",
  clientName: "Acme",
  clientCode: "ACM",
  year: 2026,
  status: "draft",
  businessLines: [],
  updatedAt: "2026-10-01T10:00:00+00:00",
  updatedLabel: "01/10/2026, 12:00",
  ...over,
});

const rows: CaseStudyRow[] = [
  row({ id: "aaaaaaaa-0000-4000-8000-000000000001", code: "CIT-2024-10", name: "Zeta", clientName: "Città di Roma", clientCode: "CIT", year: 2024, status: "approved", businessLines: ["video"], updatedAt: "2026-10-02T10:00:00+00:00" }),
  row({ id: "bbbbbbbb-0000-4000-8000-000000000002", code: "ACM-2026-01", name: "alfa", clientName: "Acme", clientCode: "ACM", year: 2026, status: "draft", businessLines: ["social_media"], updatedAt: "2026-10-12T10:00:00.123456+00:00" }),
  row({ id: "cccccccc-0000-4000-8000-000000000003", code: "CIT-2024-9", name: "Émile", clientName: "Beta", clientCode: "BET", year: 2025, status: "in_review", updatedAt: "2026-10-05T10:00:00+00:00" }),
];
const ids = (list: CaseStudyRow[]) => list.map((r) => r.id.slice(0, 1));

describe("businessLineLabel (Servizi, multi-select)", () => {
  it("joins the labels in display order, and is empty without any", () => {
    expect(businessLineLabel({ businessLines: ["branding", "eventi"] })).toBe("Branding, Eventi");
    expect(businessLineLabel({ businessLines: [] })).toBe("");
  });

  it("lets the search find a case by any of its Servizi", () => {
    const both = row({ id: "dddddddd-0000-4000-8000-000000000004", businessLines: ["branding", "eventi"] });
    expect(filterRows([both], "eventi")).toEqual([both]);
  });
});

describe("normalizeForSearch", () => {
  it("strips diacritics and lower-cases", () => {
    expect(normalizeForSearch("Città ÉMILE Ñandú")).toBe("citta emile nandu");
  });
});

describe("filterRows", () => {
  it.each([
    ["an unaccented query against an accented client", "citta", ["a"]],
    ["an accented query against an unaccented name", "ÈMILE", ["c"]],
    ["a case difference", "ALFA", ["b"]],
    ["a case code fragment", "2026-01", ["b"]],
    ["a case code, case-insensitively", "cit-2024-9", ["c"]],
    ["a client code", "bet", ["c"]],
    ["a fragment of a client name", "cme", ["b"]],
    ["not the uuid", "bbbbbbbb-0000", []],
    ["no match", "nessuno", []],
    ["a business line label", "social", ["b"]],
    ["a business line label, case-insensitively", "VIDEO", ["a"]],
    ["not a business line key", "social_media", []],
  ])("matches %s", (_label, query, expected) => {
    expect(ids(filterRows(rows, query))).toEqual(expected);
  });

  it.each([
    ["all", "", ["a", "b", "c"]],
    ["draft", "", ["b"]],
    ["in_review", "", ["c"]],
    ["generating", "", []],
    ["in_review", "emile", ["c"]],
    ["in_review", "zeta", []],
    ["approved", "cit", ["a"]],
  ] as const)("filters status %s with query %j (both must match)", (status, query, expected) => {
    expect(ids(filterRows(rows, query, status))).toEqual(expected);
  });

  it.each(["", "   "])("keeps every row for a blank query %j", (query) => {
    expect(filterRows(rows, query)).toEqual(rows);
  });

  it("ignores surrounding spaces", () => {
    expect(ids(filterRows(rows, "  zeta "))).toEqual(["a"]);
  });
});

describe("sort", () => {
  it("defaults to Updated, newest first", () => {
    expect(DEFAULT_SORT).toEqual({ key: "updated", direction: "desc" });
    expect(ids(sortRows(rows, DEFAULT_SORT))).toEqual(["b", "c", "a"]);
  });

  it("a new header sorts ascending; the same header again reverses", () => {
    const byName = nextSort(DEFAULT_SORT, "name");
    expect(byName).toEqual({ key: "name", direction: "asc" });
    expect(nextSort(byName, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextSort(nextSort(byName, "name"), "name")).toEqual(byName);
    expect(nextSort(DEFAULT_SORT, "updated")).toEqual({ key: "updated", direction: "asc" });
  });

  it.each([
    ["name A→Z, ignoring case and accents", { key: "name", direction: "asc" }, ["b", "c", "a"]],
    ["name Z→A", { key: "name", direction: "desc" }, ["a", "c", "b"]],
    ["client", { key: "client", direction: "asc" }, ["b", "c", "a"]],
    ["year", { key: "year", direction: "asc" }, ["a", "c", "b"]],
    ["business line, none first", { key: "businessLine", direction: "asc" }, ["c", "b", "a"]],
    ["business line Z→A", { key: "businessLine", direction: "desc" }, ["a", "b", "c"]],

    ["ID (code, naturally)", { key: "id", direction: "asc" }, ["b", "c", "a"]],
    ["ID Z→A", { key: "id", direction: "desc" }, ["a", "c", "b"]],
    ["updated, oldest first", { key: "updated", direction: "asc" }, ["a", "c", "b"]],
  ] as const)("sorts by %s", (_label, sort, expected) => {
    expect(ids(sortRows(rows, sort))).toEqual(expected);
  });

  it("sorts status in full lifecycle order", () => {
    const withGenerating = [...rows, row({ id: "dddddddd-0000-4000-8000-000000000004", status: "generating" })];
    expect(ids(sortRows(withGenerating, { key: "status", direction: "asc" }))).toEqual(["b", "d", "c", "a"]);
    expect(ids(sortRows(withGenerating, { key: "status", direction: "desc" }))).toEqual(["a", "c", "d", "b"]);
  });

  it("compares codes naturally: LUM-2026-9 before LUM-2026-10 before LUM-2026-100", () => {
    const coded = ["LUM-2026-100", "LUM-2026-10", "LUM-2026-9", "LUM-2025-11"].map((code, i) => row({ id: String(i), code }));
    expect(sortRows(coded, { key: "id", direction: "asc" }).map((r) => r.code)).toEqual([
      "LUM-2025-11",
      "LUM-2026-9",
      "LUM-2026-10",
      "LUM-2026-100",
    ]);
  });

  it("sorts Client by the client's current name, not its code", () => {
    const named = [row({ id: "1", clientName: "Zeta", clientCode: "AAA" }), row({ id: "2", clientName: "Alfa", clientCode: "ZZZ" })];
    expect(sortRows(named, { key: "client", direction: "asc" }).map((r) => r.id)).toEqual(["2", "1"]);
  });

  it("keeps the incoming order for ties and does not mutate its input", () => {
    const same = [row({ id: "1" }), row({ id: "2" }), row({ id: "3" })];
    const copy = [...same];
    expect(sortRows(same, { key: "name", direction: "desc" }).map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(same).toEqual(copy);
  });
});
