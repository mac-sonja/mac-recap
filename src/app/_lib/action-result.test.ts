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

  it("passes the refused asset ids of ASSET_NOT_ALLOWED only, without the other details", () => {
    const refused = failure({ code: "ASSET_NOT_ALLOWED", message: "m", details: { revisionId: "r", assetIds: ["a", 2, "b"] } });
    expect(refused).toEqual({ ok: false, status: expect.any(Number), error: { code: "ASSET_NOT_ALLOWED", message: "m", assetIds: ["a", "b"] } });
    expect(failure({ code: "DOCUMENT_INVALID", message: "m", details: { assetIds: ["a"] } })).not.toHaveProperty("error.assetIds");
  });
});
