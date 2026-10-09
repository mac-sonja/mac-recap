import { describe, expect, it, vi } from "vitest";
import { DEV_ACTOR_ID, SYSTEM_ACTOR_ID, type Actor, type Role } from "@/modules/access/domain/actor";
import type { Action, Resource } from "@/modules/access/domain/policy";
import { authorize } from "./authorize";

const actor = (role: Role): Actor => ({
  id: role === "system" ? SYSTEM_ACTOR_ID : DEV_ACTOR_ID,
  email: `${role}@mac-recap.invalid`,
  displayName: role,
  role,
});

/** The handler shape every server action follows: authorize, then the use case. */
function handle(a: Actor, action: Action, resource: Resource, runUseCase: () => void) {
  const decision = authorize(a, action, resource);
  if (!decision.ok) return decision;
  runUseCase();
  return decision;
}

describe("authorize", () => {
  it("allows owner/designer to delete a draft case", () => {
    expect(authorize(actor("owner_designer"), "delete case", { status: "draft" })).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it.each<[Role, Action, Resource]>([
    ["owner_designer", "delete case", { status: "approved" }],
    ["account_sales_social", "view", { status: "in_review" }],
    ["account_sales_social", "export", { status: "draft" }],
    ["account_sales_social", "create link", { status: "generating" }],
    ["admin", "change permissions or guardrails", {}],
    ["system", "change permissions or guardrails", {}],
    ["system", "edit", { status: "draft" }],
  ])("%s · %s %o → FORBIDDEN and the use case never runs", (role, action, resource) => {
    const runUseCase = vi.fn();
    const result = handle(actor(role), action, resource, runUseCase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
      expect(result.error.details).toEqual({ action, role });
    }
    expect(runUseCase).not.toHaveBeenCalled();
  });

  it("allows admin to manage users", () => {
    expect(authorize(actor("admin"), "manage users").ok).toBe(true);
  });

  it("allows system only job work", () => {
    expect(authorize(actor("system"), "job work").ok).toBe(true);
  });

  it("runs the use case once when allowed", () => {
    const runUseCase = vi.fn();
    handle(actor("owner_designer"), "create case", {}, runUseCase);
    expect(runUseCase).toHaveBeenCalledTimes(1);
  });
});
