import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, Role } from "@/modules/access";
import { ok } from "@/shared/result";

// Story 6.4: every server action, for every role, through the real actor resolver
// (`getActor`: session → profile by email → role) and the real policy
// (`authorize`). Only the Supabase adapters and the use cases behind the policy
// are stubbed, so a wrong `authorize` action, a missing check or a resolver bug
// shows up here as a wrong status. The expected roles are restated from the AD-11
// matrix (owner, 2026-10-28: the admin has every owner permission plus `manage users`).

/** The request's session email, and the one profile the database holds. */
const { session } = vi.hoisted(() => ({
  session: {
    email: null as string | null,
    profileEmail: "persona@menatcode.it",
    role: "owner_designer" as string,
    disabledAt: null as string | null,
  },
}));

const profileFor = (email: string, role: string): Profile =>
  ({
    id: "00000000-0000-4000-8000-0000000000e1",
    email,
    displayName: "Test",
    role,
    disabledAt: session.disabledAt,
    jobTitle: null,
    designerRequestedAt: null,
  }) as Profile;

vi.mock("@/modules/access/adapters/supabase/auth-gateway", () => ({
  createSupabaseAuthGateway: () => ({
    currentUser: async () => (session.email === null ? null : { email: session.email, metadata: {} }),
  }),
}));

vi.mock("@/modules/access/adapters/supabase/profile-repository", () => ({
  createSupabaseProfileRepository: () => ({
    findByEmail: async (email: string) =>
      ok(email.toLowerCase() === session.profileEmail ? profileFor(session.profileEmail, session.role) : null),
    findById: async () => ok(null),
    countEnabledAdmins: async () => ok(2),
    listUsers: async () => ok([]),
  }),
}));

vi.mock("@/modules/access/adapters/supabase/auth-admin", () => ({
  createSupabaseAuthAdmin: () => ({ invite: async () => ok(true) }),
}));

vi.mock("@/app/_lib/origin", () => ({ requestOrigin: async () => "http://localhost:3000" }));

/** Every export of a module replaced by a use case that succeeds: what runs after `authorize` doesn't matter here. */
async function stubbedUseCases(load: () => Promise<Record<string, unknown>>) {
  const original = await load();
  return Object.fromEntries(Object.keys(original).map((name) => [name, vi.fn(async () => ok(null))]));
}
vi.mock("@/modules/case-study", () => stubbedUseCases(() => vi.importActual("@/modules/case-study")));
vi.mock("@/modules/material", () => stubbedUseCases(() => vi.importActual("@/modules/material")));

const caseStudies = await import("@/app/(tool)/case-studies/actions");
const clients = await import("@/app/(tool)/clients/actions");
const organization = await import("@/app/(tool)/organization/actions");

const OWNERS: readonly Role[] = ["owner_designer", "admin"];
const ADMIN: readonly Role[] = ["admin"];

type Action = (input: unknown) => Promise<{ ok: boolean; status?: number }>;

/** Server action → the roles allowed to call it. Every exported action of the three files must be here. */
const EXPECTED: Record<string, { call: Action; allowed: readonly Role[] }> = {
  ...Object.fromEntries(Object.entries(caseStudies).map(([name, call]) => [`case-studies.${name}`, { call: call as Action, allowed: OWNERS }])),
  ...Object.fromEntries(Object.entries(clients).map(([name, call]) => [`clients.${name}`, { call: call as Action, allowed: OWNERS }])),
  ...Object.fromEntries(Object.entries(organization).map(([name, call]) => [`organization.${name}`, { call: call as Action, allowed: ADMIN }])),
};

/** The roles a person can hold. `system` is the worker's actor: it can't sign in, so it never gets this far (below). */
const ROLES: readonly Role[] = ["owner_designer", "account_sales_social", "admin"];

const cells = Object.entries(EXPECTED).flatMap(([name, { call, allowed }]) =>
  ROLES.map((role) => ({ name, call, role, allowed: allowed.includes(role) })),
);

beforeEach(() => {
  session.email = "persona@menatcode.it";
  session.profileEmail = "persona@menatcode.it";
  session.role = "owner_designer";
  session.disabledAt = null;
});

describe("permission suite through the real actor resolver (Story 6.4)", () => {
  it("covers every server action of the tool", () => {
    expect(Object.keys(EXPECTED).length).toBe(
      Object.keys(caseStudies).length + Object.keys(clients).length + Object.keys(organization).length,
    );
  });

  it.each(cells)("$name as $role → allowed: $allowed", async ({ call, role, allowed }) => {
    session.role = role;
    const result = await call({});
    if (allowed) {
      // Past the policy: the use case ran (ok) or rejected the empty input (400), never 401/403.
      expect(result.ok || (result.status !== 401 && result.status !== 403)).toBe(true);
    } else {
      expect(result).toMatchObject({ ok: false, status: 403 });
    }
  });

  it.each(Object.entries(EXPECTED))("%s without a session → 401", async (_, { call }) => {
    session.email = null;
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(EXPECTED))("%s with a session on the system profile → 401 (it can't sign in)", async (_, { call }) => {
    session.role = "system";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(EXPECTED))("%s with a session but no profile → 401", async (_, { call }) => {
    session.email = "sconosciuto@menatcode.it";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it.each(Object.entries(EXPECTED))("%s from a removed (disabled) admin → 401", async (_, { call }) => {
    session.role = "admin";
    session.disabledAt = "2026-10-28T10:00:00Z";
    expect(await call({})).toMatchObject({ ok: false, status: 401 });
  });

  it("matches the session to the profile case-insensitively", async () => {
    session.email = "Persona@MenatCode.it";
    session.role = "admin";
    const result = await organization.changeJobTitle({});
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe("no role, admin included, changes a guardrail or a permission (Story 6.4, NFR3)", () => {
  it("has no server action for permissions or guardrails", () => {
    const names = Object.keys(EXPECTED).join(" ");
    expect(names).not.toMatch(/permission|guardrail|policy|matrix/i);
  });

  it("denies 'change permissions or guardrails' to every role", async () => {
    const { authorize } = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
    for (const role of [...ROLES, "system"] as const) {
      const decision = authorize({ ...profileFor("x@menatcode.it", role) }, "change permissions or guardrails");
      expect(decision.ok).toBe(false);
    }
  });

  it("gives account/sales/social no write action: no create, edit, approve, delete or client change", () => {
    const writable = cells.filter((c) => c.role === "account_sales_social" && c.allowed);
    expect(writable).toEqual([]);
  });
});
