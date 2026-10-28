import { describe, expect, it } from "vitest";
import type { Profile } from "./actor";
import { ASSIGNABLE_ROLES, wouldRemoveLastAdmin } from "./users";

const admin: Profile = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "a@menatcode.it",
  displayName: "A",
  role: "admin",
  disabledAt: null,
  jobTitle: null,
  designerRequestedAt: null,
};

describe("ASSIGNABLE_ROLES", () => {
  it("never includes system", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("system");
  });
});

describe("wouldRemoveLastAdmin", () => {
  it.each([
    ["demoting the only admin", admin, "owner_designer", 1, true],
    ["removing the only admin", admin, null, 1, true],
    ["keeping the role", admin, "admin", 1, false],
    ["with another admin left", admin, null, 2, false],
    ["a non-admin", { ...admin, role: "owner_designer" }, null, 1, false],
  ] as const)("%s → %s", (_, target, next, count, expected) => {
    expect(wouldRemoveLastAdmin(target, next, count)).toBe(expected);
  });
});
