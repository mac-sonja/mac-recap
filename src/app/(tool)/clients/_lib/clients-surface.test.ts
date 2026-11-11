import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, Role } from "@/modules/access";
import { ok, type Result } from "@/shared/result";

const getActor = vi.fn<() => Promise<Result<Actor>>>();

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
// The real policy and landing: only the actor's resolution is stubbed.
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor() };
});

const { requireSurface } = await import("@/app/_lib/surface");
const { CLIENTS_SURFACE, clientsAccess } = await import("./clients-surface");

const actor = (role: Role): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev@example.it",
  displayName: "Dev",
  role,
});

beforeEach(() => getActor.mockReset());

describe("CLIENTS_SURFACE against the real policy (Story 5.9b)", () => {
  it.each([
    ["owner_designer", "/home"],
    ["admin", "/home"],
    ["account_sales_social", "/library"],
  ] as const)("lets %s in", async (role, landing) => {
    getActor.mockResolvedValue(ok(actor(role)));
    expect(await requireSurface(CLIENTS_SURFACE)).toEqual({ actor: actor(role), landing });
  });

  it.each(["system", "guest"])("never lets %s in (a role with neither use and no UI): no shell", async (role) => {
    getActor.mockResolvedValue(ok(actor(role as Role)));
    expect(await requireSurface(CLIENTS_SURFACE)).toBeNull();
  });

  it("redirects to the landing when the policy allows neither use", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    // Only the full use: account/sales/social may not `list clients`.
    await expect(requireSurface(CLIENTS_SURFACE.slice(0, 1))).rejects.toThrow("REDIRECT /library");
    // Only the pack on a status it may not download.
    await expect(requireSurface([{ action: "download client pack", resource: { status: "draft" } }])).rejects.toThrow("REDIRECT /library");
  });
});

describe("clientsAccess (Story 5.9b)", () => {
  it.each([
    ["owner_designer", "full"],
    ["admin", "full"],
    ["account_sales_social", "read-only"],
    ["system", null],
    ["guest", null],
  ] as const)("%s → %s", (role, access) => {
    expect(clientsAccess(actor(role as Role))).toBe(access);
  });
});
