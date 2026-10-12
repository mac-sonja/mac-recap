import { describe, expect, it } from "vitest";
import { can, httpStatusFor, landingFor, respondToAppError, type Actor, type Role } from "@/modules/access";

describe("respondToAppError", () => {
  it.each([
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["PROFILE_LOOKUP_FAILED", 500],
  ] as const)("maps %s to %i with { error: { code, message } } and no details", async (code, status) => {
    const error = { code, message: "m", details: { secret: "internal" } };
    expect(httpStatusFor(error)).toBe(status);
    const res = respondToAppError(error);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: { code, message: "m" } });
  });
});

const actor = (role: Role): Actor => ({ id: "00000000-0000-4000-8000-000000000009", email: "a@b.it", displayName: "A", role });

describe("can", () => {
  it("follows the policy matrix for the actor's role", () => {
    expect(can(actor("owner_designer"), "create case")).toBe(true);
    expect(can(actor("owner_designer"), "list cases")).toBe(true);
    expect(can(actor("account_sales_social"), "create case")).toBe(false);
    expect(can(actor("account_sales_social"), "list cases")).toBe(false);
    expect(can(actor("account_sales_social"), "list cases", { status: "approved" })).toBe(true);
    expect(can(actor("admin"), "list cases")).toBe(false);
  });
});

describe("landingFor", () => {
  it("is exported from the module index", () => {
    expect(landingFor("owner_designer")).toBe("/case-studies");
  });
});
