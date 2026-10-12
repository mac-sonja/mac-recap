import { describe, expect, it } from "vitest";
import type { Role } from "./actor";
import { landingFor } from "./landing";

describe("landingFor", () => {
  it.each([
    ["owner_designer", "/case-studies"],
    ["account_sales_social", "/library"],
    ["admin", "/users"],
    ["system", null],
  ] as const)("%s lands on %s", (role, path) => {
    expect(landingFor(role)).toBe(path);
  });

  it("returns null for an unknown role", () => {
    expect(landingFor("nobody" as Role)).toBeNull();
  });
});
