import { describe, expect, it } from "vitest";
import { failure } from "./action-result";

describe("failure", () => {
  it("passes reason unsafe_svg through for CLIENT_LOGO_INVALID only, and no other details", () => {
    expect(failure({ code: "CLIENT_LOGO_INVALID", message: "m", details: { reason: "unsafe_svg", clientId: "c" } })).toMatchObject({
      ok: false,
      error: { code: "CLIENT_LOGO_INVALID", message: "m", reason: "unsafe_svg" },
    });
    const plain = failure({ code: "CLIENT_LOGO_INVALID", message: "m", details: { clientId: "c" } });
    expect(plain.ok || plain.error).toEqual({ code: "CLIENT_LOGO_INVALID", message: "m" });
    const other = failure({ code: "STORAGE_FAILED", message: "m", details: { reason: "unsafe_svg" } });
    expect(other.ok || other.error).toEqual({ code: "STORAGE_FAILED", message: "m" });
  });

  it("keeps the failing fields of a field error", () => {
    const result = failure({ code: "CLIENT_FIELD_INVALID", message: "m", details: { fields: ["description"] } });
    expect(result.ok || result.error).toEqual({ code: "CLIENT_FIELD_INVALID", message: "m", fields: ["description"] });
  });
});
