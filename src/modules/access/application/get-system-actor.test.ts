import { describe, expect, it, vi } from "vitest";
import { SYSTEM_ACTOR_ID, type Profile } from "@/modules/access/domain/actor";
import { err, ok } from "@/shared/result";
import { makeGetSystemActor } from "./get-system-actor";
import type { ProfileRepository } from "./ports";

const system: Profile = {
  id: SYSTEM_ACTOR_ID,
  email: "system@mac-recap.invalid",
  displayName: "System",
  role: "system",
  disabledAt: null,
  jobTitle: null,
  designerRequestedAt: null,
};

function fakeRepository(rows: Profile[]): ProfileRepository & { findById: ReturnType<typeof vi.fn> } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    findById: vi.fn(async (id: string) => ok(byId.get(id) ?? null)),
    findByEmail: vi.fn(),
    create: vi.fn(),
    listUsers: vi.fn(),
    countEnabledAdmins: vi.fn(),
    setRole: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
  };
}

describe("getSystemActor", () => {
  it("resolves the seeded system profile", async () => {
    const repo = fakeRepository([system]);
    expect(await makeGetSystemActor(repo)()).toEqual(
      ok({ id: SYSTEM_ACTOR_ID, email: system.email, displayName: "System", role: "system" }),
    );
    expect(repo.findById).toHaveBeenCalledWith(SYSTEM_ACTOR_ID);
  });

  it.each([
    ["missing", []],
    ["disabled", [{ ...system, disabledAt: "2026-10-16T10:00:00Z" }]],
    ["not system", [{ ...system, role: "owner_designer" as const }]],
  ] as const)("returns UNAUTHENTICATED when the profile is %s", async (_label, rows) => {
    const result = await makeGetSystemActor(fakeRepository([...rows]))();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("reads the profile on every call", async () => {
    const repo = fakeRepository([system]);
    const getSystemActor = makeGetSystemActor(repo);
    await getSystemActor();
    await getSystemActor();
    expect(repo.findById).toHaveBeenCalledTimes(2);
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "PROFILE_LOOKUP_FAILED", message: "down" });
    expect(await makeGetSystemActor({ ...fakeRepository([]), findById: async () => failure })()).toEqual(failure);
  });
});
