import { describe, expect, it } from "vitest";
import { httpStatusFor, respondToAppError } from "@/modules/access";

describe("respondToAppError", () => {
  it.each([
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["INVALID_INPUT", 400],
    ["NOT_FOUND", 404],
    ["PROFILE_LOOKUP_FAILED", 500],
  ] as const)("maps %s to %i with { error: { code, message } } and no details", async (code, status) => {
    const error = { code, message: "m", details: { secret: "internal" } };
    expect(httpStatusFor(error)).toBe(status);
    const res = respondToAppError(error);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code, message: "m" } });
  });
});
