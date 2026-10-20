import { describe, expect, it } from "vitest";
import { normalizeClientConfirmName } from "./client-name";

describe("normalizeClientConfirmName", () => {
  it("collapses runs of ASCII whitespace to one space and trims them", () => {
    expect(normalizeClientConfirmName("  Lumen \t\n\r\f\v  S.r.l. ")).toBe("Lumen S.r.l.");
  });

  it("keeps a no-break space and other non-ASCII spaces as they are", () => {
    expect(normalizeClientConfirmName(" Lumen S.r.l. ")).toBe(" Lumen S.r.l. ");
  });
});
