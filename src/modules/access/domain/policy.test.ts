import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "./actor";
import { ACTIONS, CASE_STATUSES, can, type Action, type CaseStatus } from "./policy";

// The AD-11 matrix restated independently of policy.ts. Each cell is either
// "all" (every status, and no status), "approved", "draft" or absent (denied).
type Cell = "all" | "approved" | "draft";
const EXPECTED: Record<Action, Partial<Record<Role, Cell>>> = {
  "list cases": { owner_designer: "all", account_sales_social: "approved" },
  "create case": { owner_designer: "all" },
  upload: { owner_designer: "all" },
  "fill details": { owner_designer: "all" },
  generate: { owner_designer: "all" },
  edit: { owner_designer: "all" },
  "delete case": { owner_designer: "draft" },
  approve: { owner_designer: "all" },
  "update approved version": { owner_designer: "all" },
  discard: { owner_designer: "all" },
  view: { owner_designer: "approved", account_sales_social: "approved" },
  export: { owner_designer: "approved", account_sales_social: "approved" },
  "job work": { system: "all" },
  "create link": { owner_designer: "approved", account_sales_social: "approved" },
  "turn off link": { owner_designer: "all", account_sales_social: "all" },
  "manage templates": { owner_designer: "all" },
  "manage users": { admin: "all" },
  "change permissions or guardrails": {},
};

const STATUSES: (CaseStatus | undefined)[] = [undefined, ...CASE_STATUSES];

function expected(cell: Cell | undefined, status: CaseStatus | undefined): boolean {
  if (cell === undefined) return false;
  if (cell === "all") return true;
  return status === cell;
}

describe("AD-11 permission matrix", () => {
  it("covers every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  const cells = ACTIONS.flatMap((action) =>
    ROLES.flatMap((role) =>
      STATUSES.map((status) => ({ action, role, status, allowed: expected(EXPECTED[action][role], status) })),
    ),
  );

  it.each(cells)("$role · $action · status=$status → $allowed", ({ action, role, status, allowed }) => {
    expect(can(role, action, status === undefined ? {} : { status })).toBe(allowed);
  });

  it.each(ROLES)("denies 'change permissions or guardrails' to %s for every status", (role) => {
    for (const status of STATUSES) {
      expect(can(role, "change permissions or guardrails", { status })).toBe(false);
    }
  });

  it("lets the system actor do only job work", () => {
    const allowed = ACTIONS.filter((a) => STATUSES.some((status) => can("system", a, { status })));
    expect(allowed).toEqual(["job work"]);
  });

  it("does not let account/sales/social act on unapproved cases", () => {
    for (const status of CASE_STATUSES.filter((s) => s !== "approved")) {
      for (const action of ["view", "export", "create link", "list cases"] as const) {
        expect(can("account_sales_social", action, { status })).toBe(false);
      }
    }
  });

  it("denies unknown roles and actions", () => {
    expect(can("guest" as Role, "view", { status: "approved" })).toBe(false);
    expect(can("owner_designer", "toString" as Action)).toBe(false);
    expect(can("owner_designer", "__proto__" as Action)).toBe(false);
    expect(can("hasOwnProperty" as Role, "create case")).toBe(false);
  });
});
