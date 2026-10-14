import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { err, ok, type Result } from "@/shared/result";

const getActor = vi.fn<() => Promise<Result<Actor>>>();

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("@/modules/access", async () => {
  const actual = await vi.importActual<typeof import("@/modules/access")>("@/modules/access");
  return { ...actual, getActor: () => getActor() };
});

const { default: WizardLayout } = await import("./layout");

const NO_ACTOR = "Non è stato possibile identificare il tuo profilo.";

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

  it("renders only the no-actor message on UNAUTHENTICATED", async () => {
    getActor.mockResolvedValue(err({ code: "UNAUTHENTICATED", message: "m" }));
    const html = await renderLayout();
    expect(html).toContain(NO_ACTOR);
    expect(html).not.toContain("content");
  });
});
