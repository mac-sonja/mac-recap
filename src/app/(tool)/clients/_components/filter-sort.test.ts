import { describe, expect, it } from "vitest";
import { DEFAULT_CLIENT_SORT, filterClientRows, nextClientSort, sortClientRows, type ClientRow } from "./filter-sort";

const row = (code: string, name: string, caseCount = 0): ClientRow => ({ id: `id-${code}`, code, name, caseCount, complete: true, logoUrl: null });
const rows = [row("LUMA", "Lumen Arte", 1), row("CIT", "Città di Torino", 4), row("LUM", "Lumen Srl", 2), row("ACM", "acme", 0)];

describe("clients filter and sort", () => {
  it("defaults to Name A–Z, case- and accent-insensitive", () => {
    expect(sortClientRows(rows, DEFAULT_CLIENT_SORT).map((r) => r.code)).toEqual(["ACM", "CIT", "LUMA", "LUM"]);
  });

  it("sorts codes naturally and counts numerically, and reverses on a second click", () => {
    expect(sortClientRows(rows, { key: "code", direction: "asc" }).map((r) => r.code)).toEqual(["ACM", "CIT", "LUM", "LUMA"]);
    expect(sortClientRows(rows, { key: "caseCount", direction: "desc" }).map((r) => r.caseCount)).toEqual([4, 2, 1, 0]);
    expect(nextClientSort(DEFAULT_CLIENT_SORT, "name")).toEqual({ key: "name", direction: "desc" });
    expect(nextClientSort(DEFAULT_CLIENT_SORT, "code")).toEqual({ key: "code", direction: "asc" });
  });

  it("matches name and code, ignoring case and accents", () => {
    expect(filterClientRows(rows, "citta").map((r) => r.code)).toEqual(["CIT"]);
    expect(filterClientRows(rows, "lum").map((r) => r.code)).toEqual(["LUMA", "LUM"]);
    expect(filterClientRows(rows, "  ").length).toBe(4);
    expect(filterClientRows(rows, "zzz")).toEqual([]);
  });
});
