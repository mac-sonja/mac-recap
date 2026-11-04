import { describe, expect, it } from "vitest";
import { DRAFT_READY_MAX_TOASTS, stackToasts, startDraftReadySession, takeNewDrafts, type ReadyDraftNotice } from "./draft-ready";

const draft = (n: number, second = n): ReadyDraftNotice => ({
  id: `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`,
  name: `Case ${n}`,
  readyAt: `2026-11-04T10:00:${String(second).padStart(2, "0")}.000000+00:00`,
});

describe("startDraftReadySession", () => {
  it("starts from the given moment with nothing seen", () => {
    const session = startDraftReadySession("2026-11-04T10:00:00.000Z");
    expect(session.since).toBe("2026-11-04T10:00:00.000Z");
    expect(session.seen.size).toBe(0);
    expect(session.errorLogged).toBe(false);
  });
});

describe("takeNewDrafts", () => {
  it("returns each draft once per session, never again on a later poll", () => {
    const session = startDraftReadySession("2026-11-04T10:00:00.000Z");
    expect(takeNewDrafts(session, [draft(1)])).toEqual([draft(1)]);
    expect(takeNewDrafts(session, [draft(1)])).toEqual([]);
    expect(takeNewDrafts(session, [draft(1), draft(2)])).toEqual([draft(2)]);
  });

  it("drops a draft listed twice in one poll and orders them oldest first", () => {
    const session = startDraftReadySession("2026-11-04T10:00:00.000Z");
    expect(takeNewDrafts(session, [draft(2, 9), draft(1, 3), draft(2, 9)])).toEqual([draft(1, 3), draft(2, 9)]);
  });

  it("keeps sessions apart: a new page load is a new session", () => {
    const first = startDraftReadySession("2026-11-04T10:00:00.000Z");
    takeNewDrafts(first, [draft(1)]);
    expect(takeNewDrafts(startDraftReadySession("2026-11-04T10:05:00.000Z"), [draft(1)])).toEqual([draft(1)]);
  });
});

describe("stackToasts", () => {
  it("adds the newest at the bottom", () => {
    expect(stackToasts([draft(1)], [draft(2)]).map((t) => t.name)).toEqual(["Case 1", "Case 2"]);
  });

  it("shows at most 3, the oldest leaving first", () => {
    expect(DRAFT_READY_MAX_TOASTS).toBe(3);
    const stacked = stackToasts([draft(1), draft(2), draft(3)], [draft(4), draft(5)]);
    expect(stacked.map((t) => t.name)).toEqual(["Case 3", "Case 4", "Case 5"]);
  });

  it("never shows one id twice", () => {
    expect(stackToasts([draft(1), draft(2)], [draft(1)]).map((t) => t.name)).toEqual(["Case 2", "Case 1"]);
  });
});
