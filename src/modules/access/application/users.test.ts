import { describe, expect, it, vi } from "vitest";
import type { Actor, Profile } from "@/modules/access/domain/actor";
import { err, ok } from "@/shared/result";
import type { AuthAdmin, ProfileRepository } from "./ports";
import { makeUsers } from "./users";

const admin: Actor = { id: "00000000-0000-4000-8000-0000000000a1", email: "admin@menatcode.it", displayName: "Admin", role: "admin" };

const row = (id: string, over: Partial<Profile> = {}): Profile => ({
  id: `00000000-0000-4000-8000-${Buffer.from(id).toString("hex").slice(0, 12).padStart(12, "0")}`,
  email: `${id}@menatcode.it`,
  displayName: id,
  role: "account_sales_social",
  disabledAt: null,
  jobTitle: null,
  designerRequestedAt: null,
  ...over,
});

function setup(rows: Profile[], invited = true) {
  const profiles = {
    findById: vi.fn(async (id: string) => ok(rows.find((r) => r.id === id) ?? null)),
    findByEmail: vi.fn(async (email: string) => ok(rows.find((r) => r.email === email) ?? null)),
    create: vi.fn(async (p) => ok(row("new", { ...p }))),
    listUsers: vi.fn(),
    countEnabledAdmins: vi.fn(async () => ok(rows.filter((r) => r.role === "admin" && r.disabledAt === null).length)),
    setRole: vi.fn(async (id: string, role) => ok({ ...rows.find((r) => r.id === id)!, role, designerRequestedAt: null })),
    disable: vi.fn(async () => ok(undefined)),
    enable: vi.fn(async (id: string, displayName: string, role) => ok({ ...rows.find((r) => r.id === id)!, displayName, role, disabledAt: null })),
  } satisfies ProfileRepository;
  const authAdmin = { invite: vi.fn(async () => ok(invited)) } satisfies AuthAdmin;
  return { profiles, authAdmin, users: makeUsers({ profiles, authAdmin }) };
}

const input = { firstName: "Luca", lastName: "Bianchi", email: " Luca@Cliente.it ", role: "account_sales_social" };

describe("add", () => {
  it("creates the profile with the chosen role and sends the invite back to /auth/confirm", async () => {
    const { users, profiles, authAdmin } = setup([]);
    const result = await users.add(admin, input, "https://recap.example");
    expect(result.ok && result.value.invited).toBe(true);
    expect(profiles.create).toHaveBeenCalledWith({
      email: "luca@cliente.it",
      displayName: "Luca Bianchi",
      role: "account_sales_social",
      jobTitle: null,
      designerRequestedAt: null,
    });
    expect(authAdmin.invite).toHaveBeenCalledWith("luca@cliente.it", "https://recap.example/auth/confirm");
  });

  it("refuses the system role and names invalid fields", async () => {
    const { users, profiles } = setup([]);
    const result = await users.add(admin, { ...input, role: "system", email: "x" }, "https://x");
    expect(!result.ok && result.error).toMatchObject({ code: "INVALID_INPUT", details: { fields: ["email", "role"] } });
    expect(profiles.create).not.toHaveBeenCalled();
  });

  it("refuses an address that already has an enabled account", async () => {
    const { users } = setup([row("luca", { email: "luca@cliente.it" })]);
    const result = await users.add(admin, input, "https://x");
    expect(!result.ok && result.error.code).toBe("USER_EXISTS");
  });

  it("brings back a removed user with the new role", async () => {
    const removed = row("luca", { email: "luca@cliente.it", disabledAt: "2026-10-01T00:00:00Z" });
    const { users, profiles } = setup([removed], false);
    const result = await users.add(admin, { ...input, role: "owner_designer" }, "https://x");
    expect(profiles.enable).toHaveBeenCalledWith(removed.id, "Luca Bianchi", "owner_designer");
    expect(result.ok && result.value.invited).toBe(false);
  });
});

describe("changeRole", () => {
  it("approves a designer request", async () => {
    const waiting = row("anna", { designerRequestedAt: "2026-10-28T09:00:00Z" });
    const { users, profiles } = setup([waiting]);
    const result = await users.changeRole(admin, { profileId: waiting.id, role: "owner_designer" });
    expect(profiles.setRole).toHaveBeenCalledWith(waiting.id, "owner_designer");
    expect(result.ok && result.value.designerRequestedAt).toBeNull();
  });

  it("refuses to demote the last admin, themself included", async () => {
    const only = row("a1", { role: "admin" });
    const { users, profiles } = setup([only]);
    const result = await users.changeRole(admin, { profileId: only.id, role: "owner_designer" });
    expect(!result.ok && result.error.code).toBe("LAST_ADMIN");
    expect(profiles.setRole).not.toHaveBeenCalled();
  });

  it("lets an admin step down when another admin remains", async () => {
    const a1 = row("a1", { role: "admin" });
    const { users } = setup([a1, row("a2", { role: "admin" })]);
    expect((await users.changeRole(admin, { profileId: a1.id, role: "account_sales_social" })).ok).toBe(true);
  });

  it("never touches the system profile or a removed one", async () => {
    const system = row("1", { role: "system" });
    const removed = row("old", { disabledAt: "2026-10-01T00:00:00Z" });
    const { users } = setup([system, removed]);
    for (const target of [system, removed]) {
      const result = await users.changeRole(admin, { profileId: target.id, role: "admin" });
      expect(!result.ok && result.error.code).toBe("NOT_FOUND");
    }
  });

  it("refuses the system role", async () => {
    const { users } = setup([row("anna")]);
    const result = await users.changeRole(admin, { profileId: row("anna").id, role: "system" });
    expect(!result.ok && result.error.code).toBe("INVALID_INPUT");
  });
});

describe("remove", () => {
  it("disables the profile", async () => {
    const anna = row("anna");
    const { users, profiles } = setup([anna]);
    expect(await users.remove(admin, { profileId: anna.id })).toEqual(ok(undefined));
    expect(profiles.disable).toHaveBeenCalledWith(anna.id);
  });

  it("refuses to remove the last admin", async () => {
    const only = row("a1", { role: "admin" });
    const { users, profiles } = setup([only]);
    const result = await users.remove(admin, { profileId: only.id });
    expect(!result.ok && result.error.code).toBe("LAST_ADMIN");
    expect(profiles.disable).not.toHaveBeenCalled();
  });

  it("passes the database backstop through", async () => {
    const a1 = row("a1", { role: "admin" });
    const { users, profiles } = setup([a1, row("a2", { role: "admin" })]);
    profiles.disable.mockResolvedValueOnce(err({ code: "LAST_ADMIN", message: "m" }) as never);
    const result = await users.remove(admin, { profileId: a1.id });
    expect(!result.ok && result.error.code).toBe("LAST_ADMIN");
  });
});
