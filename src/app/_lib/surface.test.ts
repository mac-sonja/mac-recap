import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, Role } from "@/modules/access";
import { err, ok, type Result } from "@/shared/result";

const getActor = vi.fn<() => Promise<Result<Actor>>>();

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor() };
});

const { requireSurface, resolveShellActor } = await import("./surface");

const actor = (role: Role): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev@example.it",
  displayName: "Dev",
  role,
});

beforeEach(() => getActor.mockReset());

describe("resolveShellActor", () => {
  it("returns the actor with its landing", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    expect(await resolveShellActor()).toEqual({ actor: actor("owner_designer"), landing: "/case-studies" });
  });

  it.each([
    ["UNAUTHENTICATED", err({ code: "UNAUTHENTICATED", message: "m" })],
    ["a lookup error", err({ code: "PROFILE_LOOKUP_FAILED", message: "m" })],
  ] as const)("is null on %s", async (_, result) => {
    getActor.mockResolvedValue(result);
    expect(await resolveShellActor()).toBeNull();
  });

  it("is null for a role with no UI (system)", async () => {
    getActor.mockResolvedValue(ok(actor("system")));
    expect(await resolveShellActor()).toBeNull();
  });
});

describe("requireSurface", () => {
  it("lets an allowed actor through", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    expect(await requireSurface("list cases")).toMatchObject({ landing: "/case-studies" });
  });

  it("redirects to the landing when the policy denies the surface", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    await expect(requireSurface("manage users")).rejects.toThrow("REDIRECT /case-studies");
  });

  it("redirects an account/sales/social actor away from the case list", async () => {
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    await expect(requireSurface("list cases")).rejects.toThrow("REDIRECT /library");
  });

  it("returns null with no actor, without redirecting", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    expect(await requireSurface("list cases")).toBeNull();
  });
});
