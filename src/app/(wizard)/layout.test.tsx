import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { it as dict } from "@/shared/i18n/it";
import { err, ok, type Result } from "@/shared/result";

const getActor = vi.fn<() => Promise<Result<Actor>>>();

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("@/modules/case-study", () => ({ listReadyDrafts: vi.fn() }));
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor() };
});

const { default: WizardLayout } = await import("./layout");

const NO_ACTOR = dict.shell.noActor;

const actor = (role: Actor["role"]): Actor => ({
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev@example.it",
  displayName: "Dev",
  role,
});

const renderLayout = async () => renderToStaticMarkup(await WizardLayout({ children: <p>content</p> }));

beforeEach(() => getActor.mockReset());

describe("WizardLayout", () => {
  it("renders the content full screen with no sidebar or nav", async () => {
    getActor.mockResolvedValue(ok(actor("owner_designer")));
    const html = await renderLayout();
    expect(html.startsWith("<p>content</p>")).toBe(true);
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<aside");
  });

  it("mounts the draft-ready toast for the roles that may generate, and no other (Story 3.8)", async () => {
    for (const role of ["owner_designer", "admin"] as const) {
      getActor.mockResolvedValue(ok(actor(role)));
      expect(await renderLayout()).toContain(`aria-label="${dict.draftReady.region}"`);
    }
    getActor.mockResolvedValue(ok(actor("account_sales_social")));
    expect(await renderLayout()).toBe("<p>content</p>");
  });

  it("redirects to sign-in on UNAUTHENTICATED", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    await expect(renderLayout()).rejects.toThrow("REDIRECT /sign-in");
  });

  it("renders only the no-actor message when the profile can't be read", async () => {
    getActor.mockResolvedValue(err({ code: "PROFILE_LOOKUP_FAILED", message: "m" }));
    const html = await renderLayout();
    expect(html).toContain(NO_ACTOR);
    expect(html).not.toContain("content");
  });
});
