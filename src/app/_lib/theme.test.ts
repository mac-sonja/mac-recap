import { describe, expect, it } from "vitest";
import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["system", "system"],
    [undefined, "system"],
    ["sepia", "system"],
  ] as const)("%s reads as %s", (value, choice) => {
    expect(parseTheme(value)).toBe(choice);
  });
});
