import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor, ListedUser, Role } from "@/modules/access";
import { ok, type Result } from "@/shared/result";

const getActor = vi.fn<() => Promise<Result<Actor>>>();
const listUsers = vi.fn<() => Promise<Result<ListedUser[]>>>();

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor(), listUsers: () => listUsers() };
});

const { default: UsersPage } = await import("./page");

const actor = (role: Role): Actor => ({ id: "00000000-0000-4000-8000-0000000000a1", email: "a@menatcode.it", displayName: "Ada", role });

const user = (over: Partial<ListedUser>): ListedUser => ({
  id: "00000000-0000-4000-8000-0000000000b1",
  email: "bea@menatcode.it",
  displayName: "Bea Neri",
  role: "account_sales_social",
  disabledAt: null,
  jobTitle: "Designer",
  designerRequestedAt: "2026-10-28T09:00:00Z",
  createdAt: "2026-10-28T09:00:00Z",
  ...over,
});

beforeEach(() => {
  getActor.mockReset();
  listUsers.mockReset().mockResolvedValue(ok([user({}), user({ id: "00000000-0000-4000-8000-0000000000a1", displayName: "Ada", role: "admin", designerRequestedAt: null, jobTitle: null })]));
});

describe("UsersPage", () => {
  it.each(["owner_designer", "account_sales_social"] as const)("sends %s to its landing", async (role) => {
    getActor.mockResolvedValue(ok(actor(role)));
    await expect(UsersPage()).rejects.toThrow("REDIRECT /");
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("lists name, email, role and added-on date for the admin", async () => {
    getActor.mockResolvedValue(ok(actor("admin")));
    const html = renderToStaticMarkup(await UsersPage());
    expect(html).toContain("Bea Neri");
    expect(html).toContain("bea@menatcode.it");
    expect(html).toContain("28 ott 2026");
    expect(html).toContain("Aggiungi utente");
    expect(html).toContain("(tu)");
  });

  it("flags a designer request with Approva, and never offers the system role", async () => {
    getActor.mockResolvedValue(ok(actor("admin")));
    const html = renderToStaticMarkup(await UsersPage());
    expect(html).toContain("Chiede di essere designer");
    expect(html).toContain('aria-label="Approva Bea Neri come designer"');
    expect(html).not.toMatch(/value="system"/);
  });
});
