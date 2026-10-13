import { describe, expect, it } from "vitest";
import type { Actor, Role } from "@/modules/access";
import { listScopeFor } from "./list-scope";

const actor = (role: Role): Actor => ({ id: "00000000-0000-4000-8000-000000000002", email: "a@example.it", displayName: "A", role });

describe("listScopeFor", () => {
  it.each([
    ["owner_designer", {}],
    ["account_sales_social", { status: "approved" }],
    ["admin", null],
    ["system", null],
  ] as const)("%s → %j", (role, scope) => {
    expect(listScopeFor(actor(role))).toEqual(scope);
  });
});
