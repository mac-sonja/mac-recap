import { describe, expect, it, vi } from "vitest";
import { DEV_ACTOR_ID, type Profile } from "@/modules/access/domain/actor";
import { err, ok } from "@/shared/result";
import { makeGetActor } from "./get-actor";
import type { ProfileRepository } from "./ports";

const dev: Profile = {
  id: DEV_ACTOR_ID,
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
  disabledAt: null,
};

/** In-memory ProfileRepository fake. */
function fakeRepository(rows: Profile[]): ProfileRepository & { findById: ReturnType<typeof vi.fn> } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { findById: vi.fn(async (id: string) => ok(byId.get(id) ?? null)) };
}

describe("getActor", () => {
  it("resolves the dev owner/designer from profile", async () => {
    const repo = fakeRepository([dev]);
    const result = await makeGetActor(repo)();
    expect(result).toEqual(
      ok({ id: DEV_ACTOR_ID, email: dev.email, displayName: dev.displayName, role: "owner_designer" }),
    );
    expect(repo.findById).toHaveBeenCalledWith(DEV_ACTOR_ID);
  });

  it("returns UNAUTHENTICATED when the dev profile is missing", async () => {
    const result = await makeGetActor(fakeRepository([]))();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns UNAUTHENTICATED when the dev profile is disabled", async () => {
    const result = await makeGetActor(fakeRepository([{ ...dev, disabledAt: "2026-10-09T10:00:00Z" }]))();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("reads the profile on every call (no caching)", async () => {
    const rows = [dev];
    const repo = fakeRepository(rows);
    const getActor = makeGetActor(repo);
    const first = await getActor();
    repo.findById.mockResolvedValueOnce(ok({ ...dev, role: "account_sales_social" }));
    const second = await getActor();
    expect(repo.findById).toHaveBeenCalledTimes(2);
    expect(first.ok && first.value.role).toBe("owner_designer");
    expect(second.ok && second.value.role).toBe("account_sales_social");
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "PROFILE_LOOKUP_FAILED", message: "down" });
    const repo: ProfileRepository = { findById: async () => failure };
    expect(await makeGetActor(repo)()).toEqual(failure);
  });
});
