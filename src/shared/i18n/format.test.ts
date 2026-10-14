import { describe, expect, it } from "vitest";
import { currentYear, formatDateTime } from "./format";

describe("formatDateTime", () => {
  it.each([
    ["summer time (UTC+2)", "2026-10-13T07:05:00.123456+00:00", "13/10/2026, 09:05"],
    ["winter time, crossing midnight (UTC+1)", "2026-01-13T23:30:00+00:00", "14/01/2026, 00:30"],
  ])("shows %s in Europe/Rome", (_label, iso, expected) => {
    expect(formatDateTime(iso)).toBe(expected);
  });
});

describe("currentYear", () => {
  it("uses the Europe/Rome calendar year", () => {
    expect(currentYear(new Date("2026-10-14T10:00:00Z"))).toBe(2026);
    // 23:30 UTC on 31 December is already 1 January in Rome.
    expect(currentYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});
