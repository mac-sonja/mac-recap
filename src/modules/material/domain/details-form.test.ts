import { describe, expect, it } from "vitest";
import { MAX_KEY_CHARS, unknownField, unknownRef } from "./details-form";

// 63 ASCII characters then an astral character: by UTF-16 index the cut at 64 would split its surrogate pair.
const straddling = `${"x".repeat(MAX_KEY_CHARS - 1)}😀tail`;
const cut = `${"x".repeat(MAX_KEY_CHARS - 1)}😀`;

describe("details-form error helpers", () => {
  it("unknownField cuts the key by code points, never splitting an astral character", () => {
    const error = unknownField(straddling);
    expect(error.details.field).toBe(cut);
    expect(error.details.field.isWellFormed()).toBe(true);
    expect(error.message).toBe(`Unknown field: ${cut}.`);
  });

  it("unknownRef cuts the id by code points, never splitting an astral character", () => {
    const error = unknownRef({ kind: "form_field", id: straddling });
    expect(error.details).toEqual({ kind: "form_field", id: cut });
    expect(error.details.id.isWellFormed()).toBe(true);
  });

  it("short keys are shown whole", () => {
    expect(unknownField("budget").details.field).toBe("budget");
    expect(unknownRef({ kind: "asset", id: "a" }).message).toBe("Unknown asset ref: a.");
  });
});
