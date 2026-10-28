import { describe, expect, it, vi } from "vitest";
import type { Profile } from "@/modules/access/domain/actor";
import { err, ok } from "@/shared/result";
import type { AuthGateway, ProfileRepository, SessionUser } from "./ports";
import { makeSession } from "./session";

const now = () => new Date("2026-10-28T09:00:00Z");

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: "00000000-0000-4000-8000-000000000010",
  email: "anna@menatcode.it",
  displayName: "Anna",
  role: "account_sales_social",
  disabledAt: null,
  jobTitle: "Account",
  designerRequestedAt: null,
  ...over,
});

const metadata = { display_name: "Anna", job_title: "Designer", designer_requested: true };

function fakes(rows: Profile[], user: SessionUser | null = null) {
  const profiles = {
    findById: vi.fn(),
    findByEmail: vi.fn(async (email: string) => ok(rows.find((r) => r.email === email.toLowerCase()) ?? null)),
    create: vi.fn(async (p) => {
      const created = profile({ ...p, id: "00000000-0000-4000-8000-000000000011", disabledAt: null });
      rows.push(created);
      return ok(created);
    }),
    listUsers: vi.fn(),
    countEnabledAdmins: vi.fn(),
    setRole: vi.fn(),
    setJobTitle: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
  } satisfies ProfileRepository;
  const auth = {
    currentUser: vi.fn(async () => user),
    signInWithPassword: vi.fn(async () => (user ? ok(user) : err({ code: "INVALID_CREDENTIALS", message: "x" }))),
    signUp: vi.fn(async () => ok(undefined)),
    verifyEmailLink: vi.fn(async () => (user ? ok(user) : err({ code: "LINK_INVALID", message: "x" }))),
    requestPasswordReset: vi.fn(async () => ok(undefined)),
    updatePassword: vi.fn(async () => ok(undefined)),
    signOut: vi.fn(async () => undefined),
  } satisfies AuthGateway;
  return { profiles, auth, session: makeSession({ auth, profiles, now }) };
}

describe("signIn", () => {
  it.each([
    ["owner_designer", "/home"],
    ["account_sales_social", "/library"],
    ["admin", "/home"],
  ] as const)("lands %s on %s", async (role, landing) => {
    const { session } = fakes([profile({ role })], { email: "anna@menatcode.it", metadata: {} });
    expect(await session.signIn("anna@menatcode.it", "pw")).toEqual(ok(landing));
  });

  it("passes wrong credentials through", async () => {
    const { session } = fakes([profile()]);
    const result = await session.signIn("anna@menatcode.it", "nope");
    expect(!result.ok && result.error.code).toBe("INVALID_CREDENTIALS");
  });

  it.each([
    ["a disabled profile", [profile({ disabledAt: "2026-10-28T08:00:00Z" })], "anna@menatcode.it"],
    ["the system profile", [profile({ role: "system" })], "anna@menatcode.it"],
    ["no profile, outside the domain", [], "ospite@gmail.com"],
  ])("denies %s and ends the session", async (_, rows, email) => {
    const { session, auth } = fakes(rows, { email, metadata });
    const result = await session.signIn(email, "pw");
    expect(!result.ok && result.error.code).toBe("ACCOUNT_INACTIVE");
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("creates a confirmed company sign-up's profile as account/sales/social", async () => {
    const { session, profiles } = fakes([], { email: "anna@menatcode.it", metadata });
    expect(await session.signIn("anna@menatcode.it", "pw")).toEqual(ok("/library"));
    expect(profiles.create).toHaveBeenCalledWith({
      email: "anna@menatcode.it",
      displayName: "Anna",
      role: "account_sales_social",
      jobTitle: "Designer",
      designerRequestedAt: "2026-10-28T09:00:00.000Z",
    });
  });

  it("ignores a role smuggled into the sign-up metadata", async () => {
    const { session, profiles } = fakes([], { email: "anna@menatcode.it", metadata: { ...metadata, role: "admin" } });
    await session.signIn("anna@menatcode.it", "pw");
    expect(profiles.create.mock.calls[0][0].role).toBe("account_sales_social");
  });
});

describe("signUp", () => {
  const input = { firstName: "Anna", lastName: "Rossi", email: "Anna@menatcode.it", team: "designer", password: "una-password" };

  it("sends the confirmation back to /auth/confirm with metadata and no role", async () => {
    const { session, auth } = fakes([]);
    expect(await session.signUp(input, "https://recap.example")).toEqual(ok(undefined));
    expect(auth.signUp).toHaveBeenCalledWith(
      "anna@menatcode.it",
      "una-password",
      { display_name: "Anna Rossi", job_title: "Designer", designer_requested: true },
      "https://recap.example/auth/confirm",
    );
  });

  it("refuses another domain without calling Supabase", async () => {
    const { session, auth } = fakes([]);
    const result = await session.signUp({ ...input, email: "anna@gmail.com" }, "https://x");
    expect(!result.ok && result.error.code).toBe("EMAIL_DOMAIN_NOT_ALLOWED");
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("names the invalid fields", async () => {
    const { session } = fakes([]);
    const altro = await session.signUp({ ...input, team: "altro" }, "https://x");
    expect(!altro.ok && altro.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["otherTitle"] } });
    const short = await session.signUp({ ...input, password: "x" }, "https://x");
    expect(!short.ok && short.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["password"] } });
  });
});

