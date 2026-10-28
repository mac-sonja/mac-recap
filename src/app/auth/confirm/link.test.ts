import { describe, expect, it } from "vitest";
import { linkFrom } from "./link";

describe("linkFrom", () => {
  it.each(["signup", "email", "invite", "recovery"])("reads a %s token_hash link", (type) => {
    expect(linkFrom(new URLSearchParams({ token_hash: "abc", type }))).toEqual({ tokenHash: "abc", type });
  });

  it("reads a PKCE code", () => {
    expect(linkFrom(new URLSearchParams({ code: "xyz" }))).toEqual({ code: "xyz" });
  });

  it("refuses unknown types and empty links", () => {
    expect(linkFrom(new URLSearchParams({ token_hash: "abc", type: "magiclink" }))).toBeNull();
    expect(linkFrom(new URLSearchParams())).toBeNull();
  });
});
