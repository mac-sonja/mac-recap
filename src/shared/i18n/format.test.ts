import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

describe("formatDateTime", () => {
  it.each([
    ["summer time (UTC+2)", "2026-10-13T07:05:00.123456+00:00", "13/10/2026, 09:05"],
    ["winter time, crossing midnight (UTC+1)", "2026-01-13T23:30:00+00:00", "14/01/2026, 00:30"],
  ])("shows %s in Europe/Rome", (_label, iso, expected) => {
    expect(formatDateTime(iso)).toBe(expected);
  });
});
