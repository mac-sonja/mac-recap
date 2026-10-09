import { describe, expect, it } from "vitest";
import { err, ok, type Result } from "./result";

describe("result", () => {
  it("ok wraps a value", () => {
    const r: Result<number> = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it("err wraps an AppError", () => {
    const r: Result<number> = err({ code: "NO_MATERIAL", message: "No material", details: { caseId: "c1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("NO_MATERIAL");
      expect(r.error.details).toEqual({ caseId: "c1" });
    }
  });

  it("rejects non-SCREAMING_SNAKE codes at compile time", () => {
    // @ts-expect-error error codes must be upper case
    const r = err({ code: "no_material", message: "x" });
    expect(r.ok).toBe(false);
  });
});
