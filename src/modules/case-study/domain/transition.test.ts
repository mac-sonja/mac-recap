import { describe, expect, it } from "vitest";
import { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";
import { nextStatus, TRANSITION_EVENTS, TRANSITIONS } from "./transition";

const ALLOWED: [CaseStatus, string, CaseStatus][] = [
  ["draft", "generate", "generating"],
  ["generating", "generation_succeeded", "in_review"],
  ["generating", "generation_failed", "draft"],
  ["in_review", "approve", "approved"],
];

describe("nextStatus (AD-3)", () => {
  it.each(ALLOWED)("%s --%s--> %s", (from, event, to) => {
    expect(nextStatus(from, event)).toEqual({ ok: true, value: to });
  });

  const invalid = CASE_STATUSES.flatMap((from) =>
    TRANSITION_EVENTS.filter((event) => !ALLOWED.some(([f, e]) => f === from && e === event)).map(
      (event) => [from, event] as const,
    ),
  );

  it.each(invalid)("rejects %s on %s as INVALID_TRANSITION", (from, event) => {
    const result = nextStatus(from, event);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("approved has no outgoing transition", () => {
    for (const event of TRANSITION_EVENTS) expect(nextStatus("approved", event).ok).toBe(false);
  });

  it.each(["fork", "discard", "", undefined, 42, "GENERATE", "toString"])("rejects the unknown event %o", (event) => {
    const result = nextStatus("draft", event);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns INVALID_TRANSITION (does not throw) for a null-prototype object event", () => {
    const result = nextStatus("draft", Object.create(null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: "INVALID_TRANSITION", details: { event: "object" } });
  });

  it("has exactly the four AD-3 edges", () => {
    expect(Object.entries(TRANSITIONS).map(([event, { from, to }]) => [from, event, to])).toEqual(ALLOWED);
  });
});