describe("confirmEmailLink", () => {
  it("lands a confirmed sign-up on its role's page", async () => {
    const { session } = fakes([], { email: "anna@menatcode.it", metadata });
    expect(await session.confirmEmailLink({ tokenHash: "h", type: "signup" })).toEqual(ok("/library"));
  });

  it.each(["invite", "recovery"] as const)("sends %s links to set a password", async (type) => {
    const { session } = fakes([profile()], { email: "anna@menatcode.it", metadata: {} });
    expect(await session.confirmEmailLink({ tokenHash: "h", type })).toEqual(ok("/set-password"));
  });

  it("denies an invite whose profile was removed", async () => {
    const { session } = fakes([profile({ email: "ext@cliente.it", disabledAt: "x" })], { email: "ext@cliente.it", metadata: {} });
    const result = await session.confirmEmailLink({ tokenHash: "h", type: "invite" });
    expect(!result.ok && result.error.code).toBe("ACCOUNT_INACTIVE");
  });
});

describe("sessionState", () => {
  it("is none without a session, inactive without a usable profile, active otherwise", async () => {
    expect(await fakes([]).session.sessionState()).toEqual({ kind: "none" });
    const user = { email: "anna@menatcode.it", metadata: {} };
    expect(await fakes([], user).session.sessionState()).toEqual({ kind: "inactive" });
    expect(await fakes([profile({ role: "admin" })], user).session.sessionState()).toEqual({ kind: "active", landing: "/home" });
  });
});

describe("setPassword", () => {
  it("needs a session and a long enough password", async () => {
    expect((await fakes([]).session.setPassword("una-password")).ok).toBe(false);
    const user = { email: "anna@menatcode.it", metadata: {} };
    const short = await fakes([profile()], user).session.setPassword("corta");
    expect(!short.ok && short.error.code).toBe("INVALID_INPUT");
    expect(await fakes([profile()], user).session.setPassword("una-password")).toEqual(ok("/library"));
  });
});

describe("requestPasswordReset", () => {
  it("never reveals whether the address has an account", async () => {
    const { session, auth } = fakes([]);
    auth.requestPasswordReset.mockResolvedValueOnce(err({ code: "AUTH_FAILED", message: "x" }) as never);
    expect(await session.requestPasswordReset("chiunque@gmail.com", "https://x")).toEqual(ok(undefined));
  });
});
