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
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor() };
});

const { default: WizardLayout } = await import("./layout");

const NO_ACTOR = dict.shell.noActor;

const renderLayout = async () => renderToStaticMarkup(await WizardLayout({ children: <p>content</p> }));

beforeEach(() => getActor.mockReset());

describe("WizardLayout", () => {
  it("renders the content full screen with no sidebar or nav", async () => {
    getActor.mockResolvedValue(
      ok({ id: "00000000-0000-4000-8000-000000000002", email: "dev@example.it", displayName: "Dev", role: "owner_designer" }),
    );
    const html = await renderLayout();
    expect(html).toBe("<p>content</p>");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<aside");
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
