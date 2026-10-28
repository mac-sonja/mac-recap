import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/modules/access/domain/actor";
import { err, ok } from "@/shared/result";
import { makeGetActor } from "./get-actor";
import type { AuthGateway, ProfileRepository, SessionUser } from "./ports";

const anna: Profile = {
  id: "00000000-0000-4000-8000-000000000010",
  email: "anna@menatcode.it",
  displayName: "Anna",
  role: "owner_designer",
  disabledAt: null,
  jobTitle: "Designer",
  designerRequestedAt: null,
};

/** In-memory ProfileRepository fake, matching email case-insensitively. */
function fakeRepository(rows: Profile[]) {
  return {
    findById: vi.fn(async (id: string) => ok(rows.find((r) => r.id === id) ?? null)),
    findByEmail: vi.fn(async (email: string) => ok(rows.find((r) => r.email.toLowerCase() === email.toLowerCase()) ?? null)),
    create: vi.fn(),
    listUsers: vi.fn(),
    countEnabledAdmins: vi.fn(),
    setRole: vi.fn(),
    setJobTitle: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
  } satisfies ProfileRepository;
}

function fakeAuth(user: SessionUser | null): AuthGateway {
  return {
    currentUser: vi.fn(async () => user),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    verifyEmailLink: vi.fn(),
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    signOut: vi.fn(),
  };
}

const session = (email: string): SessionUser => ({ email, metadata: {} });

const expectUnauthenticated = (result: Awaited<ReturnType<ReturnType<typeof makeGetActor>>>) => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
};

describe("getActor", () => {
  it("resolves the session's profile", async () => {
    const repo = fakeRepository([anna]);
    const result = await makeGetActor(fakeAuth(session(anna.email)), repo)();
    expect(result).toEqual(ok({ id: anna.id, email: anna.email, displayName: "Anna", role: "owner_designer" }));
  });

  it("matches the session email case-insensitively", async () => {
    const result = await makeGetActor(fakeAuth(session("Anna@MenAtCode.it")), fakeRepository([anna]))();
    expect(result.ok && result.value.id).toBe(anna.id);
  });

  it("returns UNAUTHENTICATED without a session", async () => {
    const repo = fakeRepository([anna]);
    expectUnauthenticated(await makeGetActor(fakeAuth(null), repo)());
    expect(repo.findByEmail).not.toHaveBeenCalled();
  });

  it("returns UNAUTHENTICATED for a session with no profile", async () => {
    expectUnauthenticated(await makeGetActor(fakeAuth(session("nuovo@menatcode.it")), fakeRepository([anna]))());
  });

  it("returns UNAUTHENTICATED when the profile is disabled", async () => {
    const disabled = { ...anna, disabledAt: "2026-10-28T10:00:00Z" };
    expectUnauthenticated(await makeGetActor(fakeAuth(session(anna.email)), fakeRepository([disabled]))());
  });

  it("never resolves the system profile from a session", async () => {
    const system = { ...anna, role: "system" as const };
    expectUnauthenticated(await makeGetActor(fakeAuth(session(anna.email)), fakeRepository([system]))());
  });

  it("reads the role from profile on every call (no caching)", async () => {
    const repo = fakeRepository([anna]);
    const getActor = makeGetActor(fakeAuth(session(anna.email)), repo);
    const first = await getActor();
    repo.findByEmail.mockResolvedValueOnce(ok({ ...anna, role: "account_sales_social" }));
    const second = await getActor();
    expect(repo.findByEmail).toHaveBeenCalledTimes(2);
    expect(first.ok && first.value.role).toBe("owner_designer");
    expect(second.ok && second.value.role).toBe("account_sales_social");
  });

  it("passes a repository failure through", async () => {
    const failure = err({ code: "PROFILE_LOOKUP_FAILED", message: "down" });
    const repo = { ...fakeRepository([]), findByEmail: async () => failure };
    expect(await makeGetActor(fakeAuth(session(anna.email)), repo)()).toEqual(failure);
  });
});
