import { describe, expect, it } from "vitest";
import { currentYear, formatBytes, formatDateTime, formatRelative } from "./format";

describe("formatDateTime", () => {
  it.each([
    ["summer time (UTC+2)", "2026-10-13T07:05:00.123456+00:00", "13 ott, 09:05"],
    ["winter time, crossing midnight (UTC+1)", "2026-01-13T23:30:00+00:00", "14 gen, 00:30"],
  ])("shows %s in Europe/Rome", (_label, iso, expected) => {
    expect(formatDateTime(iso, new Date("2026-10-20T10:00:00Z"))).toBe(expected);
  });

  it("adds the year outside the current one", () => {
    expect(formatDateTime("2025-10-02T14:20:00Z", new Date("2026-10-20T10:00:00Z"))).toBe("2 ott 2025, 16:20");
  });
});

describe("currentYear", () => {
  it("uses the Europe/Rome calendar year", () => {
    expect(currentYear(new Date("2026-10-14T10:00:00Z"))).toBe(2026);
    // 23:30 UTC on 31 December is already 1 January in Rome.
    expect(currentYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

describe("formatBytes", () => {
  it.each([
    [820, "820 B"],
    [1023, "1023 B"],
    [1048575, "1 MB"],
    [1048576, "1 MB"],
    [1024 * 1024 - 60, "1023,9 KB"],
    [1024, "1 KB"],
    [512 * 1024, "512 KB"],
    [1536, "1,5 KB"],
    [4.2 * 1024 * 1024, "4,2 MB"],
    [11.64 * 1024 * 1024, "11,6 MB"],
    [100 * 1024 * 1024, "100 MB"],
    [1234.5 * 1024 * 1024, "1234,5 MB"],
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-10-21T12:00:00Z");

  it("says how long ago, in Italian", () => {
    expect(formatRelative("2026-10-21T11:59:30Z", now)).toBe("adesso");
    expect(formatRelative("2026-10-21T11:55:00Z", now)).toBe("5 minuti fa");
    expect(formatRelative("2026-10-21T10:00:00Z", now)).toBe("2 ore fa");
    expect(formatRelative("2026-10-20T08:00:00Z", now)).toBe("ieri");
    expect(formatRelative("2026-10-18T12:00:00Z", now)).toBe("3 giorni fa");
  });

  it("falls back to the date from a week on", () => {
    expect(formatRelative("2026-10-10T07:05:00Z", now)).toBe(formatDateTime("2026-10-10T07:05:00Z", now));
  });
});
